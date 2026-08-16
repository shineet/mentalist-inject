import express from "express";
import http from "http";
import { Server } from "socket.io";
import fs from "fs";
import path from "path";

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

/** bump on deploy */
const REVISION = "v140-interactive-emoji-routine";

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

  // "Interactive" routine: a grid of emoji, a handful of instructions, and the
  // whole room ends on the same one. round -1 is the grid with no instruction
  // yet -- the beat where everyone picks freely. 0..n-1 step through the
  // instructions. revealed vanishes everything except the target.
  // The grid, the instructions and the guarantee that they converge all live
  // in public/interactive-set.js; the server only tracks where we are.
  interactive: { round: -1, revealed: false },

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

server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on http://0.0.0.0:${PORT} • ${REVISION}`);
});
