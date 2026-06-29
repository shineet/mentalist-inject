import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

/** bump on deploy */
const REVISION = "v81-show-dock";

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
      setState(room, defaultState());
      broadcastState(room);
      return res.json({ ok: true, room, state: getState(room) });
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
  phase: "idle", // idle | reveal_sequence | revealed | review | karaoke_prepare | karaoke
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

  clientSplash: {
    enabled: true,
    durationMs: 3000,
    textSize: 6.2,
    card1: "Hope you enjoyed my show",
    card2: "Let\\'s all wish Kylie a very happy B'Day",
    photoMessage: "Thank you — one last quick thing ❤️",
  },

  reviewMode: { autoRedirect: true, autoRedirectDelayMs: 3000, thankTitle: "", thankMessage: "" },

  karaoke: { audioUrl: "", lrcUrl: "", bgUrl: "", title: "" },

  lastUpdateTs: Date.now(),
});

const roomStates = new Map();
function getState(room) {
  const key = normalizeRoom(room);
  if (!roomStates.has(key)) roomStates.set(key, defaultState());
  return roomStates.get(key);
}
function setState(room, nextState) {
  const key = normalizeRoom(room);
  roomStates.set(key, nextState);
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
    setState(room, defaultState());
    broadcastState(room);
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
