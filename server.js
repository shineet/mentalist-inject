import express from "express";
import http from "http";
import { Server } from "socket.io";
import fs from "fs";
import path from "path";
import { sequenceFor, defaultsFor, inlineAll } from "./lib/sequence.js";
import { renderSequence } from "./lib/render.js";

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

/** bump on deploy */
const REVISION = "v209-yt-answer-recorded";

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
const DEFAULT_CLIENT_IMAGE_URL = "/client.png";
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

function ytRoom(room) {
  const key = normalizeRoom(room);
  if (!ytRooms.has(key)) {
    ytRooms.set(key, { room: key, mode: "idle", videoId: "", title: "", seq: 0, committedAt: 0 });
  }
  return ytRooms.get(key);
}

function ytChannel(room) { return `yt-${normalizeRoom(room)}`; }

// Same token as the photo transport. One secret for "MystIO is allowed to drive
// an audience room here", not one per experiment.
function ytAuthorised(req) {
  const expected = process.env.PHOTO_TOKEN || process.env.UPLOAD_TOKEN || "";
  return Boolean(expected) && req.get("x-upload-token") === expected;
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
app.post("/api/yt/:room/state", express.json({ limit: "8kb" }), (req, res) => {
  if (!ytAuthorised(req)) return res.status(401).json({ ok: false, error: "unauthorized" });
  const key = normalizeRoom(req.params.room);
  const state = ytRoom(key);
  const body = req.body || {};

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
    // Answer every navigation his tap left open. This is the whole effect.
    state.released = ytRelease(key, state.videoId);
  } else if (body.mode === "idle") {
    // Reset between performances. Without it the next phone to open the link
    // is thrown straight into the last spectator's song.
    state.mode = "idle";
    state.videoId = "";
    state.title = "";
    state.committedAt = 0;
  }
  state.seq += 1;
  io.to(ytChannel(key)).emit("yt:state", { ...state, serverTs: Date.now() });
  res.json({ ok: true, state: { ...state, clients: ytCounts(key) } });
});

// A 302 to YouTube, as a DIFFERENT mechanism from an in-page navigation.
//
// Measured: `location.href = "https://youtube.com/watch?v=..."` on a timer
// lands in Safari, and the same line inside a click handler opens the app. iOS
// wants a user gesture in the call stack for a universal link. A server
// redirect is not an in-page navigation at all, and Apple treats redirect
// chains by their own rules -- so this may or may not reach the app. It exists
// to be tested rather than reasoned about.
// The short way in, because Shine TYPES this on the spectator's phone while
// appearing to search YouTube for their song. "mindgames.fly.dev/yt.html?r=
// kqm3xw9pdz" is eleven random characters entered on somebody else's keyboard
// under a cover story, which is not a thing anyone can do. "/y/kqm3x" is.
//
// The query form still works; nothing that already holds a link breaks.
app.get(["/y", "/y/:room"], (req, res) => {
  const key = normalizeRoom(req.params.room || "x");
  res.setHeader("Cache-Control", "no-store, must-revalidate");
  // Served, not redirected: a redirect would put the long URL in the address
  // bar a second later, in front of the person holding the phone. The page
  // reads its room from the path, so nothing needs to be passed here -- `key`
  // is validated above only so a bad room is rejected at the door.
  void key;
  // path.resolve, not __dirname: this file is an ES module and __dirname does
  // not exist in one. express.static above resolves "public" against the
  // working directory, so the same relative base is correct here.
  res.sendFile(path.resolve("public", "yt.html"));
});

// The audience pages must never be stale. A phone that has held this link
// before will happily reuse its copy, and debugging a page that is not the
// page you deployed costs a round of testing every time.
app.get(["/yt.html", "/yt-diag.html"], (req, res, next) => {
  res.setHeader("Cache-Control", "no-store, must-revalidate");
  next();
});

// ── Three untested ways to reach the YouTube app ──────────────────────────
//
// Everything measured so far says a touch must be in the call stack at the
// moment of navigation. These three are not variations on that -- each uses a
// different mechanism that has never been tried:
//
//   /t1        a <meta http-equiv="refresh">. Not JavaScript at all; the
//              browser performs it as part of rendering the document.
//   /t2        an HTTP Refresh: header. The same instruction one layer lower,
//              arriving in the response rather than in the page.
//   /t3/:room  a navigation STARTED BY TYPING THE URL, held open by this
//              server until the song is dialled, then answered with a 302.
//              The most promising of the three: v205 proved a held navigation
//              does reach the app, and only asked "Open in YouTube?" because
//              it came from a tap on a page rather than from the address bar.
//              Typing a URL and pressing Go is the most user-initiated
//              navigation there is.
//
// Default video is Yesterday, so /t1 and /t2 are typeable with nothing after
// them. Delete this block once the answer is known.
const T_DEFAULT = "NrgmdOz227I";

function tVideo(req) {
  const id = String(req.query.v || T_DEFAULT);
  return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : T_DEFAULT;
}

app.get("/t1", (req, res) => {
  const url = "https://www.youtube.com/watch?v=" + tVideo(req);
  res.setHeader("Cache-Control", "no-store");
  res.type("html").send(`<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="refresh" content="3;url=${url}">
<title>t1 meta refresh</title>
<style>body{background:#000;color:#0f0;font:14px ui-monospace,Menlo,monospace;padding:24px}</style>
</head><body>t1 &mdash; meta refresh, 3 seconds. Touch nothing.</body></html>`);
});

app.get("/t2", (req, res) => {
  const url = "https://www.youtube.com/watch?v=" + tVideo(req);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Refresh", "3; url=" + url);
  res.type("html").send(`<!doctype html><html><head><meta charset="utf-8">
<title>t2 refresh header</title>
<style>body{background:#000;color:#0f0;font:14px ui-monospace,Menlo,monospace;padding:24px}</style>
</head><body>t2 &mdash; HTTP Refresh header, 3 seconds. Touch nothing.</body></html>`);
});

// Held from the address bar. Answers nothing until the song is dialled, so
// Safari sits on a blank page with its loading bar running -- then the commit
// releases it straight into the video.
app.get("/t3/:room", (req, res) => {
  const key = normalizeRoom(req.params.room);
  const state = ytRoom(key);
  res.setHeader("Cache-Control", "no-store");
  if (state.mode === "play" && state.videoId) {
    return res.redirect(302, "https://www.youtube.com/watch?v=" + state.videoId);
  }
  const held = ytWaiters.get(key) || [];
  held.push(res);
  ytWaiters.set(key, held);
  const giveUp = setTimeout(() => {
    const arr = ytWaiters.get(key) || [];
    const i = arr.indexOf(res);
    if (i >= 0) arr.splice(i, 1);
    try { if (!res.headersSent) res.status(504).type("text").send("t3: nothing was dialled in 60s"); } catch (e) {}
  }, 60000);
  res.on("close", () => {
    clearTimeout(giveUp);
    const arr = ytWaiters.get(key) || [];
    const i = arr.indexOf(res);
    if (i >= 0) arr.splice(i, 1);
  });
});

// A navigation that BEGINS inside Shine's tap and ENDS at the reveal.
//
// Everything else was tried and measured. iOS hands a youtube.com link to the
// YouTube app only when a touch is in the call stack at the moment of
// navigation -- not a touch earlier on the page, not the touch that created
// the timer, IN it. Seven configurations, all agreeing. So an automatic jump
// can only ever land in Safari.
//
// This is the one way round that does not require a touch after the song is
// dialled, which is the thing Shine actually needs. He taps play BEFORE the
// routine. The phone starts navigating here and this request simply does not
// answer. Safari keeps the page on screen with a loading bar, which looks like
// a video buffering, and the navigation stays open and un-finished. When the
// song is dialled, the commit below answers every held request with a 302 to
// the video -- and it is still the same navigation his finger started.
const ytWaiters = new Map();

function ytRelease(key, videoId) {
  const held = ytWaiters.get(key) || [];
  ytWaiters.set(key, []);
  for (const r of held) {
    try { if (!r.headersSent) r.redirect(302, "https://www.youtube.com/watch?v=" + videoId); }
    catch (e) { /* the phone went away; nothing to do */ }
  }
  return held.length;
}

app.get("/yt-wait/:room", (req, res) => {
  const key = normalizeRoom(req.params.room);
  const state = ytRoom(key);
  res.setHeader("Cache-Control", "no-store");

  // Already holding a song: answer at once. Covers the phone that opens the
  // page after the send, and a second tap.
  if (state.mode === "play" && state.videoId) {
    return res.redirect(302, "https://www.youtube.com/watch?v=" + state.videoId);
  }

  const held = ytWaiters.get(key) || [];
  held.push(res);
  ytWaiters.set(key, held);

  // Safari gives up on a request that never answers, and a spinner that dies
  // in a spectator's hand is worse than one that quietly starts again. Forty
  // seconds is inside every mobile timeout and is a very long time to stand
  // there holding a phone.
  const giveUp = setTimeout(() => {
    const arr = ytWaiters.get(key) || [];
    const i = arr.indexOf(res);
    if (i >= 0) arr.splice(i, 1);
    try { if (!res.headersSent) res.redirect(302, "/y/" + key); } catch (e) {}
  }, 40000);

  res.on("close", () => {
    clearTimeout(giveUp);
    const arr = ytWaiters.get(key) || [];
    const i = arr.indexOf(res);
    if (i >= 0) arr.splice(i, 1);
  });
});

app.get("/yt-go/:id", (req, res) => {
  const id = String(req.params.id || "");
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return res.status(400).send("bad id");
  res.setHeader("Cache-Control", "no-store");
  res.redirect(302, "https://www.youtube.com/watch?v=" + id);
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
