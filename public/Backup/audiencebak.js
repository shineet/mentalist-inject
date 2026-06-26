const socket = io({
  transports: ["websocket"],
  upgrade: false,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 2000,
  timeout: 20000,
});


// ================= REVEAL/REVIEW BACKGROUND MUSIC =================
// iOS Safari requires a user gesture before audio can play.
// We unlock audio on the first user interaction anywhere on the page.
const revealMusic = new Audio("/music.mp3");
const reviewMusic = new Audio("/review.mp3");
revealMusic.loop = true;
reviewMusic.loop = true;
revealMusic.preload = "auto";
reviewMusic.preload = "auto";
revealMusic.volume = 0.7;
reviewMusic.volume = 0.7;

let audioUnlocked = false;

function stopAllMusic() {
  try { revealMusic.pause(); revealMusic.currentTime = 0; } catch {}
  try { reviewMusic.pause(); reviewMusic.currentTime = 0; } catch {}
}

async function primeAudioEl(a) {
  const prevVol = a.volume;
  try { a.volume = 0.0; } catch {}
  try { await a.play(); a.pause(); a.currentTime = 0; } catch {}
  try { a.volume = prevVol; } catch {}
}

async function unlockAudio() {
  if (audioUnlocked) return;
  await primeAudioEl(revealMusic);
  await primeAudioEl(reviewMusic);
  audioUnlocked = true;
  window.removeEventListener("pointerdown", unlockAudio, true);
  window.removeEventListener("touchstart", unlockAudio, true);
  window.removeEventListener("keydown", unlockAudio, true);
}

// Capture first interaction to unlock audio (no UI change)
window.addEventListener("pointerdown", unlockAudio, true);
window.addEventListener("touchstart", unlockAudio, true);
window.addEventListener("keydown", unlockAudio, true);

async function setMusicForPhase(phase) {
  if (!audioUnlocked) return;

  if (phase === "reveal_sequence" || phase === "revealed") {
    try { reviewMusic.pause(); reviewMusic.currentTime = 0; } catch {}
    try { await revealMusic.play(); } catch {}
    return;
  }

  if (phase === "review") {
    try { revealMusic.pause(); revealMusic.currentTime = 0; } catch {}
    try { await reviewMusic.play(); } catch {}
    return;
  }

  // idle or anything else
  stopAllMusic();
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopAllMusic();
});
// ================================================================


socket.emit("client:role", "audience");

const DEFAULT_LOGO_PATH = "/logo.png";

const fxLayer = document.getElementById("fxLayer");

const views = {
  idle: document.getElementById("viewIdle"),
  logo: document.getElementById("viewLogo"),
  anim: document.getElementById("viewAnim"),
  reveal: document.getElementById("viewReveal"),
  client: document.getElementById("viewClient"),
  review: document.getElementById("viewReview"),
};

const logoImg = document.getElementById("logoImg");
const revealImg = document.getElementById("revealImg");
const revealFrame = document.getElementById("revealFrame");
const frameFallback = document.getElementById("frameFallback");
const btnOpenReveal = document.getElementById("btnOpenReveal");

const clientCard = document.getElementById("clientCard");
const clientImg = document.getElementById("clientImg");
const clientMsg = document.getElementById("clientMsg");

const btnReview = document.getElementById("btnReview");
const countdownEl = document.getElementById("countdown");

// Heart sound UI
const soundHint = document.getElementById("soundHint");
const btnEnableSound = document.getElementById("btnEnableSound");

let redirectTimer = null;
let countdownInterval = null;
let running = false;
let lastPhase = null;
let lastSeq = 0;

// Prevent reloading reveal media when host refreshes
let currentRevealUrl = null;
let currentRevealType = null;

// ---------- Warm preload for client.png (prevents “sometimes not showing”) ----------
let _clientWarm = false;
function warmClientImage() {
  if (_clientWarm) return;
  _clientWarm = true;
  const img = new Image();
  img.src = "/client.png";
}
warmClientImage();

// ---------- Connection banner ----------
const netBanner = document.createElement("div");
netBanner.style.cssText = [
  "position:fixed",
  "left:12px",
  "right:12px",
  "top:10px",
  "z-index:9999",
  "padding:10px 12px",
  "border-radius:14px",
  "background:rgba(0,0,0,0.72)",
  "backdrop-filter: blur(8px)",
  "color:#fff",
  "font: 600 13px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial",
  "display:none",
].join(";");
netBanner.textContent = "Reconnecting… keep this page open";
document.body.appendChild(netBanner);

function showNetBanner(show, text) {
  if (text) netBanner.textContent = text;
  netBanner.style.display = show ? "block" : "none";
}

let pollTimer = null;
async function pollStateOnce() {
  try {
    const r = await fetch(`/state.json?v=${Date.now()}`, { cache: "no-store" });
    const j = await r.json();
    if (j?.ok && j.state) await handleStateUpdate(j.state);
  } catch {}
}

function startPollingFallback() {
  if (pollTimer) return;
  pollTimer = setInterval(pollStateOnce, 2500);
  pollStateOnce();
}
function stopPollingFallback() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

// ---------- Heartbeat sound (WebAudio) ----------
let audioCtx = null;
let beatsTimer = null;

function ensureAudioCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  }
  return audioCtx;
}

function playThump() {
  const ctx = ensureAudioCtx();
  if (!ctx) return;

  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(85, now);
  osc.frequency.exponentialRampToValueAtTime(55, now + 0.08);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.25, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

  const osc2 = ctx.createOscillator();
  osc2.type = "triangle";
  osc2.frequency.setValueAtTime(180, now);
  const gain2 = ctx.createGain();
  gain2.gain.setValueAtTime(0.0001, now);
  gain2.gain.exponentialRampToValueAtTime(0.08, now + 0.008);
  gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

  osc.connect(gain).connect(ctx.destination);
  osc2.connect(gain2).connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.16);
  osc2.start(now);
  osc2.stop(now + 0.06);
}

function stopBeats() {
  if (beatsTimer) clearInterval(beatsTimer);
  beatsTimer = null;
}

async function startBeats() {
  const ctx = ensureAudioCtx();
  if (!ctx) return false;

  try {
    if (ctx.state === "suspended") await ctx.resume();
    if (soundHint) soundHint.classList.add("hidden");

    stopBeats();
    const period = 1050;

    playThump();
    setTimeout(playThump, 180);

    beatsTimer = setInterval(() => {
      playThump();
      setTimeout(playThump, 180);
    }, period);

    return true;
  } catch {
    return false;
  }
}

function maybeStartBeatsWithFallback() {
  startBeats().then((ok) => {
    if (!ok && soundHint) soundHint.classList.remove("hidden");
  });
}

if (btnEnableSound) {
  btnEnableSound.addEventListener("click", async () => {
    const ok = await startBeats();
    if (!ok && soundHint) soundHint.classList.remove("hidden");
  });
}

// ---------- FX ----------
function clearFx() {
  if (fxLayer) fxLayer.innerHTML = "";
}

function spawnFancyFx(durationMs) {
  clearFx();
  if (!fxLayer) return;

  const emojis = ["✨", "💫", "🌟", "🪄", "💖", "❤️"];
  const count = 38;

  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    el.className = "fx";
    el.textContent = emojis[Math.floor(Math.random() * emojis.length)];

    const left = Math.random() * 100;
    const startY = 100 + Math.random() * 30;
    const size = 18 + Math.random() * 22;

    const dur = Math.max(2800, durationMs * (0.6 + Math.random() * 0.9));
    el.style.left = `${left}vw`;
    el.style.top = `${startY}vh`;
    el.style.fontSize = `${size}px`;
    el.style.setProperty("--dur", `${dur}ms`);
    el.style.animationDelay = `${Math.random() * 900}ms`;

    fxLayer.appendChild(el);
  }

  setTimeout(() => clearFx(), Math.max(1200, durationMs + 1500));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function stopRedirectStuff() {
  if (redirectTimer) clearTimeout(redirectTimer);
  redirectTimer = null;
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = null;
  countdownEl.textContent = "";
}

function showOnly(key) {
  Object.entries(views).forEach(([k, el]) => {
    el.classList.toggle("hidden", k !== key);
  });
}

function showRevealAs(type) {
  const isImage = type === "image";
  revealImg.classList.toggle("hidden", !isImage);
  revealFrame.classList.toggle("hidden", isImage);
  frameFallback.classList.add("hidden");
}

function setRevealContent(state) {
  const type = state.revealType || "page";
  const url = (state.revealUrl || "").trim();
  if (!url) return;

  // Guard: avoid reloading the same content (prevents jitter on audience devices)
  if (currentRevealUrl === url && currentRevealType === type) return;

  currentRevealUrl = url;
  currentRevealType = type;

  showRevealAs(type);

  if (type === "image") {
    if (revealImg.src !== url) revealImg.src = url;
  } else {
    if (revealFrame.src !== url) revealFrame.src = url;
    setTimeout(() => {
      frameFallback.classList.remove("hidden");
      btnOpenReveal.onclick = () => window.open(url, "_blank");
    }, 1200);
  }
}

async function showClientTextCard(text, durationMs) {
  if (!text) return;
  if (!views.client) return;

  showOnly("client");
  views.client.classList.add("fadeCine");
  views.client.classList.add("show");

  if (clientCard) {
    clientCard.textContent = text;
    clientCard.classList.remove("hidden");
  }
  if (clientImg) clientImg.classList.add("hidden");
  if (clientMsg) clientMsg.classList.add("hidden");

  const FADE_MS = 520;
  const holdMs = Math.max(0, durationMs - FADE_MS * 2);
  await wait(FADE_MS + holdMs);

  views.client.classList.remove("show");
  await wait(FADE_MS + 40);
}

async function showClientPhotoStep(state, durationMs) {
  const cfg = state.clientSplash || {};
  const msg = (cfg.photoMessage || "").trim();

  if (!views.client) return false;

  showOnly("client");
  views.client.classList.add("fadeCine");
  views.client.classList.add("show");

  if (clientCard) clientCard.classList.add("hidden");
  if (clientMsg) {
    clientMsg.textContent = msg || "";
    clientMsg.classList.toggle("hidden", !msg);
  }

  const MAX_WAIT_MS = 4500;
  const url = `/client.png?v=${Date.now()}`;

  const loadPromise = new Promise((resolve) => {
    const img = new Image();
    img.onload = async () => {
      try { if (img.decode) await img.decode(); } catch {}
      resolve(true);
    };
    img.onerror = () => resolve(false);
    img.src = url;
  });

  const ok = await Promise.race([
    loadPromise,
    new Promise((resolve) => setTimeout(() => resolve(false), MAX_WAIT_MS)),
  ]);

  if (clientImg) {
    if (ok) {
      clientImg.src = url;
      clientImg.classList.remove("hidden");
    } else {
      clientImg.classList.add("hidden");
    }
  }

  const FADE_MS = 520;
  const holdMs = Math.max(0, durationMs - FADE_MS * 2);
  await wait(FADE_MS + holdMs);

  views.client.classList.remove("show");
  await wait(FADE_MS + 40);

  return ok;
}

// New: 2 text cards + photo step (duration applies to EACH step)
async function showClientSplashIfPresent(state) {
  const cfg = state.clientSplash || {};
  const enabled = cfg.enabled !== false;
  const durationMs = Number(cfg.durationMs ?? 0);

  if (!enabled || durationMs <= 0) return false;

  const c1 = (cfg.card1 || "").trim();
  const c2 = (cfg.card2 || "").trim();

  if (c1) await showClientTextCard(c1, durationMs);
  if (c2) await showClientTextCard(c2, durationMs);

  return await showClientPhotoStep(state, durationMs);
}

async function runRevealSequence(state) {
  const url = (state.revealUrl || "").trim();
  if (!url) return;

  stopBeats();
  clearFx();

  if (state.skipAnimation) {
    setRevealContent(state);
    showOnly("reveal");
    return;
  }

  const chosenLogo = state.logoUrl?.trim() ? state.logoUrl.trim() : DEFAULT_LOGO_PATH;
  logoImg.src = chosenLogo;

  const logoMs = Number(state.timings?.logoMs ?? 4000);
  const animationMs = Number(state.timings?.animationMs ?? 12000);

  showOnly("logo");
  await wait(logoMs);

  showOnly("anim");
  spawnFancyFx(animationMs);
  await wait(animationMs);
  clearFx();

  setRevealContent(state);
  showOnly("reveal");

  socket.emit("host:revealComplete");
}

function startReviewFlow(state) {
  stopRedirectStuff();
  stopBeats();
  clearFx();

  const url = (state.reviewUrl || "").trim();
  if (!url) return;

  btnReview.onclick = () => (window.location.href = url);

  showOnly("review");

  const auto = !!state.reviewMode?.autoRedirect;
  const delayMs = Number(state.reviewMode?.autoRedirectDelayMs ?? 3000);

  if (!auto) return;

  let remaining = Math.ceil(delayMs / 1000);
  countdownEl.textContent = `Redirecting in ${remaining}s…`;

  countdownInterval = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(countdownInterval);
      countdownInterval = null;
      countdownEl.textContent = "Redirecting…";
    } else {
      countdownEl.textContent = `Redirecting in ${remaining}s…`;
    }
  }, 1000);

  redirectTimer = setTimeout(() => (window.location.href = url), Math.max(0, delayMs));
}

setInterval(() => {
  if (socket.connected) socket.emit("client:keepalive");
}, 20000);

socket.on("state:update", async (state) => {
  await handleStateUpdate(state);
});

async function handleStateUpdate(state) {
  const seq = Number(state.seq || 0);
  if (seq && seq < lastSeq) return;
  if (seq) lastSeq = seq;

  const phase = state.phase;

  if (phase !== lastPhase) {
    stopRedirectStuff();
    clearFx();
  }
  lastPhase = phase;

  if (phase === "idle") {
    running = false;
    showOnly("idle");
    maybeStartBeatsWithFallback();
    return;
  }

  if (phase === "reveal_sequence") {
    if (running) return;
    running = true;
    await runRevealSequence(state);
    running = false;
    return;
  }

  if (phase === "revealed") {
    stopBeats();
    clearFx();
    setRevealContent(state);
    showOnly("reveal");
    return;
  }

  if (phase === "review") {
    await showClientSplashIfPresent(state);
    startReviewFlow(state);
    return;
  }

  showOnly("idle");
  maybeStartBeatsWithFallback();
}

socket.on("connect", async () => {
  socket.emit("client:role", "audience");
  showNetBanner(false);
  stopPollingFallback();
  await pollStateOnce();
});

socket.on("disconnect", () => {
  running = false;
  showNetBanner(true, "Reconnecting… keep this page open");
  startPollingFallback();
});
