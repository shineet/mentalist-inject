const socket = io({
  // Let Socket.IO use WebSocket when available and fall back to polling if needed.
  // This is more reliable on mobile networks and venue Wi‑Fi.
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 400,
  reconnectionDelayMax: 2000,
  timeout: 20000,
});

function getRoomName() {
  const params = new URLSearchParams(window.location.search);
  const raw = (params.get("room") || params.get("r") || "SHOW").trim();
  return (raw || "SHOW").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "SHOW";
}

const ROOM = getRoomName();
try { document.title = `Audience - ${ROOM}`; } catch {}

// ================= REVEAL/REVIEW BACKGROUND MUSIC =================
// iOS Safari requires a user gesture before audio can play.
// We unlock audio on the first user interaction anywhere on the page.
const revealMusic = new Audio("/music.mp3");
const reviewMusic = new Audio("/review.mp3");
const karaokeMusic = new Audio();
karaokeMusic.preload = "auto";
karaokeMusic.volume = 1.0;
try { karaokeMusic.setAttribute?.("playsinline", ""); } catch {}

// Visible button is required on iPhone/Safari/Chrome mobile because audio cannot
// start from a host-triggered websocket event until the audience taps once.
let audioEnableBtn = null;
function ensureAudioEnableButton() {
  if (audioEnableBtn) return audioEnableBtn;
  const existingEnableButton = document.getElementById("btnEnableSound");
  if (existingEnableButton) {
    audioEnableBtn = existingEnableButton;
    try { audioEnableBtn.addEventListener("click", unlockAudio, true); } catch {}
    return audioEnableBtn;
  }
  audioEnableBtn = document.createElement("button");
  audioEnableBtn.id = "audioEnableBtn";
  audioEnableBtn.textContent = "Tap to Enable Sound";
  audioEnableBtn.style.cssText = [
    "position:fixed", "left:50%", "bottom:22px", "transform:translateX(-50%)",
    "z-index:999999", "border:0", "border-radius:999px", "padding:14px 20px",
    "font:700 16px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif",
    "background:#7c5cff", "color:white", "box-shadow:0 10px 30px rgba(0,0,0,.35)",
    "cursor:pointer"
  ].join(";");
  audioEnableBtn.addEventListener("click", unlockAudio, true);
  document.addEventListener("DOMContentLoaded", () => {
    if (!audioUnlocked && !document.body.contains(audioEnableBtn)) document.body.appendChild(audioEnableBtn);
  });
  if (document.body && !document.body.contains(audioEnableBtn)) document.body.appendChild(audioEnableBtn);
  return audioEnableBtn;
}
function hideAudioEnableButton() {
  try { audioEnableBtn?.remove(); } catch {}
  try { document.getElementById("soundHint")?.classList.add("hidden"); } catch {}
}
ensureAudioEnableButton();
revealMusic.loop = true;
reviewMusic.loop = true;
revealMusic.preload = "auto";
reviewMusic.preload = "auto";
revealMusic.volume = 0.7;
reviewMusic.volume = 0.7;

function setAudioSource(audio, url) {
  const next = (url || "").trim();
  if (!next || audio.src === new URL(next, window.location.href).href) return;
  try { audio.pause(); audio.currentTime = 0; } catch {}
  audio.src = next;
  try { audio.load(); } catch {}
}

function updateMediaSources(state) {
  setAudioSource(revealMusic, state?.revealMusicUrl || state?.musicUrl || "/music.mp3");
  setAudioSource(reviewMusic, state?.reviewMusicUrl || state?.reviewAudioUrl || "/review.mp3");
}

// Some mobile browsers behave better if these are explicitly inline.
try { revealMusic.setAttribute?.("playsinline", ""); } catch {}
try { reviewMusic.setAttribute?.("playsinline", ""); } catch {}

let audioUnlocked = false;
let pendingMusicPhase = "idle"; // track latest phase so music can start right after unlock

function stopAllMusic() {
  try { revealMusic.pause(); revealMusic.currentTime = 0; } catch {}
  try { reviewMusic.pause(); reviewMusic.currentTime = 0; } catch {}
  stopKaraoke(false);
}

// Prime without awaiting: keeps it inside the gesture call stack on iOS.
function primeMediaEl(a) {
  try { a.muted = true; } catch {}
  const p = a.play?.();
  if (p && typeof p.then === "function") {
    p.then(() => {
      try { a.pause(); a.currentTime = 0; } catch {}
      try { a.muted = false; } catch {}
    }).catch(() => {
      try { a.muted = false; } catch {}
    });
  } else {
    // Older browsers: best effort
    try { a.pause(); a.currentTime = 0; } catch {}
    try { a.muted = false; } catch {}
  }
}

function unlockAudio() {
  if (audioUnlocked) return;

  primeMediaEl(revealMusic);
  primeMediaEl(reviewMusic);

  audioUnlocked = true;
  hideAudioEnableButton();

  window.removeEventListener("pointerdown", unlockAudio, true);
  window.removeEventListener("touchstart", unlockAudio, true);
  window.removeEventListener("keydown", unlockAudio, true);

  // If we already received a phase before unlock, start the right track now.
  try { setMusicForPhase(pendingMusicPhase); } catch {}
}

// Audio unlock happens only from the visible Enable Sound button.
// This prevents the button from disappearing after an accidental page tap.

async function setMusicForPhase(phase) {
  if (phase === "karaoke") return;
  if (!audioUnlocked) { ensureAudioEnableButton(); return; }

  if (phase === "reveal_sequence" || phase === "revealed") {
    try { reviewMusic.pause(); reviewMusic.currentTime = 0; } catch {}
    try { await revealMusic.play(); } catch (err) { ensureAudioEnableButton(); }
    return;
  }

  if (phase === "review") {
    try { revealMusic.pause(); revealMusic.currentTime = 0; } catch {}
    try { await reviewMusic.play(); } catch (err) { ensureAudioEnableButton(); }
    return;
  }

  // idle or anything else
  stopAllMusic();
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopAllMusic();
});
// ================================================================


socket.emit("client:role", { role: "audience", room: ROOM });

const DEFAULT_LOGO_PATH = "/logo.png";

const fxLayer = document.getElementById("fxLayer");

const views = {
  idle: document.getElementById("viewIdle"),
  logo: document.getElementById("viewLogo"),
  anim: document.getElementById("viewAnim"),
  reveal: document.getElementById("viewReveal"),
  client: document.getElementById("viewClient"),
  review: document.getElementById("viewReview"),
  karaoke: document.getElementById("viewKaraoke"),
};

const logoImg = document.getElementById("logoImg");
const revealImg = document.getElementById("revealImg");
const revealFrame = document.getElementById("revealFrame");
const frameFallback = document.getElementById("frameFallback");
const btnOpenReveal = document.getElementById("btnOpenReveal");

const clientCard = document.getElementById("clientCard");
const clientImg = document.getElementById("clientImg");
const clientMsg = document.getElementById("clientMsg");

const karaokeBg = document.getElementById("karaokeBg");
const karaokeTitleEl = document.getElementById("karaokeTitleEl");
const karaokePrev = document.getElementById("karaokePrev");
const karaokeCurrent = document.getElementById("karaokeCurrent");
const karaokeNext = document.getElementById("karaokeNext");
const btnKaraokeStart = document.getElementById("btnKaraokeStart");
const karaokeStatus = document.getElementById("karaokeStatus");
let karaokeLines = [];
let karaokeTimer = null;
let lastKaraokeKey = "";
let lastKaraokeState = null;
let karaokeUserStarted = false;
let karaokeReady = false;
let lastKaraokePhase = "idle";
let lastKaraokeResyncAt = 0;

// Larger, formatted text cards. New lines typed on the host page are preserved.
function applyClientTextStyle(state = {}) {
  if (!clientCard) return;
  const cfg = state.clientSplash || {};
  const size = Math.min(10, Math.max(3, Number(cfg.textSize || cfg.fontSizeVw || 6.2)));
  clientCard.style.whiteSpace = "pre-line";
  clientCard.style.fontSize = `clamp(34px, ${size}vw, 96px)`;
  clientCard.style.lineHeight = "1.08";
  clientCard.style.width = "min(96vw, 1220px)";
  clientCard.style.maxWidth = "96vw";
  clientCard.style.minHeight = "58vh";
  clientCard.style.padding = "clamp(24px, 4.2vw, 68px)";
  clientCard.style.display = "flex";
  clientCard.style.alignItems = "center";
  clientCard.style.justifyContent = "center";
  clientCard.style.textAlign = "center";
  clientCard.style.overflowWrap = "break-word";
}


const btnReview = document.getElementById("btnReview");
const countdownEl = document.getElementById("countdown");
const reviewTitleEl = document.getElementById("reviewTitle");
const reviewMsgEl = document.getElementById("reviewMsg");
const idleHeart = document.getElementById("idleHeart");
const idleLogo = document.getElementById("idleLogo");

// Corporate mode: show the company logo on the waiting screen instead of the
// heart. Returns true when the logo is shown (so the caller can silence beats).
function applyIdleVisual(state = {}) {
  const url = (state.idleLogoUrl || "").trim();
  const showLogo = !!state.corporateMode && !!url;
  if (showLogo) {
    if (idleLogo && idleLogo.getAttribute("src") !== url) idleLogo.src = url;
    idleLogo?.classList.remove("hidden");
    idleHeart?.classList.add("hidden");
  } else {
    idleLogo?.classList.add("hidden");
    idleHeart?.classList.remove("hidden");
  }
  return showLogo;
}

// Heart sound UI
const soundHint = document.getElementById("soundHint");
const btnEnableSound = document.getElementById("btnEnableSound");

let redirectTimer = null;
let countdownInterval = null;
let running = false;
let lastPhase = null;
let lastSeq = 0;
let runToken = 0;
function isCurrentRun(token) { return token === runToken; }

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

// Auto-reload when a newer build is deployed, so a left-open audience phone can
// never run stale code. The server revision arrives in the /state.json poll. We
// remember the revision the page loaded with; if it changes we reload — but ONLY
// on the idle screen with nothing running, so a reveal/karaoke/review is never
// interrupted. (Deploys reset the room to idle, so phones refresh between shows.)
let loadedRevision = null;
let reloadingForUpdate = false;
function maybeReloadForNewVersion(serverRevision, phase) {
  if (!serverRevision || reloadingForUpdate) return;
  if (loadedRevision === null) { loadedRevision = serverRevision; return; }
  if (serverRevision === loadedRevision) return;
  if (phase === "idle" && !running) {
    reloadingForUpdate = true;
    try { location.reload(); } catch { reloadingForUpdate = false; }
  }
  // If not idle, do nothing now; a later poll will reload once we return to idle.
}

let pollTimer = null;
async function pollStateOnce() {
  try {
    const r = await fetch(`/state.json?room=${encodeURIComponent(ROOM)}&v=${Date.now()}`, { cache: "no-store" });
    const j = await r.json();
    if (j?.ok && j.state) await handleStateUpdate(j.state);
    if (j?.ok) maybeReloadForNewVersion(j.revision, j.state?.phase);
  } catch {}
}

function startPollingFallback() {
  if (pollTimer) return;
  // Always keep a light polling backup running. This makes the show reliable even
  // if the phone temporarily misses a WebSocket event.
  pollTimer = setInterval(pollStateOnce, 1000);
  pollStateOnce();
}
function stopPollingFallback() {
  // Intentionally keep polling available; do not stop it on reconnect.
  // The handler ignores already-seen seq numbers, so this is safe.
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
    // Do not hide the Enable Sound control here. Only unlockAudio() hides it.

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
    try { unlockAudio(); } catch {}
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
  // No manual "Open Reveal" button. The reveal page/image should fill the screen.
  try { frameFallback?.classList.add("hidden"); } catch {}
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
    revealFrame.style.marginTop = "0px";
    revealFrame.style.height = "calc(100vh - 85px)";
    revealFrame.style.width = "100vw";
    revealFrame.style.border = "0";
    if (revealFrame.src !== url) revealFrame.src = url;
  }
}

async function showClientTextCard(text, durationMs, state = {}) {
  if (!text) return;
  if (!views.client) return;

  showOnly("client");
  views.client.classList.add("fadeCine");
  views.client.classList.add("show");

  if (clientCard) {
    applyClientTextStyle(state);
    clientCard.textContent = String(text || "").replace(/\\n/g, "\n");
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
  const configuredUrl = (state?.clientImageUrl || cfg.clientImageUrl || cfg.imageUrl || cfg.photoUrl || "/client.png").trim();
  const url = configuredUrl.includes("?") ? `${configuredUrl}&v=${Date.now()}` : `${configuredUrl}?v=${Date.now()}`;

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
async function showClientSplashIfPresent(state, token) {
  // Corporate mode skips the personal message cards + client photo entirely and
  // goes straight to the thank-you / review screen.
  if (state.corporateMode) return false;

  const cfg = state.clientSplash || {};
  const enabled = cfg.enabled !== false;
  const durationMs = Number(cfg.durationMs ?? 0);

  if (!enabled || durationMs <= 0) return false;

  const c1 = (cfg.card1 || "").trim();
  const c2 = (cfg.card2 || "").trim();
  const c3 = (cfg.card3 || "").trim();
  const c4 = (cfg.card4 || "").trim();
  const c5 = (cfg.card5 || "").trim();

  if (c1) { await showClientTextCard(c1, durationMs, state); if (token && !isCurrentRun(token)) return false; }
  if (c2) { await showClientTextCard(c2, durationMs, state); if (token && !isCurrentRun(token)) return false; }
  if (c3) { await showClientTextCard(c3, durationMs, state); if (token && !isCurrentRun(token)) return false; }
  if (c4) { await showClientTextCard(c4, durationMs, state); if (token && !isCurrentRun(token)) return false; }
  if (c5) { await showClientTextCard(c5, durationMs, state); if (token && !isCurrentRun(token)) return false; }

  const ok = await showClientPhotoStep(state, durationMs);
  if (token && !isCurrentRun(token)) return false;
  return ok;
}

async function runRevealSequence(state, token) {
  const url = (state.revealUrl || "").trim();
  if (!url) return;

  stopBeats();
  clearFx();

  if (state.skipAnimation) {
    if (token && !isCurrentRun(token)) return;
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
  if (token && !isCurrentRun(token)) return;

  showOnly("anim");
  spawnFancyFx(animationMs);
  await wait(animationMs);
  if (token && !isCurrentRun(token)) return;
  clearFx();

  setRevealContent(state);
  showOnly("reveal");

  // Do not auto-change server phase here. Keeping the room in reveal_sequence until the host clicks Review or Reset prevents other audience devices from cancelling mid-animation.
}


function cleanLyricText(raw) {
  let t = String(raw || "");
  // Some generators/export paths save lyrics with HTML spans/br tags. Remove those safely.
  t = t.replace(/<\s*br\s*\/?>/gi, "\n");
  t = t.replace(/<[^>]*>/g, "");
  t = t.replace(/&nbsp;/gi, " ");
  t = t.replace(/&amp;/gi, "&");
  t = t.replace(/&lt;/gi, "<");
  t = t.replace(/&gt;/gi, ">");
  t = t.replace(/&quot;/gi, '"');
  t = t.replace(/&#39;/g, "'");
  t = t.replace(/\s+\n/g, "\n").replace(/\n\s+/g, "\n").replace(/[ \t]{2,}/g, " ");
  return t.trim();
}

function parseLrcText(text) {
  const out = [];
  const normalized = cleanLyricText(text);
  const lines = String(normalized || "").split(/\r?\n/);
  for (const line of lines) {
    const tags = [...line.matchAll(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g)];
    if (!tags.length) continue;
    const lyric = cleanLyricText(line.replace(/\[[^\]]+\]/g, "")).replace(/\n+/g, " ").trim();
    if (!lyric) continue;
    for (const tag of tags) {
      const min = Number(tag[1] || 0);
      const sec = Number(tag[2] || 0);
      const frac = String(tag[3] || "0").padEnd(3, "0").slice(0, 3);
      out.push({ time: min * 60 + sec + Number(frac) / 1000, text: lyric });
    }
  }
  return out.sort((a, b) => a.time - b.time);
}

function renderKaraokeLine() {
  if (!karaokeLines.length) return;
  const t = Number(karaokeMusic.currentTime || 0);
  let idx = 0;
  for (let i = 0; i < karaokeLines.length; i++) {
    if (karaokeLines[i].time <= t + 0.08) idx = i;
    else break;
  }
  karaokePrev.textContent = idx > 0 ? karaokeLines[idx - 1].text : "";
  karaokeCurrent.textContent = karaokeLines[idx]?.text || "";
  karaokeNext.textContent = idx < karaokeLines.length - 1 ? karaokeLines[idx + 1].text : "";
}


async function preloadKaraokeSilently(state) {
  const k = state.karaoke || {};
  const audioUrl = (k.audioUrl || "").trim();
  const lrcUrl = (k.lrcUrl || "").trim();
  if (!audioUrl || !lrcUrl) return;

  lastKaraokeState = state;
  const key = `${audioUrl}|${lrcUrl}`;
  if (lastKaraokeKey === key && karaokeLines && karaokeLines.length) return;

  lastKaraokeKey = key;
  karaokeLines = [];
  karaokeReady = false;
  karaokeUserStarted = false;

  try {
    const r = await fetch(lrcUrl, { cache: "no-store" });
    if (r.ok) karaokeLines = parseLrcText(await r.text());
  } catch {}

  try {
    karaokeMusic.pause();
    karaokeMusic.preload = "auto";
    karaokeMusic.src = audioUrl;
    karaokeMusic.load();
  } catch {}
}


function stopKaraoke(clearScreen = true) {
  if (karaokeTimer) clearInterval(karaokeTimer);
  karaokeTimer = null;
  try { karaokeMusic.pause(); karaokeMusic.currentTime = 0; } catch {}
  lastKaraokePhase = "idle";
  if (clearScreen) {
    karaokeUserStarted = false;
    karaokeReady = false;
    if (karaokeStatus) karaokeStatus.textContent = "";
    if (btnKaraokeStart) btnKaraokeStart.classList.remove("hidden");
  }
}

async function prepareKaraoke(state, shouldAutoStart = false) {
  const k = state.karaoke || {};
  lastKaraokeState = state;
  lastKaraokePhase = shouldAutoStart ? "start" : "prepare";
  const audioUrl = (k.audioUrl || "").trim();
  const lrcUrl = (k.lrcUrl || "").trim();
  const bgUrl = (k.bgUrl || k.backgroundUrl || k.imageUrl || state.karaokeBgUrl || state.clientImageUrl || state.clientImage || "").trim();
  const title = (k.title || "").trim();
  const key = `${audioUrl}|${lrcUrl}`;

  stopBeats();
  clearFx();
  stopRedirectStuff();
  try { revealMusic.pause(); } catch {}
  try { reviewMusic.pause(); } catch {}
  showOnly("karaoke");

  if (karaokeBg) {
    const bgValue = bgUrl ? `url("${bgUrl.replace(/"/g, '%22')}")` : "radial-gradient(circle at top,#233,#050505 70%)";
    karaokeBg.style.backgroundImage = bgValue;
    karaokeBg.style.backgroundSize = "cover";
    karaokeBg.style.backgroundPosition = "center center";
    karaokeBg.style.backgroundRepeat = "no-repeat";
    karaokeBg.style.opacity = "0.6";
    if (bgUrl) {
      try { const img = new Image(); img.src = bgUrl; } catch {}
    }
  }
  const karaokeScreenEl = document.getElementById("karaokeScreen") || document.getElementById("karaoke");
  if (karaokeScreenEl && bgUrl) {
    karaokeScreenEl.style.backgroundImage = `linear-gradient(rgba(0,0,0,.58), rgba(0,0,0,.78)), url("${bgUrl.replace(/"/g, '%22')}")`;
    karaokeScreenEl.style.backgroundSize = "cover";
    karaokeScreenEl.style.backgroundPosition = "center center";
    karaokeScreenEl.style.backgroundRepeat = "no-repeat";
  }
  if (karaokeTitleEl) {
    karaokeTitleEl.textContent = title;
    karaokeTitleEl.classList.toggle("hidden", !title);
  }

  if (!audioUrl || !lrcUrl) {
    karaokeCurrent.textContent = "Karaoke URLs missing";
    karaokeStatus.textContent = "Enter MP3 URL and .LRC URL on the host page.";
    btnKaraokeStart.classList.add("hidden");
    return;
  }

  if (lastKaraokeKey !== key) {
    lastKaraokeKey = key;
    karaokeLines = [];
    karaokeReady = false;
    karaokeUserStarted = false;
    karaokeCurrent.textContent = "Preparing karaoke…";
    karaokePrev.textContent = "";
    karaokeNext.textContent = "";
    karaokeStatus.textContent = "Loading lyrics and preloading MP3…";
    try {
      const r = await fetch(lrcUrl, { cache: "no-store" });
      if (!r.ok) throw new Error(`Lyrics HTTP ${r.status}`);
      karaokeLines = parseLrcText(await r.text());
      if (!karaokeLines.length) throw new Error("No timestamped lyrics found");
    } catch (err) {
      karaokeCurrent.textContent = "Lyrics could not load";
      karaokeStatus.textContent = "Check that the .LRC file URL is public and contains timestamps like [00:03.10].";
      btnKaraokeStart.classList.add("hidden");
      return;
    }
    try {
      karaokeMusic.pause();
      karaokeMusic.preload = "auto";
      karaokeMusic.src = audioUrl;
      karaokeMusic.load();
    } catch {}
  } else {
    try { karaokeMusic.load(); } catch {}
  }

  karaokePrev.textContent = "";
  karaokeNext.textContent = karaokeLines[0]?.text || "";

  if (shouldAutoStart) {
    // Try to start automatically. If the audience already tapped Enable Sound
    // on the heart screen, most phones will allow this. If iPhone blocks it,
    // startKaraokePlayback() will show the fallback tap button.
    await startKaraokePlayback();
    return;
  }

  karaokeCurrent.textContent = "Karaoke Ready";
  karaokeStatus.textContent = karaokeReady
    ? "Ready. Wait for Shine to start."
    : "Tap once now to unlock sound. Then wait for Shine to start.";
  btnKaraokeStart.textContent = karaokeReady ? "Ready" : "Enable Sound & Ready";
  btnKaraokeStart.classList.toggle("hidden", karaokeReady);
}

async function unlockKaraokeForLater() {
  const state = lastKaraokeState;
  if (!state) return;
  if (btnKaraokeStart) btnKaraokeStart.classList.add("hidden");
  if (karaokeStatus) karaokeStatus.textContent = "Unlocking sound…";

  try {
    // iPhone Safari needs a user gesture. We start the same audio element briefly,
    // pause it, and keep it ready so the host's Start Karaoke can begin cleanly.
    try { karaokeMusic.pause(); } catch {}
    syncKaraokeToHostClock();
    await karaokeMusic.play();
    try { karaokeMusic.pause(); karaokeMusic.currentTime = 0; } catch {}
    audioUnlocked = true;
    karaokeUserStarted = true;
    karaokeReady = true;
    hideAudioEnableButton();
    if (karaokeCurrent) karaokeCurrent.textContent = "Karaoke Ready";
    if (karaokeStatus) karaokeStatus.textContent = "Ready. Wait for Shine to start.";
  } catch (err) {
    if (btnKaraokeStart) btnKaraokeStart.classList.remove("hidden");
    const detail = err && (err.name || err.message) ? ` (${err.name || err.message})` : "";
    if (karaokeStatus) karaokeStatus.textContent = `Could not unlock audio${detail}. Tap again, or check the MP3 URL.`;
  }
}


function getReviewUrlFromState(state = {}) {
  const k = state.karaoke || {};
  return (
    state.googleReviewUrl ||
    state.reviewUrl ||
    state.reviewLink ||
    state.googleUrl ||
    state.googleReview ||
    k.googleReviewUrl ||
    k.reviewUrl ||
    ""
  );
}

function goToGoogleReviewAfterKaraoke() {
  const state = lastKaraokeState || currentState || {};
  if (karaokeTimer) clearInterval(karaokeTimer);
  karaokeTimer = null;

  try { karaokeMusic.pause(); } catch {}

  if (btnKaraokeStart) btnKaraokeStart.classList.add("hidden");
  if (karaokePrev) karaokePrev.textContent = "";
  if (karaokeCurrent) karaokeCurrent.textContent = "Thank you!";
  if (karaokeNext) karaokeNext.textContent = "Please tap below to leave a quick review.";
  if (karaokeStatus) karaokeStatus.textContent = "Redirecting in a few seconds…";

  const reviewUrl = getReviewUrlFromState(state);

  setTimeout(() => {
    if (reviewUrl) {
      window.location.href = reviewUrl;
      return;
    }

    // Fallback: if your app has a built-in review screen function, use it only when no URL exists.
    try {
      if (typeof startReviewFlow === "function") startReviewFlow(state);
      else if (typeof renderReview === "function") renderReview(state);
    } catch {}
  }, 3500);
}



function getClientPhotoUrlFromState(state = {}) {
  const k = state.karaoke || {};
  return (
    state.karaokeEndPhotoUrl ||
    k.endPhotoUrl ||
    state.clientImageUrl ||
    state.clientImage ||
    state.clientPhotoUrl ||
    state.revealImageUrl ||
    state.revealUrl ||
    state.imageUrl ||
    state.finalImageUrl ||
    state.finalImage ||
    state.photoUrl ||
    k.bgUrl ||
    k.backgroundUrl ||
    k.imageUrl ||
    k.photoUrl ||
    ""
  );
}

function getClientPhotoDurationMsFromState(state = {}) {
  const candidates = [
    state.clientSplash?.durationMs,
    state.clientImageDurationMs,
    state.clientPhotoDurationMs,
    state.finalImageDurationMs,
    state.photoDurationMs,
    state.clientImageSeconds,
    state.clientPhotoSeconds,
    state.finalImageSeconds,
    state.photoSeconds,
    state.clientImageDuration,
    state.clientPhotoDuration,
    state.finalImageDuration,
    state.photoDuration
  ];

  for (const v of candidates) {
    if (v === undefined || v === null || v === "") continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) continue;
    // If value is small, treat as seconds. If large, treat as milliseconds.
    return n < 100 ? n * 1000 : n;
  }

  // Fallback if your original field is not exposed under a known name.
  return 5000;
}

async function showKaraokeEndPhotoThenReview() {
  const state = lastKaraokeState || currentState || {};
  const durationMs = getClientPhotoDurationMsFromState(state);
  const reviewUrl = getReviewUrlFromState(state);
  const photoUrl = getClientPhotoUrlFromState(state);

  if (karaokeTimer) clearInterval(karaokeTimer);
  karaokeTimer = null;
  try { karaokeMusic.pause(); } catch {}

  // Reuse the original, already-working client photo display used after message cards.
  // This avoids the blank screen issue caused by the separate karaoke end-photo screen.
  const photoState = {
    ...state,
    clientImageUrl: photoUrl || state.clientImageUrl,
    clientSplash: {
      ...(state.clientSplash || {}),
      photoMessage: "Thank you!"
    }
  };

  let shown = false;
  try {
    shown = await showClientPhotoStep(photoState, durationMs);
  } catch {}

  if (!shown) {
    if (btnKaraokeStart) btnKaraokeStart.classList.add("hidden");
    if (karaokePrev) karaokePrev.textContent = "";
    if (karaokeCurrent) karaokeCurrent.textContent = "Thank you!";
    if (karaokeNext) karaokeNext.textContent = "";
    if (karaokeStatus) karaokeStatus.textContent = "Redirecting in a few seconds…";
    await wait(Math.max(2500, durationMs || 3500));
  }

  if (reviewUrl) {
    window.location.href = reviewUrl;
    return;
  }

  try {
    if (typeof startReviewFlow === "function") startReviewFlow(state);
    else if (typeof renderReview === "function") renderReview(state);
  } catch {}
}


function getKaraokeElapsedSeconds() {
  const state = lastKaraokeState || currentState || {};
  const startedAt = Number(state.karaokeStartedAt || 0);
  if (!startedAt) return 0;
  return Math.max(0, (Date.now() - startedAt) / 1000);
}

function syncKaraokeToHostClock() {
  const elapsed = getKaraokeElapsedSeconds();
  if (!Number.isFinite(elapsed) || elapsed <= 0) return 0;
  try {
    const dur = Number(karaokeMusic.duration || 0);
    const safeElapsed = dur > 0 ? Math.min(elapsed, Math.max(0, dur - 0.25)) : elapsed;
    if (Math.abs((karaokeMusic.currentTime || 0) - safeElapsed) > 0.35) {
      karaokeMusic.currentTime = safeElapsed;
    }
    return safeElapsed;
  } catch {
    return elapsed;
  }
}


async function startKaraokePlayback() {
  const state = lastKaraokeState;
  if (!state) return;
  karaokeUserStarted = true;
  karaokeReady = true;
  if (btnKaraokeStart) btnKaraokeStart.classList.add("hidden");
  if (karaokeStatus) karaokeStatus.textContent = "Starting…";

  try {
    try { karaokeMusic.pause(); } catch {}
    syncKaraokeToHostClock();
    await karaokeMusic.play();
    audioUnlocked = true;
    hideAudioEnableButton();
    if (karaokeStatus) karaokeStatus.textContent = "";
    renderKaraokeLine();
    if (karaokeTimer) clearInterval(karaokeTimer);
    karaokeTimer = setInterval(renderKaraokeLine, 90);
    karaokeMusic.onended = () => { showKaraokeEndPhotoThenReview(); };
  } catch (err) {
    if (btnKaraokeStart) {
      btnKaraokeStart.textContent = "No audio? Tap here";
      setTimeout(() => {
        btnKaraokeStart.classList.remove("hidden");
      }, 2200);
    }
    const detail = err && (err.name || err.message) ? ` (${err.name || err.message})` : "";
    if (karaokeStatus) karaokeStatus.textContent = `iPhone blocked autoplay${detail}. Tap once to start, or check that the MP3 URL opens directly in Safari and is public.`;
  }
}

btnKaraokeStart?.addEventListener("click", () => {
  // Do not let audience restart karaoke from the beginning.
  // If it is already playing, hide the button and keep the phone in sync.
  if (lastKaraokePhase !== "prepare" && karaokeMusic && !karaokeMusic.paused) {
    syncKaraokeToHostClock();
    btnKaraokeStart.classList.add("hidden");
    return;
  }

  if (lastKaraokePhase === "prepare") unlockKaraokeForLater();
  else startKaraokePlayback();
}, true);

function startReviewFlow(state) {
  stopRedirectStuff();
  stopBeats();
  clearFx();

  const url = (state.reviewUrl || "").trim();
  if (!url) return;

  // Configurable thank-you title + review-request line (used mainly in corporate
  // mode). Both fall back to today's behavior when blank.
  const title = (state.reviewMode?.thankTitle || "").trim();
  const message = (state.reviewMode?.thankMessage || "").trim();
  if (reviewTitleEl) reviewTitleEl.textContent = title || "Thank you!";
  if (reviewMsgEl) {
    reviewMsgEl.textContent = message;
    reviewMsgEl.classList.toggle("hidden", !message);
  }

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
  if (socket.connected) socket.emit("client:keepalive", { room: ROOM });
}, 20000);

socket.on("state:update", async (state) => {
  await handleStateUpdate(state);
});

async function handleStateUpdate(state) {
  if (state?.room && String(state.room).toUpperCase() !== String(ROOM).toUpperCase()) return;

  const phase = state.phase || "idle";
  const seq = Number(state.seq || 0);

  // Always update media URLs/settings from latest state, but never let duplicate
  // reveal_sequence updates restart or cancel an already-running local sequence.
  updateMediaSources(state);
  pendingMusicPhase = phase;

  if (phase === "reveal_sequence" && running) {
    if (seq && seq > lastSeq) lastSeq = seq;
    try { setMusicForPhase(phase); } catch {}
    return;
  }

  // Ignore old/duplicate states after the running check above.
  if (seq && seq <= lastSeq && phase === lastPhase) return;

  // Important: after the reveal page is already showing, host setting saves or
  // fallback polling may send a newer seq while the server phase is still
  // reveal_sequence. Do NOT replay logo/animation in that case. Just keep the
  // reveal view visible and update the reveal URL only if the host changed it.
  if (phase === "reveal_sequence" && lastPhase === "reveal_sequence" && !running) {
    if (seq) lastSeq = seq;
    stopBeats();
    clearFx();
    setRevealContent(state);
    showOnly("reveal");
    try { setMusicForPhase(phase); } catch {}
    return;
  }

  if (seq) lastSeq = seq;

  const phaseChanged = phase !== lastPhase;

  // Only a real phase change cancels the current visual sequence.
  if (phaseChanged) {
    runToken++;
    running = false;
    stopRedirectStuff();
    clearFx();
  }

  lastPhase = phase;

  // Start/stop background music for the current phase. Do not await this,
  // because some mobile browsers leave play() promises pending and that can
  // freeze the visual sequence on the logo screen.
  try { setMusicForPhase(phase); } catch {}

  if (phase === "idle") {
    running = false;
    stopKaraoke();
    showOnly("idle");
    const corporateLogoShown = applyIdleVisual(state);
    if (corporateLogoShown) stopBeats();
    else maybeStartBeatsWithFallback();
    return;
  }

  if (phase === "reveal_sequence") {
    stopKaraoke();
    running = true;
    const sequenceRun = ++runToken;
    runRevealSequence(state, sequenceRun).finally(() => {
      if (isCurrentRun(sequenceRun)) running = false;
    });
    return;
  }

  if (phase === "revealed") {
    stopBeats();
    clearFx();
    stopKaraoke();
    setRevealContent(state);
    showOnly("reveal");
    return;
  }

  if (phase === "karaoke_prepare") {
    await prepareKaraoke(state, false);
    return;
  }

  if (phase === "karaoke") {
    await prepareKaraoke(state, true);
    return;
  }

  if (phase === "review") {
    stopKaraoke();
    const reviewRun = ++runToken;
    showClientSplashIfPresent(state, reviewRun).then(() => {
      if (!isCurrentRun(reviewRun)) return;
      startReviewFlow(state);
    });
    return;
  }

  showOnly("idle");
  if (applyIdleVisual(state)) stopBeats();
  else maybeStartBeatsWithFallback();
}

socket.on("connect", async () => {
  socket.emit("client:role", { role: "audience", room: ROOM });
  showNetBanner(false);
  startPollingFallback();
  await pollStateOnce();
});

socket.on("disconnect", () => {
  running = false;
  showNetBanner(true, "Reconnecting… keep this page open");
  startPollingFallback();
});

// Start backup polling immediately, even before the socket finishes connecting.
startPollingFallback();

socket.on("karaoke:preload", (state) => { preloadKaraokeSilently(state); });
