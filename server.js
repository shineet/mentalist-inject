import express from "express";
import http from "http";
import { Server } from "socket.io";
import fs from "fs";
import path from "path";
import { sequenceFor, defaultsFor, inlineAll } from "./lib/sequence.js";
import { renderSequence } from "./lib/render.js";
import { cityFor } from "./lib/area-codes.js";

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

/** bump on deploy */
const REVISION = "v262-wipe-the-tab";

// Persistence (v87): room settings/messages used to live in memory only, so
// every deploy (server restart) wiped them back to hardcoded defaults. Now
// backed by a small file on a mounted Fly volume (see fly.toml [[mounts]],
// volume "mindgames_data" at /data) so they survive restarts and deploys.
// DATA_DIR falls back to a local folder for dev machines that don't have the
// volume mounted -- all file I/O below is try/caught and non-fatal: if disk
// access ever fails for any reason, the show keeps running in-memory exactly
// as it always did, it just won't survive the next restart.
const DATA_DIR = process.env.DATA_DIR || "/data";
const STATE_FILE = path.join(DATA_DIR, "state.json");

// Defaults (edit if you want)
const DEFAULT_REVIEW_URL = "https://g.page/r/CfEvBpaR9455EAI/review";
const DEFAULT_REVEAL_URL = "https://11z.co/12902/cat-houdini01.jpg";
const DEFAULT_REVEAL_MUSIC_URL = "/music.mp3";
const DEFAULT_REVIEW_MUSIC_URL = "/review.mp3";
// client.jpg, not client.png. The file in public/ is a .jpg and always was;
// the default pointed at a .png that 404s, so a room with no photo set asked
// for nothing and the audience page hid the image -- which reads as "the URL I
// gave is not working" rather than "no URL reached the server".
const DEFAULT_CLIENT_IMAGE_URL = "/client.jpg";
const DEFAULT_ROOM = "SHOW";

const io = new Server(server, {
  cors: { origin: true },
  pingInterval: 15000,
  pingTimeout: 45000,
  maxHttpBufferSize: 1e6,
});

app.set("trust proxy", 1);

// Hard no-cache for show safety
app.use((req, res, next) => {
  const p = req.path || "";
  const isCodeOrPage =
    p.endsWith(".html") || p.endsWith(".js") || p.endsWith(".css") || p.endsWith(".json");
  if (isCodeOrPage) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");
  }
  next();
});

app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

// ── Voiceover clips, uploaded from the host app ───────────────────────────
//
// A post-show with a recording per message used to mean hand-building the page
// from files sent over. Uploading them here instead means a sequence can be
// built and changed without anyone touching code.
//
// Stored on the same Fly volume as the room state and served from the same
// origin as the page that plays them, so there is no CORS to arrange and no
// third-party key to hold. Clips are small; a whole show's worth is a few
// hundred kilobytes against a volume already holding a JSON file.
const MEDIA_DIR = path.join(DATA_DIR, "media");
try { fs.mkdirSync(MEDIA_DIR, { recursive: true }); } catch {}

// Served read-only. Deliberately a separate path from express.static("public")
// so an upload can never shadow a file in the repo.
app.use("/media", express.static(MEDIA_DIR, { maxAge: "1h" }));

const UPLOAD_TYPES = {
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
  "audio/aac": ".m4a",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
};

// Raw bytes rather than multipart: one file per request, and the alternative is
// a parser dependency for a form this only ever sends from one place.
app.post("/api/upload",
  express.raw({ type: Object.keys(UPLOAD_TYPES), limit: "12mb" }),
  (req, res) => {
    // The server is public, so this is not open. The token lives in a Fly
    // secret and is entered once in the app -- never in the repo, which is
    // public too.
    const expected = process.env.UPLOAD_TOKEN || "";
    if (!expected || req.get("x-upload-token") !== expected) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    const ext = UPLOAD_TYPES[(req.get("content-type") || "").split(";")[0].trim()];
    if (!ext) return res.status(415).json({ ok: false, error: "unsupported type" });
    if (!req.body || !req.body.length) return res.status(400).json({ ok: false, error: "empty" });

    // The caller's name is a label, not a path. Anything that could climb out
    // of the media folder is stripped rather than rejected, and a timestamp
    // keeps two clips of the same name apart.
    const label = String(req.get("x-upload-name") || "clip")
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 40) || "clip";
    const name = `${label}-${Date.now().toString(36)}${ext}`;

    try {
      fs.writeFileSync(path.join(MEDIA_DIR, name), req.body);
    } catch (e) {
      console.error("upload failed:", e.message);
      return res.status(500).json({ ok: false, error: "write failed" });
    }
    res.json({ ok: true, url: `/media/${name}`, bytes: req.body.length });
  });

// What is already uploaded, so a slide can be pointed at an existing clip
// instead of the same file being sent twice.
app.get("/api/media", (req, res) => {
  let files = [];
  try {
    files = fs.readdirSync(MEDIA_DIR)
      .filter((f) => !f.startsWith("."))
      .map((f) => {
        const st = fs.statSync(path.join(MEDIA_DIR, f));
        return { url: `/media/${f}`, bytes: st.size, at: st.mtimeMs };
      })
      .sort((a, b) => b.at - a.at);
  } catch {}
  res.json({ ok: true, files });
});

app.get("/health", (_, res) => res.status(200).send("OK"));

// HTTP fallback endpoints for host controls. WebSocket remains the primary path;
// these endpoints are a safety net if a mobile browser pauses the socket.
app.post("/api/host/:action", (req, res) => {
  const action = String(req.params.action || "");
  const payload = req.body || {};
  const room = normalizeRoom(payload.room || DEFAULT_ROOM);

  try {
    if (action === "saveSettings") {
      mergeState(room, payload);
      broadcastState(room);
      return res.json({ ok: true, room, state: getState(room) });
    }

    if (action === "sendReveal") {
      mergeState(room, payload, { phase: payload?.skipAnimation ? "revealed" : "reveal_sequence" });
      broadcastState(room);
      return res.json({ ok: true, room, state: getState(room) });
    }

    if (action === "preloadKaraokeSilent") {
      const s = getState(room);
      const previousPhase = s.phase;
      mergeState(room, payload, {});
      io.to(room).emit("karaoke:preload", getState(room));
      s.phase = previousPhase;
      return res.json({ ok: true, room, state: getState(room) });
    }

    if (action === "prepareKaraoke") {
      mergeState(room, payload, { phase: "karaoke_prepare" });
      broadcastState(room);
      return res.json({ ok: true, room, state: getState(room) });
    }

    if (action === "startKaraoke") {
      mergeState(room, payload, { phase: "karaoke", karaokeStartedAt: Date.now() });
      broadcastState(room);
      return res.json({ ok: true, room, state: getState(room) });
    }

    if (action === "sendToReview") {
      mergeState(room, payload, { reviewUrl: payload?.reviewUrl ?? getState(room).reviewUrl, phase: "review" });
      resetSplashIndex(room);
      broadcastState(room);
      return res.json({ ok: true, room, state: getState(room) });
    }

    // Manual "go to the Google review page right now" trigger, for when Auto
    // redirect is off. Deliberately does NOT touch phase/mergeState/
    // broadcastState -- every audience phone is mid-whatever-content it's on
    // (Messages slide, Karaoke, Cinematic...), and re-broadcasting a phase
    // change here would re-run that phone's phase dispatch and could restart
    // or interrupt it. This is just a direct "navigate now" signal, same
    // spirit as the existing karaoke:preload broadcast below.
    if (action === "goToReview") {
      io.to(room).emit("audience:goToReview", { reviewUrl: getState(room).reviewUrl });
      return res.json({ ok: true, room });
    }

    if (action === "splashNext") {
      if (splashActionAlreadyApplied(room, payload.clientTs)) return res.json({ ok: true, room, state: getState(room) });
      const cur = Number(getState(room).clientSplash?.currentCardIndex || 0);
      mergeState(room, { clientSplash: { currentCardIndex: Math.min(cur + 1, splashMaxIndex(room)) } });
      broadcastState(room);
      return res.json({ ok: true, room, state: getState(room) });
    }

    if (action === "splashPrev") {
      if (splashActionAlreadyApplied(room, payload.clientTs)) return res.json({ ok: true, room, state: getState(room) });
      const cur = Number(getState(room).clientSplash?.currentCardIndex || 0);
      mergeState(room, { clientSplash: { currentCardIndex: Math.max(cur - 1, 0) } });
      broadcastState(room);
      return res.json({ ok: true, room, state: getState(room) });
    }

    if (action === "sendToSchoolShow") {
      mergeState(room, payload, { phase: "school_show" });
      resetSchoolShowIndex(room);
      broadcastState(room);
      return res.json({ ok: true, room, state: getState(room) });
    }

    if (action === "schoolShowNext") {
      if (schoolShowActionAlreadyApplied(room, payload.clientTs)) return res.json({ ok: true, room, state: getState(room) });
      const cur = Number(getState(room).schoolShow?.currentCardIndex || 0);
      mergeState(room, { schoolShow: { currentCardIndex: Math.min(cur + 1, schoolShowMaxIndex(room)) } });
      broadcastState(room);
      return res.json({ ok: true, room, state: getState(room) });
    }

    if (action === "schoolShowPrev") {
      if (schoolShowActionAlreadyApplied(room, payload.clientTs)) return res.json({ ok: true, room, state: getState(room) });
      const cur = Number(getState(room).schoolShow?.currentCardIndex || 0);
      mergeState(room, { schoolShow: { currentCardIndex: Math.max(cur - 1, 0) } });
      broadcastState(room);
      return res.json({ ok: true, room, state: getState(room) });
    }

    // Interactive routine. Mirrors the socket handlers above -- without these
    // the buttons would silently do nothing whenever the host's socket is down,
    // which is exactly the moment a fallback is supposed to cover.
    if (action === "startInteractive") {
      const state = getState(room);
      setState(room, { ...state, phase: "interactive", interactive: { round: -1, revealed: false } });
      broadcastState(room);
      return res.json({ ok: true, room, state: getState(room) });
    }

    if (action === "interactiveNext") {
      const state = getState(room);
      if (state.phase !== "interactive") return res.json({ ok: true, room, state });
      const total = Number(payload?.totalRounds) || 0;
      const cur = state.interactive?.round ?? -1;
      const next = total ? Math.min(cur + 1, total - 1) : cur + 1;
      setState(room, { ...state, interactive: { ...state.interactive, round: next } });
      broadcastState(room);
      return res.json({ ok: true, room, state: getState(room) });
    }

    if (action === "interactivePrev") {
      const state = getState(room);
      if (state.phase !== "interactive") return res.json({ ok: true, room, state });
      const cur = state.interactive?.round ?? -1;
      setState(room, { ...state, interactive: { round: Math.max(cur - 1, -1), revealed: false } });
      broadcastState(room);
      return res.json({ ok: true, room, state: getState(room) });
    }

    if (action === "interactiveReveal") {
      const state = getState(room);
      if (state.phase !== "interactive") return res.json({ ok: true, room, state });
      setState(room, { ...state, interactive: { ...state.interactive, revealed: true } });
      broadcastState(room);
      return res.json({ ok: true, room, state: getState(room) });
    }

    if (action === "resetPhase") {
      const state = getState(room);
      setState(room, { ...state, phase: "idle" });
      broadcastState(room);
      return res.json({ ok: true, room, state: getState(room) });
    }

    if (action === "resetAll") {
      setState(room, seededDefaultState());
      broadcastState(room);
      return res.json({ ok: true, room, state: getState(room) });
    }

    if (action === "saveAsDefault") {
      customDefaults = {
        ...customDefaults,
        ...(payload.revealMusicUrl != null ? { revealMusicUrl: payload.revealMusicUrl } : {}),
        ...(payload.reviewMusicUrl != null ? { reviewMusicUrl: payload.reviewMusicUrl } : {}),
        ...(payload.reviewUrl != null ? { reviewUrl: payload.reviewUrl } : {}),
      };
      schedulePersist();
      return res.json({ ok: true, customDefaults });
    }

    return res.status(404).json({ ok: false, error: "Unknown action" });
  } catch (err) {
    console.error("api host action failed", action, err);
    return res.status(500).json({ ok: false, error: "Action failed" });
  }
});


function normalizeRoom(value) {
  const raw = String(value || DEFAULT_ROOM).trim();
  const clean = raw.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  return clean || DEFAULT_ROOM;
}

const defaultState = () => ({
  seq: 0,
  phase: "idle", // idle | reveal_sequence | revealed | review | karaoke_prepare | karaoke | interactive
  revealType: "page", // image | page
  revealUrl: DEFAULT_REVEAL_URL,
  reviewUrl: DEFAULT_REVIEW_URL,
  revealMusicUrl: DEFAULT_REVEAL_MUSIC_URL,
  reviewMusicUrl: DEFAULT_REVIEW_MUSIC_URL,
  clientImageUrl: DEFAULT_CLIENT_IMAGE_URL,
  logoUrl: "",
  timings: { logoMs: 4000, animationMs: 12000 },
  skipAnimation: false,

  // Corporate table-hopping variant. When on, the audience idle screen shows
  // idleLogoUrl instead of the heart (and the heartbeat is silenced), message
  // cards + karaoke are skipped, and the review screen uses the thank-you copy
  // below. All default-empty/false so the private-party flow is unchanged.
  corporateMode: false,
  idleLogoUrl: "",

  // Which alternate post-reveal experience the host dock's 2nd button (and
  // remote ArrowRight) triggers for this show -- "messages" | "karaoke" |
  // "cinematic". Explicit choice, not derived from what's filled in, so
  // Shine can keep more than one configured at once and just flip this
  // between shows. Host-only field (audience.js never reads it).
  dockAltAction: "messages",

  // "Interactive" routine: a field of emoji and logos, a handful of
  // instructions, and the whole room ends on the same one. round -1 is the
  // field with no instruction yet -- the beat where everyone picks freely.
  // 0..n-1 step through the instructions. revealed vanishes everything except
  // the target.
  // The field, the instructions and the guarantee that they converge all live
  // in public/interactive-set.js; the server only tracks where we are.
  interactive: { round: -1, revealed: false },

  // The client logo the interactive routine finishes on, set per gig.
  //
  // Top-level rather than inside `interactive` on purpose: `interactive` is
  // round state that startInteractive resets and mergeState does not deep-merge,
  // so a logo stored in there would be wiped by either a settings save or the
  // act of starting the routine. This is configuration, and it has to survive
  // both. Empty falls back to the show's corporate logoUrl, then to the built-in
  // default mark -- so an unconfigured show still runs, it just finishes on an
  // abstract logo instead of the client's.
  interactiveLogoUrl: "",

  // Optional music bed for the interactive routine, played by the HOST device
  // alongside the voice over. Same reasoning as the logo above: configuration,
  // not round state, so it must survive both a settings save and startInteractive.
  interactiveMusicUrl: "",

  clientSplash: {
    enabled: true,
    durationMs: 3000,
    textSize: 6.2,
    // Dynamic list (was fixed card1..card5 through v84) -- any number of slides.
    cards: ["Hope you enjoyed my show", "Let\\'s all wish Kylie a very happy B'Day"],
    // Manual (host-paced) advance, added v85. When true, the audience does not
    // auto-cycle on a timer -- it shows whatever currentCardIndex points to and
    // waits for host:splashNext/host:splashPrev. Index range: 0..cards.length-1.
    // Reaching the end hands off to the shared photoStep (see below), not a
    // step within this card range anymore (v123) -- reset to 0 whenever
    // review phase is (re-)entered via host:sendToReview.
    manualAdvance: false,
    currentCardIndex: 0,
  },

  // Client photo + thank-you message shown right before the review ask --
  // v123: pulled out of clientSplash (Messages) specifically, since this is
  // now shared by ALL THREE post-reveal options (Messages, Karaoke,
  // Cinematic), not just Messages. clientImageUrl stays where it already
  // was (top-level, alongside the other Media URLs) since it was already
  // generic. See audience.js's showUniversalPhotoStepIfEnabled/proceedToReview.
  photoStep: {
    enabled: true,
    message: "Thank you — one last quick thing ❤️",
    durationMs: 3000,
  },

  reviewMode: { autoRedirect: true, autoRedirectDelayMs: 3000, thankTitle: "", thankMessage: "If you enjoyed my show, I would love a 5 star review!" },

  karaoke: { audioUrl: "", lrcUrl: "", bgUrl: "", title: "" },

  // Third post-show option alongside clientSplash (Messages) and karaoke --
  // same manual/auto-advance shape as clientSplash, but slides carry a
  // heading + body instead of one flat string, parsed host-side from
  // slidesText (the raw markdown Shine pastes, kept around so re-opening
  // Settings shows his original text back rather than a re-serialized copy).
  schoolShow: {
    enabled: true,
    mode: "projector", // "projector" | "phone" -- audience text sizing
    manualAdvance: false,
    slidesText: "",
    slides: [], // [{ heading, body }], body may contain **bold** spans
    currentCardIndex: 0,
    // No fallback track (unlike reveal/review music) -- each phone plays
    // this independently with no cross-device sync, so it stays silent
    // unless Shine deliberately opts in.
    musicUrl: "",
  },

  lastUpdateTs: Date.now(),
});

// Owner-configurable overlay on top of the hardcoded defaultState() above --
// set via the host screen's "Save as Default" button (host:saveAsDefault).
// Scoped deliberately to a few show-level fields that make sense to reuse
// across shows/rooms (music + review link), not per-client content like
// splash messages or the karaoke song. In-memory only, like roomStates below
// -- does not survive a deploy/restart, only Reset All / fresh rooms within
// the same running server.
let customDefaults = {};
function seededDefaultState() {
  return { ...defaultState(), ...customDefaults };
}

const roomStates = new Map();

// Load persisted state at boot, before anything else touches roomStates/
// customDefaults -- so a restart resumes from where the show left off
// instead of hardcoded defaults.
(function loadPersistedStateAtBoot() {
  try {
    if (!fs.existsSync(STATE_FILE)) return;
    const raw = fs.readFileSync(STATE_FILE, "utf-8");
    const persisted = JSON.parse(raw);
    if (persisted?.customDefaults && typeof persisted.customDefaults === "object") {
      customDefaults = persisted.customDefaults;
    }
    if (persisted?.rooms && typeof persisted.rooms === "object") {
      for (const [room, state] of Object.entries(persisted.rooms)) {
        if (state && typeof state === "object") roomStates.set(room, state);
      }
    }
    console.log(`Restored persisted state: ${Object.keys(persisted?.rooms || {}).length} room(s), customDefaults keys: ${Object.keys(customDefaults).join(", ") || "none"}`);
  } catch (e) {
    console.error("Failed to load persisted state, starting fresh:", e.message);
  }
})();

// Debounced disk write -- coalesces rapid-fire changes (e.g. typing in a
// settings field fires host:saveSettings on every keystroke) into at most
// one write every 1.5s, so this never becomes a hot path.
let persistTimer = null;
function schedulePersist() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const payload = { customDefaults, rooms: Object.fromEntries(roomStates) };
      fs.writeFileSync(STATE_FILE, JSON.stringify(payload));
    } catch (e) {
      console.error("Failed to persist state (non-fatal, show continues normally):", e.message);
    }
  }, 1500);
}

function getState(room) {
  const key = normalizeRoom(room);
  if (!roomStates.has(key)) roomStates.set(key, seededDefaultState());
  return roomStates.get(key);
}
function setState(room, nextState) {
  const key = normalizeRoom(room);
  roomStates.set(key, nextState);
  schedulePersist();
  return nextState;
}

function roomOfSocket(socket, payload) {
  return normalizeRoom(payload?.room || socket.data?.room || DEFAULT_ROOM);
}

function joinRoom(socket, room) {
  const clean = normalizeRoom(room);
  if (socket.data.room && socket.data.room !== clean) socket.leave(socket.data.room);
  socket.data.room = clean;
  socket.join(clean);
  return clean;
}

function broadcastState(room) {
  const key = normalizeRoom(room);
  const state = getState(key);
  state.seq = (Number(state.seq) || 0) + 1;
  state.lastUpdateTs = Date.now();
  setState(key, state);
  io.to(key).emit("state:update", { ...state, room: key });
}

function computeCounts(room) {
  const key = normalizeRoom(room);
  let hosts = 0;
  let audience = 0;
  for (const s of io.sockets.sockets.values()) {
    if (s.data?.room !== key) continue;
    if (s.data?.role === "host") hosts++;
    else if (s.data?.role === "audience") audience++;
  }
  return { hosts, audience, total: hosts + audience, room: key };
}

const countTimers = new Map();
function scheduleCountsBroadcast(room) {
  const key = normalizeRoom(room);
  if (countTimers.has(key)) return;
  const t = setTimeout(() => {
    countTimers.delete(key);
    io.to(key).emit("counts:update", { ...computeCounts(key), revision: REVISION, ts: Date.now() });
  }, 120);
  countTimers.set(key, t);
}

function allow(socket, key, minMs) {
  const now = Date.now();
  const k = `rl:${key}`;
  const last = socket.data?.[k] || 0;
  if (now - last < minMs) return false;
  socket.data[k] = now;
  return true;
}

// Highest valid clientSplash.currentCardIndex for a room: one slot per card,
// plus one for the photo step, plus one terminal value meaning "past the
// photo -- show the real review screen."
function splashMaxIndex(room) {
  const st = getState(room);
  const cards = Array.isArray(st.clientSplash?.cards) ? st.clientSplash.cards.filter((c) => (c || "").trim()) : [];
  // Indices 0..cards.length-1 are real cards; cards.length itself is now the
  // "done, move on" terminal index (was cards.length+1 through v122, when a
  // photo step also lived in this range -- that moved out to the shared
  // photoStep in v123, so max is one less than before).
  return cards.length;
}

function resetSplashIndex(room) {
  const st = getState(room);
  setState(room, { ...st, clientSplash: { ...st.clientSplash, currentCardIndex: 0 } });
}

function schoolShowMaxIndex(room) {
  const st = getState(room);
  const slides = Array.isArray(st.schoolShow?.slides) ? st.schoolShow.slides : [];
  return Math.max(0, slides.length - 1);
}

function resetSchoolShowIndex(room) {
  const st = getState(room);
  setState(room, { ...st, schoolShow: { ...st.schoolShow, currentCardIndex: 0 } });
}

// Every host action is sent via BOTH the socket AND the HTTP fallback
// unconditionally (see host.js emitHostAction) as a reliability measure for
// flaky mobile connections. That's harmless for idempotent actions (e.g.
// setting phase to a fixed value twice is still just that value), but
// splashNext/splashPrev are RELATIVE increments -- processing the same click
// on both channels would advance the index by 2 instead of 1. host.js stamps
// every action with the same clientTs on both sends; dedupe on that per room.
const lastSplashActionTs = new Map();
const lastSchoolShowActionTs = new Map();
function splashActionAlreadyApplied(room, clientTs) {
  if (!clientTs) return false;
  const key = normalizeRoom(room);
  if (lastSplashActionTs.get(key) === clientTs) return true;
  lastSplashActionTs.set(key, clientTs);
  return false;
}

function schoolShowActionAlreadyApplied(room, clientTs) {
  if (!clientTs) return false;
  const key = normalizeRoom(room);
  if (lastSchoolShowActionTs.get(key) === clientTs) return true;
  lastSchoolShowActionTs.set(key, clientTs);
  return false;
}

function mergeState(room, payload, extra = {}) {
  const current = getState(room);
  return setState(room, {
    ...current,
    ...payload,
    ...extra,
    room: undefined,
    timings: { ...current.timings, ...(payload?.timings || {}) },
    reviewMode: { ...current.reviewMode, ...(payload?.reviewMode || {}) },
    clientSplash: { ...current.clientSplash, ...(payload?.clientSplash || {}) },
    karaoke: { ...current.karaoke, ...(payload?.karaoke || {}) },
    schoolShow: { ...current.schoolShow, ...(payload?.schoolShow || {}) },
    photoStep: { ...current.photoStep, ...(payload?.photoStep || {}) },
  });
}

io.on("connection", (socket) => {
  // Wait for the browser to join its room before sending state.
  // This prevents a room from accidentally receiving/remembering another room's seq number.

  socket.on("client:role", (payload) => {
    const role = typeof payload === "string" ? payload : payload?.role;
    const room = joinRoom(socket, typeof payload === "object" ? payload?.room : DEFAULT_ROOM);
    socket.data.role = role === "host" ? "host" : "audience";
    socket.emit("state:update", { ...getState(room), room });
    socket.emit("counts:update", { ...computeCounts(room), revision: REVISION, ts: Date.now() });
    scheduleCountsBroadcast(room);
  });

  socket.on("disconnect", () => scheduleCountsBroadcast(socket.data?.room || DEFAULT_ROOM));
  socket.on("client:keepalive", (payload = {}) => {
    if (payload?.room) joinRoom(socket, payload.room);
  });

  socket.on("host:saveSettings", (payload = {}) => {
    if (!allow(socket, "saveSettings", 120)) return;
    const room = joinRoom(socket, roomOfSocket(socket, payload));
    mergeState(room, payload);
    broadcastState(room);
  });

  socket.on("host:sendReveal", (payload = {}) => {
    if (!allow(socket, "sendReveal", 250)) return;
    const room = joinRoom(socket, roomOfSocket(socket, payload));
    mergeState(room, payload, { phase: payload?.skipAnimation ? "revealed" : "reveal_sequence" });
    broadcastState(room);
  });

  socket.on("host:revealComplete", (payload = {}) => {
    if (!allow(socket, "revealComplete", 250)) return;
    const room = joinRoom(socket, roomOfSocket(socket, payload));
    const state = getState(room);
    if (state.phase === "reveal_sequence") {
      setState(room, { ...state, phase: "revealed" });
      broadcastState(room);
    }
  });

  // ── Interactive emoji routine ────────────────────────────────────────────
  // Deliberately four small events rather than one with an index: the host is
  // driving this live with a remote, and "next" needs to be a single button
  // press that cannot land on the wrong step because of a stale payload.
  socket.on("host:startInteractive", (payload = {}) => {
    if (!allow(socket, "startInteractive", 250)) return;
    const room = joinRoom(socket, roomOfSocket(socket, payload));
    const state = getState(room);
    setState(room, { ...state, phase: "interactive", interactive: { round: -1, revealed: false } });
    broadcastState(room);
  });

  socket.on("host:interactiveNext", (payload = {}) => {
    if (!allow(socket, "interactiveNext", 150)) return;
    const room = joinRoom(socket, roomOfSocket(socket, payload));
    const state = getState(room);
    if (state.phase !== "interactive") return;
    const total = Number(payload?.totalRounds) || 0;
    const current = state.interactive?.round ?? -1;
    // Clamped by the host's own round count rather than hardcoded here, so the
    // server never needs to know what is in the set file.
    const next = total ? Math.min(current + 1, total - 1) : current + 1;
    setState(room, { ...state, interactive: { ...state.interactive, round: next } });
    broadcastState(room);
  });

  socket.on("host:interactivePrev", (payload = {}) => {
    if (!allow(socket, "interactivePrev", 150)) return;
    const room = joinRoom(socket, roomOfSocket(socket, payload));
    const state = getState(room);
    if (state.phase !== "interactive") return;
    const current = state.interactive?.round ?? -1;
    setState(room, {
      ...state,
      // Stepping back also un-reveals, so a mis-tapped reveal is recoverable
      // mid-show instead of being a dead end.
      interactive: { round: Math.max(current - 1, -1), revealed: false },
    });
    broadcastState(room);
  });

  socket.on("host:interactiveReveal", (payload = {}) => {
    if (!allow(socket, "interactiveReveal", 250)) return;
    const room = joinRoom(socket, roomOfSocket(socket, payload));
    const state = getState(room);
    if (state.phase !== "interactive") return;
    setState(room, { ...state, interactive: { ...state.interactive, revealed: true } });
    broadcastState(room);
  });

  socket.on("host:preloadKaraokeSilent", (payload = {}) => {
    if (!allow(socket, "preloadKaraokeSilent", 250)) return;
    const room = joinRoom(socket, roomOfSocket(socket, payload));
    const s = getState(room);
    const previousPhase = s.phase;
    mergeState(room, payload, {});
    s.phase = previousPhase;
    io.to(room).emit("karaoke:preload", getState(room));
  });

  socket.on("host:prepareKaraoke", (payload = {}) => {
    if (!allow(socket, "prepareKaraoke", 250)) return;
    const room = joinRoom(socket, roomOfSocket(socket, payload));
    mergeState(room, payload, { phase: "karaoke_prepare" });
    broadcastState(room);
  });

  socket.on("host:startKaraoke", (payload = {}) => {
    if (!allow(socket, "startKaraoke", 250)) return;
    const room = joinRoom(socket, roomOfSocket(socket, payload));
    mergeState(room, payload, { phase: "karaoke", karaokeStartedAt: Date.now() });
    broadcastState(room);
  });

  socket.on("host:sendToReview", (payload = {}) => {
    if (!allow(socket, "sendToReview", 250)) return;
    const room = joinRoom(socket, roomOfSocket(socket, payload));
    mergeState(room, payload, { reviewUrl: payload?.reviewUrl ?? getState(room).reviewUrl, phase: "review" });
    resetSplashIndex(room); // always start the message cards from the top on fresh entry
    broadcastState(room);
  });

  // See the matching HTTP fallback ("goToReview" above) for why this is a
  // plain broadcast and not a phase/mergeState change.
  socket.on("host:goToReview", (payload = {}) => {
    if (!allow(socket, "goToReview", 250)) return;
    const room = joinRoom(socket, roomOfSocket(socket, payload));
    io.to(room).emit("audience:goToReview", { reviewUrl: getState(room).reviewUrl });
  });

  socket.on("host:splashNext", (payload = {}) => {
    if (!allow(socket, "splashNext", 200)) return;
    const room = joinRoom(socket, roomOfSocket(socket, payload));
    if (splashActionAlreadyApplied(room, payload.clientTs)) return;
    const cur = Number(getState(room).clientSplash?.currentCardIndex || 0);
    mergeState(room, { clientSplash: { currentCardIndex: Math.min(cur + 1, splashMaxIndex(room)) } });
    broadcastState(room);
  });

  socket.on("host:splashPrev", (payload = {}) => {
    if (!allow(socket, "splashPrev", 200)) return;
    const room = joinRoom(socket, roomOfSocket(socket, payload));
    if (splashActionAlreadyApplied(room, payload.clientTs)) return;
    const cur = Number(getState(room).clientSplash?.currentCardIndex || 0);
    mergeState(room, { clientSplash: { currentCardIndex: Math.max(cur - 1, 0) } });
    broadcastState(room);
  });

  socket.on("host:sendToSchoolShow", (payload = {}) => {
    if (!allow(socket, "sendToSchoolShow", 250)) return;
    const room = joinRoom(socket, roomOfSocket(socket, payload));
    mergeState(room, payload, { phase: "school_show" });
    resetSchoolShowIndex(room); // always start from the top on fresh entry
    broadcastState(room);
  });

  socket.on("host:schoolShowNext", (payload = {}) => {
    if (!allow(socket, "schoolShowNext", 200)) return;
    const room = joinRoom(socket, roomOfSocket(socket, payload));
    if (schoolShowActionAlreadyApplied(room, payload.clientTs)) return;
    const cur = Number(getState(room).schoolShow?.currentCardIndex || 0);
    mergeState(room, { schoolShow: { currentCardIndex: Math.min(cur + 1, schoolShowMaxIndex(room)) } });
    broadcastState(room);
  });

  socket.on("host:schoolShowPrev", (payload = {}) => {
    if (!allow(socket, "schoolShowPrev", 200)) return;
    const room = joinRoom(socket, roomOfSocket(socket, payload));
    if (schoolShowActionAlreadyApplied(room, payload.clientTs)) return;
    const cur = Number(getState(room).schoolShow?.currentCardIndex || 0);
    mergeState(room, { schoolShow: { currentCardIndex: Math.max(cur - 1, 0) } });
    broadcastState(room);
  });

  socket.on("host:resetPhase", (payload = {}) => {
    if (!allow(socket, "resetPhase", 350)) return;
    const room = joinRoom(socket, roomOfSocket(socket, payload));
    const state = getState(room);
    setState(room, { ...state, phase: "idle" });
    broadcastState(room);
  });

  socket.on("host:resetAll", (payload = {}) => {
    if (!allow(socket, "resetAll", 800)) return;
    const room = joinRoom(socket, roomOfSocket(socket, payload));
    setState(room, seededDefaultState());
    broadcastState(room);
  });

  socket.on("host:saveAsDefault", (payload = {}) => {
    if (!allow(socket, "saveAsDefault", 400)) return;
    customDefaults = {
      ...customDefaults,
      ...(payload.revealMusicUrl != null ? { revealMusicUrl: payload.revealMusicUrl } : {}),
      ...(payload.reviewMusicUrl != null ? { reviewMusicUrl: payload.reviewMusicUrl } : {}),
      ...(payload.reviewUrl != null ? { reviewUrl: payload.reviewUrl } : {}),
    };
    schedulePersist();
  });

  socket.on("host:syncCheck", (payload, cb) => {
    if (typeof payload === "function") { cb = payload; payload = {}; }
    const room = joinRoom(socket, roomOfSocket(socket, payload || {}));
    const state = getState(room);
    const response = {
      ok: true,
      revision: REVISION,
      room,
      nowTs: Date.now(),
      uptimeSec: Math.round(process.uptime()),
      counts: computeCounts(room),
      state: { phase: state.phase, lastUpdateTs: state.lastUpdateTs },
    };
    if (typeof cb === "function") cb(response);
  });
});

// HTTP fallbacks
app.get("/meta.json", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({
    ok: true,
    revision: REVISION,
    room: normalizeRoom(req.query.room),
    nowTs: Date.now(),
    uptimeSec: Math.round(process.uptime()),
  });
});

// ── Pre-show and post-show sequences ──────────────────────────────────────
//
// Same shape for both, and the same page plays either. Held per room alongside
// everything else, so building one is editing data rather than writing another
// HTML file by hand -- which is what happened for every school and client until
// now.

// What a room has, or the built-in pre-show if it has never been configured.
app.get("/sequence.json", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const room = normalizeRoom(req.query.room);
  const kind = req.query.kind === "postshow" ? "postshow" : "preshow";
  res.json({ ok: true, room, kind, sequence: sequenceFor(getState(room), kind) });
});

// The built-in one, for an app that wants to seed an editor without adopting
// whatever a room happens to hold.
app.get("/sequence-default.json", (req, res) => {
  const kind = req.query.kind === "postshow" ? "postshow" : "preshow";
  res.json({ ok: true, kind, sequence: defaultsFor(kind) });
});

// Play it here, for rehearsal. Clips stay as links, which is fine on a machine
// that can reach this server.
app.get("/play/:kind", (req, res) => {
  const kind = req.params.kind === "postshow" ? "postshow" : "preshow";
  const seq = sequenceFor(getState(normalizeRoom(req.query.room)), kind);
  res.type("html").send(renderSequence(seq));
});

// Download a copy that needs nothing: every clip inlined, no server, no
// network. This is the one that goes on the laptop and gets opened in a hall.
app.get("/api/export/:kind", async (req, res) => {
  const kind = req.params.kind === "postshow" ? "postshow" : "preshow";
  const room = normalizeRoom(req.query.room);
  try {
    const seq = sequenceFor(getState(room), kind);
    const baked = await inlineAll(seq, [MEDIA_DIR, path.join(process.cwd(), "public")]);
    const name = `${kind}-${room}.html`;
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    res.type("html").send(renderSequence(baked, { standalone: true }));
  } catch (e) {
    console.error("export failed:", e.message);
    res.status(500).send("export failed");
  }
});

app.get("/state.json", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const room = normalizeRoom(req.query.room);
  res.json({ ok: true, revision: REVISION, room, state: { ...getState(room), room } });
});

app.get("/counts.json", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const room = normalizeRoom(req.query.room);
  res.json({ ok: true, revision: REVISION, room, ts: Date.now(), counts: computeCounts(room) });
});

// ── EXPERIMENT: Photo Reveal V2, audience transport ───────────────────────────
//
// A second way to deliver the MystIO photo reveal: instead of one phone being
// handed round, every spectator opens the same photograph on their own phone.
//
// Deliberately fenced off from the show. Its own state map, its own socket
// rooms, its own routes, nothing persisted to state.json. Nothing above this
// line changes behaviour because of anything below it, so if this experiment is
// abandoned the block is deleted and the show is untouched.
//
// The state a room holds is tiny on purpose:
//
//   originalUrl  the genuine photograph, uploaded before the show
//   patchUrl     the cleared surface, uploaded before the show
//   revealUrl    a few kilobytes of lettering, uploaded at the moment of commit
//   mode         "original" until commit, "reveal" after
//
// The audience page loads the first two at join time and holds them decoded but
// hidden. A commit changes `mode` and names the third. Nothing reloads: the
// photograph the spectator is already looking at is never fetched twice.

const photoRooms = new Map();

function photoRoom(room) {
  const key = normalizeRoom(room);
  if (!photoRooms.has(key)) {
    photoRooms.set(key, {
      room: key, mode: "original", value: "",
      originalUrl: "", patchUrl: "", revealUrl: "",
      patchRect: null, imageSize: null,
      seq: 0, committedAt: 0, acks: [],
    });
  }
  return photoRooms.get(key);
}

function photoChannel(room) { return `photo-${normalizeRoom(room)}`; }

// Its own token, falling back to the voiceover upload's.
//
// UPLOAD_TOKEN is entered once into the MindGames app as a SecureField, so it
// cannot be read back out -- which left the photo transport unusable without
// rotating a secret that something else depends on. PHOTO_TOKEN is a second
// secret this block alone uses, so setting it breaks nothing.
function photoAuthorised(req) {
  const expected = process.env.PHOTO_TOKEN || process.env.UPLOAD_TOKEN || "";
  return Boolean(expected) && req.get("x-upload-token") === expected;
}

function photoCounts(room) {
  const channel = photoChannel(room);
  let clients = 0;
  for (const s of io.sockets.sockets.values()) {
    if (s.data?.photoRoom === channel) clients++;
  }
  return clients;
}

// Assets. Same raw-bytes shape and same token as the voiceover upload above,
// but its own route and its own parser so that endpoint is not altered.
app.post("/api/photo/:room/asset",
  express.raw({ type: ["image/jpeg", "image/png"], limit: "24mb" }),
  (req, res) => {
    if (!photoAuthorised(req)) return res.status(401).json({ ok: false, error: "unauthorized" });
    const part = String(req.get("x-photo-part") || "").toLowerCase();
    if (!["original", "patch", "reveal"].includes(part)) {
      return res.status(400).json({ ok: false, error: "x-photo-part must be original, patch or reveal" });
    }
    if (!req.body || !req.body.length) return res.status(400).json({ ok: false, error: "empty" });
    const ext = (req.get("content-type") || "").includes("png") ? ".png" : ".jpg";
    const key = normalizeRoom(req.params.room);
    const name = `photo-${key}-${part}-${Date.now().toString(36)}${ext}`;
    try {
      fs.writeFileSync(path.join(MEDIA_DIR, name), req.body);
    } catch (e) {
      return res.status(500).json({ ok: false, error: "write failed" });
    }
    const state = photoRoom(key);
    const url = `/media/${name}`;
    if (part === "original") state.originalUrl = url;
    if (part === "patch") state.patchUrl = url;
    if (part === "reveal") state.revealUrl = url;
    res.json({ ok: true, url, bytes: req.body.length });
  });

// The performer's control side. Token-protected: the audience page never calls
// this and never holds the token.
app.post("/api/photo/:room/state", express.json({ limit: "64kb" }), (req, res) => {
  if (!photoAuthorised(req)) return res.status(401).json({ ok: false, error: "unauthorized" });
  const key = normalizeRoom(req.params.room);
  const state = photoRoom(key);
  const body = req.body || {};

  if (body.patchRect) state.patchRect = body.patchRect;
  if (body.imageSize) state.imageSize = body.imageSize;
  if (typeof body.revealUrl === "string" && body.revealUrl) state.revealUrl = body.revealUrl;

  if (body.mode === "reveal") {
    // Committed values only. Partial remote input never reaches here because
    // the app only posts once its own input has committed, and this endpoint
    // refuses a reveal that has nothing to draw.
    if (!state.revealUrl) return res.status(400).json({ ok: false, error: "no reveal image" });
    state.mode = "reveal";
    state.value = String(body.value || "");
    state.committedAt = Date.now();
    state.acks = [];
  } else if (body.mode === "original") {
    state.mode = "original";
    state.value = "";
    state.committedAt = 0;
    state.acks = [];
  }
  state.seq += 1;
  io.to(photoChannel(key)).emit("photo:state", { ...state, serverTs: Date.now() });
  res.json({ ok: true, state: { ...state, clients: photoCounts(key) } });
});

// Read-only. What the performer polls for client counts and timings, and what a
// page falls back to if its socket has not connected yet.
app.get("/api/photo/:room/state", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const key = normalizeRoom(req.params.room);
  const state = photoRoom(key);
  const latencies = state.acks.map((a) => a.renderTs - state.committedAt).filter((n) => n >= 0).sort((a, b) => a - b);
  res.json({
    ok: true, revision: REVISION, serverTs: Date.now(),
    state: { ...state, clients: photoCounts(key) },
    latency: latencies.length ? {
      count: latencies.length,
      min: latencies[0],
      median: latencies[Math.floor(latencies.length / 2)],
      max: latencies[latencies.length - 1],
    } : null,
  });
});

io.on("connection", (socket) => {
  socket.on("photo:join", (payload = {}) => {
    const key = normalizeRoom(payload.room);
    const channel = photoChannel(key);
    if (socket.data.photoRoom && socket.data.photoRoom !== channel) {
      socket.leave(socket.data.photoRoom);
    }
    socket.data.photoRoom = channel;
    socket.join(channel);
    // A late joiner gets the CURRENT state immediately, so somebody who opens
    // the link after the reveal sees the revealed photograph rather than a
    // picture that will never change.
    socket.emit("photo:state", { ...photoRoom(key), serverTs: Date.now() });
  });

  socket.on("photo:ack", (payload = {}) => {
    const key = normalizeRoom(payload.room);
    const state = photoRoom(key);
    if (state.acks.length < 200) {
      state.acks.push({
        id: socket.id,
        recvTs: Number(payload.recvTs) || 0,
        renderTs: Number(payload.renderTs) || Date.now(),
      });
    }
  });
});

// ── EXPERIMENT: the YouTube reveal, on the spectator's own phone ─────────────
//
// Shine takes a spectator's phone, says he is going to play them a video, and
// opens yt.html on it. The page sits there loading. He then runs an ordinary
// MystIO routine, and the song that routine produced starts playing in the
// YouTube app on the phone in their hand.
//
// Fenced off exactly like the photo block above it: its own map, its own socket
// room, its own routes, nothing in state.json. Deleting this block leaves the
// show untouched.
//
// Built here rather than on the Supabase channel MystIO already holds, for the
// two reasons the photo block gives: Supabase broadcast has no client count, so
// the performer cannot tell whether the phone actually joined before committing
// to the effect, and it keeps no history, so a phone that opens the link AFTER
// the send receives nothing at all. Here a late joiner is handed the current
// state on join and navigates immediately -- which is the ordinary case, since
// the page is usually opened after the routine has already run.
//
// State is one video:
//
//   videoId   the eleven-character YouTube id, resolved on Shine's phone
//   title     what it is, for his own screen -- the page never shows it
//   mode      "idle" until commit, "play" after

const ytRooms = new Map();

// ── The song, as bytes ───────────────────────────────────────────────────────
//
// MEASURED, and the measurements are the reason this file looks like this.
//
// A spectator's phone will not start making sound on its own. iOS grants
// autoplay-with-sound per ORIGIN, from that viewer's own history with it, which
// is why every version of this played perfectly on Shine's phone -- he has
// played karaoke on mindgames.fly.dev hundreds of times -- and on nobody
// else's. His phone cannot test this feature.
//
// A tap from the performer fixes it, but the permission belongs to the media
// ELEMENT and is DISCARDED THE MOMENT ITS src CHANGES. So the src never
// changes. The element is pointed at the stream below inside the tap, the
// response opens immediately with silence so there is something genuinely
// playing, and the song is spliced onto the SAME response body once it is
// known. Nothing restarts, so nothing needs permission a second time.
//
// This is Earworm's handling, arrived at from the other end: the phone is muted
// and set playing BEFORE the song is named, and the volume comes back up under
// the spectator's own thumb.
//
// MP3 and not AAC because MP3 frames concatenate with no container to rewrite.
// Deezer and not Apple because Deezer's previews ARE mp3, 44100 stereo, which
// matches public/silence.mp3 exactly; Apple's are m4a and would need ffmpeg in
// the image. Both searches are keyless.
const DEEZER_SEARCH = "https://api.deezer.com/search";

// Decoration on a YouTube title defeats the search completely. MEASURED: of
// five real titles passed through raw, FOUR matched nothing at all -- "Eagles -
// Hotel California (Official Audio)" included. Stripping the brackets and the
// noise words took it to ten out of ten.
const TITLE_NOISE = /(official|officiel|videoclip|video|audio|lyrics?|lyric|visuali[sz]er|hd|hq|4k|8k|remaster(ed)?|full\s+song|full\s+album|m\/v|mv|with\s+lyrics|explicit)/gi;

function cleanTitle(t) {
  let s = String(t || "");
  s = s.replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " ").replace(/\{[^}]*\}/g, " ");
  s = s.replace(/\|/g, " ").replace(TITLE_NOISE, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s.replace(/^\s*[-\u2013\u2014]\s*|\s*[-\u2013\u2014]\s*$/g, "").trim();
}

function normName(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }

// The channel is the better artist hint: "Eagles" rather than guessing from
// punctuation. VEVO and "- Topic" are YouTube's own suffixes, not part of a name.
function splitSong(title, channel) {
  const c = cleanTitle(title);
  const parts = c.split(/\s[-\u2013\u2014]\s/);
  let artist = "", track = c;
  if (parts.length >= 2) { artist = parts[0].trim(); track = parts.slice(1).join(" - ").trim(); }
  const ch = String(channel || "").replace(/\s*-\s*topic$/i, "").replace(/vevo$/i, "").trim();
  if (ch) artist = ch;
  track = track.replace(/\s*\bfe?a?t\.?\b.*$/i, "").trim();
  return { artist, track, cleaned: c };
}

async function dzSearch(query) {
  try {
    const r = await fetch(`${DEEZER_SEARCH}?limit=12&q=${encodeURIComponent(query)}`);
    if (!r.ok) return [];
    const d = await r.json();
    return (Array.isArray(d && d.data) ? d.data : []).filter((x) => x && x.preview);
  } catch { return []; }
}

// Exact artist first, and the reason is not tidiness. A plain search for
// "Adele - Someone Like You" returns TWELVE rows without the real Adele in any
// of them: covers, karaoke, a soundalike called "Hello I'm Adele". Playing a
// karaoke cover of the song a spectator named is worse than playing nothing.
function pickBest(rows, wantArtist) {
  if (!rows.length) return { row: null, verified: false };
  if (wantArtist) {
    for (const r of rows) {
      if (normName(r.artist && r.artist.name) === wantArtist) return { row: r, verified: true };
    }
    for (const r of rows) {
      const h = normName(r.artist && r.artist.name);
      if (h && (h.includes(wantArtist) || wantArtist.includes(h))) return { row: r, verified: true };
    }
  }
  return { row: rows[0], verified: false };
}

// `artist:NAME track:"TITLE"` with the artist UNQUOTED is the one syntax that
// works. Quoting the artist returns an empty set; so does putting the filter
// after the words. This was found by trying all four.
async function deezerMatch(title, channel) {
  const { artist, track, cleaned } = splitSong(title, channel);
  const want = normName(artist);
  const tries = [];
  if (artist && track) tries.push(`artist:${artist} track:"${track}"`, `${artist} ${track}`);
  if (cleaned) tries.push(cleaned);
  if (track && track !== cleaned) tries.push(track);
  if (!tries.length) return null;

  let fallback = null;
  for (const q of tries) {
    const { row, verified } = pickBest(await dzSearch(q), want);
    if (row && verified) return shapeTrack(row, q, true);
    if (row && !fallback) fallback = shapeTrack(row, q, false);
  }
  return fallback;
}

function shapeTrack(row, query, verified) {
  return {
    title: String(row.title || ""),
    artist: String((row.artist && row.artist.name) || ""),
    cover: String((row.album && (row.album.cover_big || row.album.cover_medium)) || ""),
    seconds: Number(row.duration || 0),
    // Deliberately NOT the preview url: Deezer signs it with about twelve
    // minutes of life, and a show can take longer than that between arming the
    // phone and the reveal. Only `query` is kept, and the url is fetched fresh
    // at the moment of the splice.
    query,
    // false means "this is the right song title by the wrong performer". The
    // host panel must say so, because it is the one failure a spectator hears
    // rather than sees.
    verified,
  };
}

// An ID3v2 tag sitting mid-stream is where the first splice went wrong: the
// decoder reported "Header missing" at every join. Stripping it leaves raw
// frames, and the same test then decoded with no errors at all. The size field
// is syncsafe -- seven bits per byte -- which is the detail that bites.
function stripId3(buf) {
  if (buf.length > 10 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) |
                 ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    return buf.subarray(10 + size);
  }
  return buf;
}

function ytRoom(room) {
  const key = normalizeRoom(room);
  if (!ytRooms.has(key)) {
    ytRooms.set(key, {
      room: key, mode: "idle", videoId: "", title: "", seq: 0, committedAt: 0,
      // Two. The performer taps BEFORE sending the song in both, and nobody
      // touches the phone afterwards.
      //
      //   youtube_auto  the real YouTube app opens and plays the full track
      //   audio         our own player, streamed from here, 30 seconds
      //
      // There was a third, youtube_app, where the tap came AFTER the song was
      // sent. It existed only because the app was believed unreachable any
      // other way. It is not -- see the note above /yt-go -- so it was deleted
      // rather than left as a worse way of doing what youtube_auto does.
      playback: "youtube_auto",
      // Seconds into the song to start. Earworm uses 44, which lands past the
      // intro and in the body of the track, so it is recognised the instant the
      // volume comes up. Read from their own switch file.
      startAt: 44,
      // The primer. iOS keeps a PER-DOMAIN preference for universal links, and
      // a phone that has been sent to Safari for youtube.com keeps going to
      // Safari forever after. That setting lives on the spectator's phone and
      // nothing we deploy can reach it.
      //
      // So it gets set by hand, before the effect, on a throwaway video: open
      // /p, tap, and either the app opens (already primed, nothing to do) or
      // Safari offers "Open in the YouTube app" and one tap fixes the phone for
      // good. Then the real link is opened and everything after it is clean.
      //
      // Default is "Me at the zoo", the first video ever uploaded to YouTube.
      // Nineteen seconds, it will never be taken down, and a spectator who
      // glimpses it sees a curiosity rather than anything resembling a reveal.
      primeVideoId: "jNQXAC9IVRw",
      // Resolved at commit so the host is told AT ONCE if the song has no
      // match, rather than discovering it on a silent phone. The playable URL
      // is deliberately NOT stored: Deezer signs it with about twelve minutes
      // of life, so it is fetched fresh at the moment of the splice.
      track: null,
    });
  }
  return ytRooms.get(key);
}

function ytChannel(room) { return `yt-${normalizeRoom(room)}`; }

// Same token as the photo transport. One secret for "MystIO is allowed to drive
// an audience room here", not one per experiment.
// Either the audience-transport token OR the one MystIO already carries in its
// source, so a second performer has NOTHING to type.
//
// The photo transport's token is entered by hand in Settings, which is fine for
// Shine and wrong for anyone he hands the app to: a tester pasting a secret is
// a setup step that will go wrong in front of an audience. MystIO already ships
// SMS_TOKEN in its binary (as Ringer does), it is already good for minting
// Twilio voice tokens, and this grants strictly less than that -- so accepting
// it here adds no exposure that is not already there.
//
// Both header names are read, since the app sends x-upload-token and the
// dialler side sends x-sms-token.
function ytAuthorised(req) {
  const photo = process.env.PHOTO_TOKEN || process.env.UPLOAD_TOKEN || "";
  const sms = process.env.RINGER_SMS_TOKEN || "";
  const given = req.get("x-upload-token") || req.get("x-sms-token") || "";
  if (!given) return false;
  return (Boolean(photo) && given === photo) || (Boolean(sms) && given === sms);
}

function ytCounts(room) {
  const channel = ytChannel(room);
  let clients = 0;
  for (const s of io.sockets.sockets.values()) {
    if (s.data?.ytRoom === channel) clients++;
  }
  return clients;
}

// The performer's control side. Token-protected; the page never calls this.
app.post("/api/yt/:room/state", express.json({ limit: "8kb" }), async (req, res) => {
  if (!ytAuthorised(req)) return res.status(401).json({ ok: false, error: "unauthorized" });
  const key = normalizeRoom(req.params.room);
  const state = ytRoom(key);
  const body = req.body || {};

  // Settable with or without a song, so the mode can be chosen while setting up
  // rather than only at the moment of committing.
  if (["youtube_auto", "audio"].includes(body.playback)) {
    state.playback = body.playback;
  }
  // Names older builds of MystIO may still send. Both meant "open YouTube",
  // which is what youtube_auto does.
  if (body.playback === "youtube" || body.playback === "youtube_app") {
    state.playback = "youtube_auto";
  }
  if (typeof body.primeVideoId === "string" && /^[A-Za-z0-9_-]{11}$/.test(body.primeVideoId)) {
    state.primeVideoId = body.primeVideoId;
  }
  if (body.startAt !== undefined) {
    const n = Number(body.startAt);
    if (Number.isFinite(n) && n >= 0 && n <= 600) state.startAt = Math.round(n);
  }

  if (body.mode === "play") {
    // A malformed id is a 404 in a spectator's hand, so it is refused here
    // rather than delivered. YouTube ids are exactly eleven characters of
    // [A-Za-z0-9_-] and have been since the beginning.
    const id = String(body.videoId || "");
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) {
      return res.status(400).json({ ok: false, error: "videoId must be 11 characters" });
    }
    state.mode = "play";
    state.videoId = id;
    state.title = String(body.title || "").slice(0, 200);
    state.committedAt = Date.now();
    // Resolved here and returned in the response so the host panel can say
    // "matched X by Y" -- or say nothing was found, which is the one thing
    // worth knowing BEFORE the phone is handed back silent.
    // Only in audio mode. In youtube mode there is nothing for this server to
    // play, and a "no audio match" warning on a routine that is about to open
    // the real YouTube app would send the host hunting a problem that is not
    // there.
    state.track = state.playback === "audio"
      ? await deezerMatch(state.title, body.channel || "")
      : null;
  } else if (body.mode === "idle") {
    // Reset between performances. Without it the next phone to open the link
    // is thrown straight into the last spectator's song.
    state.mode = "idle";
    state.videoId = "";
    state.title = "";
    state.committedAt = 0;
    state.track = null;
  }
  state.seq += 1;
  io.to(ytChannel(key)).emit("yt:state", { ...state, serverTs: Date.now() });
  res.json({ ok: true, state: { ...state, clients: ytCounts(key) } });
});

// ── The Ringer dialler, on the SPECTATOR'S phone ─────────────────────────────
//
// Ringer is a native app on Shine's own phone: it dials through CallKit with
// the dialled number as a cosmetic handle, and Twilio decides what actually
// happens -- a hosted voicemail on the first dial of a number, the assistant on
// the second. No stranger is ever called.
//
// This serves the same effect from a web page, so the SPECTATOR can dial on
// their own phone. What carries across and what does not:
//
//   the keypad and in-call screen   a replica, close enough at arm's length
//   the two-dial rule               identical, and decided in the page
//   the voicemail and the divert    IDENTICAL -- the page talks to the very
//                                   same /api/voice-token and
//                                   /api/voice-twiml the app already uses,
//                                   with the same modes
//   CallKit                         does not survive. The call cannot appear
//                                   in the phone's own Recents, so the page
//                                   keeps its OWN recents list, which is where
//                                   anyone who looks will look first
//
// The SMS_TOKEN gating the token endpoint sits in Ringer's source, which is
// fine inside an app binary and a hole in a web page -- anyone viewing source
// could mint Twilio tokens and place calls on the account. So the browser never
// sees it: this proxy holds it as a Fly secret, and the page only receives the
// short-lived Twilio token it actually needs.
const RINGER_BACKEND = "https://voice-capture-bice.vercel.app";

app.get("/api/ringer/token", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const token = process.env.RINGER_SMS_TOKEN || "";
  if (!token) {
    return res.status(500).json({ error: "RINGER_SMS_TOKEN is not set on this app" });
  }
  // This endpoint cannot be token-protected -- the page that calls it runs on a
  // stranger's phone and is public. So it is gated on the ROOM instead: only a
  // room Ringer has actually configured can mint a Twilio token. Without this,
  // anyone who found the URL could mint tokens on the account and ring the
  // assistant repeatedly. They could never reach an arbitrary number (the TwiML
  // only routes to the voicemail or the assistant), but that is not a reason to
  // leave it open, and it stopped being hypothetical the moment rooms became
  // nameable and therefore guessable.
  const room = normalizeRoom(String(req.query.room || ""));
  if (!room || !ringerRooms[room]) {
    return res.status(403).json({ error: "this room is not set up for calling" });
  }
  // kind=video mints a room-scoped Twilio Video grant instead, for the
  // FaceTime leg. Same gate: the room must be one Ringer configured, and the
  // grant is good for that room alone.
  // kind=client mints an INCOMING-ONLY voice grant for the assistant's own
  // page, so the divert can reach him as a browser client rather than on his
  // mobile. That is the only way the call is ever wideband -- a mobile leg is
  // narrowband whatever the performer's end prefers.
  const kindRaw = String(req.query.kind || "");
  const kind = kindRaw === "video" || kindRaw === "client" ? kindRaw : "voice";
  const who = String(req.query.who || "") === "assistant" ? "assistant" : "spectator";
  const upstream =
    kind === "video"
      ? RINGER_BACKEND + "/api/voice-token?kind=video&room=" + encodeURIComponent(room)
          + "&who=" + who
      : kind === "client"
        ? RINGER_BACKEND + "/api/voice-token?kind=client&room=" + encodeURIComponent(room)
        : RINGER_BACKEND + "/api/voice-token";
  try {
    const r = await fetch(upstream, {
      headers: { "x-sms-token": token },
    });
    const body = await r.text();
    res.status(r.status)
      .type(r.headers.get("content-type") || "application/json")
      .send(body);
  } catch (e) {
    res.status(502).json({ error: "could not reach the voice backend" });
  }
});

// ── Who the divert reaches, per room ─────────────────────────────────────────
//
// The assistant's number is NOT a Vercel environment variable, deliberately:
// Shine works with different assistants on different shows, and a friend
// testing the app has their own. It is also a real person's phone number, so it
// never reaches the browser -- the dialler page sends only its ROOM as a Twilio
// parameter, and api/voice-twiml.js asks this server for the number machine to
// machine at the moment of the call. So it appears in no page source, no
// devtools panel and no network log on a phone in a stranger's hand.
//
// Persisted on the same Fly volume as the show state, so it survives deploys.
// No new secret: voice-capture already holds SMS_TOKEN and this app holds the
// same value as RINGER_SMS_TOKEN, so the two can authenticate to each other
// with what they already have.
const RINGER_FILE = path.join(DATA_DIR, "ringer-rooms.json");
let ringerRooms = {};
try { ringerRooms = JSON.parse(fs.readFileSync(RINGER_FILE, "utf8")) || {}; } catch {}

function saveRingerRooms() {
  try { fs.writeFileSync(RINGER_FILE, JSON.stringify(ringerRooms)); }
  catch (e) { console.error("ringer rooms save failed:", e.message); }
}

function ringerAuthorised(req) {
  const expected = process.env.RINGER_SMS_TOKEN || "";
  return Boolean(expected) && req.get("x-sms-token") === expected;
}

// Set by the performer's own app, which is the only thing that knows which
// assistant is working tonight.
app.post("/api/ringer/:room/config", express.json({ limit: "4kb" }), (req, res) => {
  if (!ringerAuthorised(req)) return res.status(401).json({ ok: false, error: "unauthorized" });
  const key = normalizeRoom(req.params.room);
  // Normalised here as well as by the caller. A number arriving as
  // "(512) 555-1234" straight off a Contacts card is the ordinary case, not a
  // malformed one, and refusing it produced a failure that said only "could
  // not send". Strip the formatting, keep a leading +, then validate.
  const given = String((req.body && req.body.assistant) || "").trim();
  const plus = given.startsWith("+");
  const digits = given.replace(/[^0-9]/g, "");
  const raw = digits ? (plus ? "+" : "") + digits : "";
  // Same shape api/voice-twiml.js accepts, checked here too so a typo is
  // refused when it is entered rather than discovered mid-effect.
  if (raw && !/^\+?[0-9]{7,15}$/.test(raw)) {
    return res.status(400).json({ ok: false, error: "not a phone number" });
  }
  if (raw) {
    // The voicemail wording travels with it, so the web dialler says exactly
    // what the app says rather than falling back to a generic greeting.
    const vm = String((req.body && req.body.vm) || "").slice(0, 600);
    const rawVoice = String((req.body && req.body.vmvoice) || "").trim();
    const vmvoice = /^[A-Za-z0-9.\-]+$/.test(rawVoice) ? rawVoice : "";
    // "client" = the assistant answers on his own web page (/a/<room>) rather
    // than on his mobile, which is what makes the call Opus wideband instead of
    // G.711. Anything else, including absent, is the behaviour this has always
    // had. The number above is still stored and still used -- it is what the
    // divert falls back to when his page does not pick up.
    const via = String((req.body && req.body.via) || "") === "client" ? "client" : "";
    // The wording of the "where they are calling from" text, so the clip and the
    // web dialler say exactly what the app says. {NUMBER} and {CITY} are filled
    // in by /notify.
    const smsTemplate = String((req.body && req.body.smsTemplate) || "").slice(0, 300);
    ringerRooms[key] = { assistant: raw, vm, vmvoice, via, smsTemplate, at: Date.now() };
  } else {
    delete ringerRooms[key];
  }
  saveRingerRooms();
  // Echoes only the last four digits. Enough to confirm the right number went
  // in, useless to anyone who intercepts it.
  res.json({ ok: true, room: key, endsWith: raw ? raw.slice(-4) : null });
});

// Read back, for the app to show what is currently set. Last four only.
app.get("/api/ringer/:room/config", (req, res) => {
  if (!ringerAuthorised(req)) return res.status(401).json({ ok: false, error: "unauthorized" });
  const key = normalizeRoom(req.params.room);
  const rec = ringerRooms[key];
  res.setHeader("Cache-Control", "no-store");
  res.json({
    ok: true, room: key,
    endsWith: rec ? rec.assistant.slice(-4) : null,
    hasVoicemail: Boolean(rec && rec.vm),
    via: (rec && rec.via) || "",
    at: rec ? rec.at : null,
  });
});

// The full record, for api/voice-twiml.js alone, at the moment of the call.
app.get("/api/ringer/:room/assistant", (req, res) => {
  if (!ringerAuthorised(req)) return res.status(401).json({ ok: false, error: "unauthorized" });
  const key = normalizeRoom(req.params.room);
  const rec = ringerRooms[key];
  res.setHeader("Cache-Control", "no-store");
  if (!rec) return res.status(404).json({ ok: false, error: "nothing set for this room" });
  res.json({ ok: true, assistant: rec.assistant, vm: rec.vm || "", vmvoice: rec.vmvoice || "",
             via: rec.via || "" });
});

// ── Telling the assistant where the caller is, BEFORE his phone rings ────────
//
// The app has always texted him the caller's city, but it fired ON the dial. By
// the time he reads it his phone is already ringing, so he has to leave the call
// to go and look -- which is the one moment he cannot. It is now something the
// performer does deliberately, a beat before dialling.
//
// Here as well as in the app because the App Clip and the web dialler need it
// too, and neither of those can hold the assistant's number or the SMS token.
// So the room names the assistant, lib/area-codes.js knows the city, and
// voice-capture sends it. The spectator's phone learns nothing.
//
// Gated on the room being configured, exactly like /ring: without that, anyone
// who guessed a room could text a real person.
app.post("/api/ringer/:room/notify", express.json({ limit: "2kb" }), async (req, res) => {
  const key = normalizeRoom(req.params.room);
  const rec = ringerRooms[key];
  if (!rec) return res.status(403).json({ ok: false, error: "room is not set up" });

  const digits = String((req.body && req.body.number) || "").replace(/[^0-9]/g, "");
  if (digits.length < 10) return res.status(400).json({ ok: false, error: "not a number" });

  const token = process.env.RINGER_SMS_TOKEN || "";
  if (!token) return res.status(500).json({ ok: false, error: "RINGER_SMS_TOKEN is not set" });

  // An unknown area code leaves the city vague rather than inventing one. The
  // assistant can work with "an unlisted area"; he cannot work with a city that
  // is wrong, because the spectator knows where their own number is from.
  const city = cityFor(digits) || "an unlisted area";
  const template = rec.smsTemplate || "Caller: {NUMBER} ({CITY})";
  const body = template
    .replace(/\{NUMBER\}/g, prettyNumber(digits))
    .replace(/\{CITY\}/g, city);

  try {
    const r = await fetch(RINGER_BACKEND + "/api/sms", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-sms-token": token },
      body: JSON.stringify({ to: rec.assistant, body }),
    });
    if (!r.ok) {
      return res.status(502).json({ ok: false, error: "the text was refused (" + r.status + ")" });
    }
  } catch (e) {
    return res.status(502).json({ ok: false, error: "could not reach the SMS backend" });
  }
  // The city comes back so the sender can show what was actually sent. The
  // assistant's number does not, and must not -- this runs on a borrowed phone.
  res.json({ ok: true, city });
});

// (512) 555-1234, matching formatNumber() in the app so the assistant sees the
// same shape whichever of the three dialled.
function prettyNumber(d) {
  if (d.length === 11 && d[0] === "1") d = d.slice(1);
  if (d.length === 10) return "(" + d.slice(0, 3) + ") " + d.slice(3, 6) + "-" + d.slice(6);
  return d;
}

// ── "The assistant is calling back" ──────────────────────────────────────────
//
// The routine ends on a FaceTime from the assistant. On a borrowed phone that
// is impossible, so the video happens in the page -- and the page must not ask
// for the camera until it is ACCEPTED. A dialler that requests the camera while
// it is pretending to be a dialler is finished before it starts.
//
// So the assistant's page says "ringing" here, the dialler polls it and draws
// an incoming call, and only on accept does it take a video token and turn the
// camera on. The same order a real call has.
//
// Gated on the room being configured, like the token endpoint: someone who
// guessed a room could otherwise make a phone ring mid-show.
app.post("/api/ringer/:room/ring", express.json({ limit: "2kb" }), (req, res) => {
  const key = normalizeRoom(req.params.room);
  const rec = ringerRooms[key];
  if (!rec) return res.status(403).json({ ok: false, error: "room is not set up" });
  const on = Boolean(req.body && req.body.on);
  rec.ringing = on ? Date.now() : 0;
  saveRingerRooms();
  res.json({ ok: true, ringing: on });
});

// Read by the dialler. Deliberately open: it reveals only that a room is
// ringing, which is worth nothing without the room, and the dialler is a public
// page that cannot hold a token.
app.get("/api/ringer/:room/ring", (req, res) => {
  const key = normalizeRoom(req.params.room);
  const rec = ringerRooms[key];
  res.setHeader("Cache-Control", "no-store");
  // Rings expire. A ring left on by a page closed mid-rehearsal would have the
  // next spectator's phone light up before anything had happened.
  const live = Boolean(rec && rec.ringing && Date.now() - rec.ringing < 120000);
  res.json({ ok: true, ringing: live });
});

// The assistant's own page, for their phone. Kept off the /d path so the two
// links cannot be confused at a glance.
app.get(["/a", "/a/:room"], (req, res) => {
  res.setHeader("Cache-Control", "no-store, must-revalidate");
  res.sendFile(path.resolve("public", "assistant.html"));
});

// The audience pages must never be stale. A phone that has held this link
// before will happily reuse its copy, and debugging a page that is not the page
// you deployed costs a round of testing every time.
app.get(["/yt.html", "/ytgo.html"], (req, res, next) => {
  res.setHeader("Cache-Control", "no-store, must-revalidate");
  next();
});

// The short path for the YouTube reveal, typed onto the spectator's phone while
// Shine appears to search for their song. Served rather than redirected so the
// long URL never appears in the address bar in front of them; the page reads
// its room from the path as well as from ?r=.
app.get("/api/yt/:room/stream", async (req, res) => {
  const key = normalizeRoom(req.params.room);
  const state = ytRoom(key);

  // No Content-Length and Accept-Ranges: none, deliberately. This is a live
  // stream of unknown length; advertising ranges invites Safari to re-request
  // pieces of something that cannot be seeked, and a re-request would be a new
  // load -- which is the very thing that loses the tap's permission.
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Accept-Ranges", "none");

  let quiet;
  try { quiet = fs.readFileSync(path.resolve("public", "silence.mp3")); } catch {
    return res.status(500).end();
  }

  // Whatever is playing when the performer taps must not be last show's song.
  // The seq at open is the line between "already committed, ignore it" and
  // "committed while this phone was listening, play it".
  const openedAtSeq = state.seq;
  const openedAt = Date.now();
  const MAX_HOLD_MS = 12 * 60 * 1000;

  let done = false;
  const stop = () => {
    if (done) return;
    done = true;
    clearInterval(trickle);
    clearInterval(watch);
    try { res.end(); } catch {}
  };
  req.on("close", stop);

  // A second of silence per second, which is what any live stream looks like
  // from the outside. Without it Safari treats a stalled media load as failed
  // and abandons it, taking the permission with it.
  res.write(quiet);
  const trickle = setInterval(() => {
    if (done) return;
    if (Date.now() - openedAt > MAX_HOLD_MS) return stop();
    res.write(quiet);
  }, 1000);

  // Polled rather than evented on purpose: one timer per listening phone is
  // nothing, and it cannot miss an edge the way a listener registered a moment
  // too late can.
  let splicing = false;
  let attempts = 0;
  let nextTryAt = 0;
  const MAX_ATTEMPTS = 10;
  const watch = setInterval(async () => {
    if (done || splicing) return;
    const now = ytRoom(key);
    if (now.mode !== "play" || now.seq <= openedAtSeq) return;
    // Bounded, and spaced. Without this a song Deezer cannot serve turns into
    // four lookups a second for as long as the phone is held, which is a way
    // to get this server's address blocked mid-show.
    if (attempts >= MAX_ATTEMPTS) return;
    if (Date.now() < nextTryAt) return;
    attempts += 1;
    nextTryAt = Date.now() + 2000;
    splicing = true;

    // Resolved HERE, not at commit, because Deezer signs the preview URL with
    // roughly twelve minutes of life and a show can easily take longer between
    // arming the phone and the reveal.
    const fresh = now.track && now.track.query
      ? await dzSearch(now.track.query)
      : [];
    const again = pickBest(fresh, normName(now.track && now.track.artist));
    const url = again.row ? String(again.row.preview || "") : "";

    if (!url) {
      // Nothing to play. Keep trickling rather than ending: a dead stream is a
      // phone that has visibly stopped, and silence is the better failure.
      splicing = false;
      return;
    }

    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error("preview " + r.status);
      const bytes = stripId3(Buffer.from(await r.arrayBuffer()));
      if (done) return;
      clearInterval(trickle);
      clearInterval(watch);
      res.write(bytes);
      res.end();
      done = true;
      // The page cannot work out for itself when the song landed: the trickled
      // silence advances currentTime exactly like real audio does, so the
      // element's own clock says "playing" from the moment of the tap. Only
      // the server knows the instant the bytes went out, so only the server
      // can tell the picture when to appear.
      io.to(ytChannel(key)).emit("yt:playing", { room: key, at: Date.now() });
    } catch {
      splicing = false;
    }
  }, 250);
});

// Kept only so a /p link written on an NFC tag still works. Priming is no
// longer a separate page: it is the quiet second option on the landing page,
// one URL for everything, which is Earworm's shape and the one Shine asked for.
// ── The file iOS reads before it will launch the App Clip ───────────────────
//
// Without this, a real NFC tag or QR code does nothing: iOS fetches it to
// confirm this domain is allowed to launch that clip. A Local Experience
// configured by hand in Settings bypasses it, which is how the clip was tested,
// but no spectator's phone will have one.
//
// Must be served as application/json, at exactly this path, over https, with no
// redirect. The team prefix is part of the identifier and it does not work
// without it.
app.get(["/.well-known/apple-app-site-association", "/apple-app-site-association"],
  (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.json({
      appclips: {
        apps: ["B2WG3MN7S3.MindGames.Ringer.Clip"],
      },
    });
  });

// ── A log the App Clip can write to ─────────────────────────────────────────
//
// Debugging the clip on a borrowed-phone effect is genuinely hard: there is no
// console (devicectl's --console detaches immediately), an on-screen alert is
// gone before a screenshot can be taken, and the clip terminates too fast to
// read. So it posts here instead and the log is read from a laptop.
//
// In memory and capped. This is a diagnostic, not a feature; it holds the last
// fifty lines and is lost on deploy, which is exactly what is wanted.
const clipLog = [];

app.post("/api/clip-log", express.json({ limit: "8kb" }), (req, res) => {
  if (!ringerAuthorised(req)) return res.status(401).json({ ok: false });
  const line = {
    at: new Date().toISOString(),
    tag: String((req.body && req.body.tag) || "").slice(0, 60),
    detail: String((req.body && req.body.detail) || "").slice(0, 600),
  };
  clipLog.push(line);
  while (clipLog.length > 50) clipLog.shift();
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true });
});

app.get("/api/clip-log", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, lines: clipLog });
});

app.get(["/p", "/p/:room"], (req, res) => {
  res.setHeader("Cache-Control", "no-store, must-revalidate");
  res.sendFile(path.resolve("public", "yt.html"));
});

// The performing page, a SEPARATE document reached from inside the landing
// page's tap. See the note at the top of public/ytgo.html: priming opens the
// app because it navigates inside the tap, performing did not because it
// navigated from a timer, and this split is how the other product gets a
// delayed navigation to the app anyway.
app.get("/y/:room/go", (req, res) => {
  res.setHeader("Cache-Control", "no-store, must-revalidate");
  res.sendFile(path.resolve("public", "ytgo.html"));
});

app.get(["/y", "/y/:room"], (req, res) => {
  const key = normalizeRoom(req.params.room || "x");
  res.setHeader("Cache-Control", "no-store, must-revalidate");
  // `key` is validated only so a malformed room is rejected at the door.
  void key;
  res.sendFile(path.resolve("public", "yt.html"));
});

// The short path, for typing onto a stranger's phone and for writing to an NFC
// tag. Served rather than redirected so the long URL never appears in the
// address bar in front of them.
app.get(["/d", "/d/:room"], (req, res) => {
  res.setHeader("Cache-Control", "no-store, must-revalidate");
  res.sendFile(path.resolve("public", "dialler.html"));
});

// A 302 to YouTube, used by the PRIMING tap on the landing page.
//
// THE ANSWER, so nobody spends another week on it.
//
// Opening the YouTube app needs the navigation to be user-initiated. Eleven
// arrangements were measured and the conclusion drawn was "a touch must be in
// the call stack AT THE MOMENT of navigation, and no page can manufacture one".
// That conclusion was WRONG, and being confident about it cost days.
//
// What is actually true: a DELAYED navigation reaches the app as well, provided
// the document it runs in was itself CREATED BY A USER-INITIATED NAVIGATION.
// That is the whole trick, and it is why the two pages exist:
//
//   /y/:room      the landing page. Its tile navigates from inside the click
//                 handler, so the next document is born of a gesture.
//   /y/:room/go   the performing page. Its navigation fires later, from an XHR
//                 callback, and STILL reaches the app -- because of how it was
//                 created, not because of when it fires.
//
// Verified on Shine's phone: one page with a timer landed in Safari every time;
// the identical logic split across two documents opened the app.
//
// The other half, equally expensive: iOS keeps a PER-DOMAIN preference for
// universal links, on the spectator's phone, where nothing deployed here can
// reach it. A phone once sent to Safari for youtube.com keeps going to Safari.
// Priming fixes that by hand before the effect -- see the landing page.
//
app.get("/yt-go/:id", (req, res) => {
  const id = String(req.params.id || "");
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return res.status(400).send("bad id");
  res.setHeader("Cache-Control", "no-store");
  // Seconds to start at. Earworm uses 44 -- past the intro, so the song is
  // recognised the instant the volume comes up rather than after a quiet build.
  const t = Number(req.query.t);
  const at = Number.isFinite(t) && t > 0 && t <= 600 ? "&t=" + Math.round(t) : "";
  res.redirect(302, "https://www.youtube.com/watch?v=" + id + at);
});

// Read-only. What MystIO polls to know a phone is listening before he commits.
app.get("/api/yt/:room/state", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const key = normalizeRoom(req.params.room);
  const state = ytRoom(key);
  res.json({
    ok: true, revision: REVISION, serverTs: Date.now(),
    state: { ...state, clients: ytCounts(key) },
  });
});

io.on("connection", (socket) => {
  socket.on("yt:join", (payload = {}) => {
    const key = normalizeRoom(payload.room);
    const channel = ytChannel(key);
    if (socket.data.ytRoom && socket.data.ytRoom !== channel) {
      socket.leave(socket.data.ytRoom);
    }
    socket.data.ytRoom = channel;
    socket.join(channel);
    socket.emit("yt:state", { ...ytRoom(key), serverTs: Date.now() });
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on http://0.0.0.0:${PORT} • ${REVISION}`);
});
