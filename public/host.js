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

const DEFAULT_REVIEW_URL = "https://g.page/r/CfEvBpaR9455EAI/review";
const DEFAULT_REVEAL_URL = "https://11z.co/12902/cat-houdini01.jpg";
const DEFAULT_REVEAL_MUSIC_URL = "/music.mp3";
const DEFAULT_REVIEW_MUSIC_URL = "/review.mp3";
const DEFAULT_CLIENT_IMAGE_URL = "/client.png";

function randomRevealUrl() {
  // Unique filename using local date/time on the HOST device: MMDDYYHHMM
  // Example: 0219261114 -> Feb 19, 2026 11:14
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const stamp = `${mm}${dd}${yy}${hh}${mi}`;

  // Build from the default URL: replace the trailing number before .jpg
  return DEFAULT_REVEAL_URL.replace(/\d+(?=\.jpg$)/, stamp);
}


// iOS defaults
const DEFAULT_IOS_LAUNCH_URL = "shortcuts://run-shortcut?name=OpenInject";

const els = {
  audienceLink: document.getElementById("audienceLink"),
  statusBadge: document.getElementById("statusBadge"),
  stateLine: document.getElementById("stateLine"),

  countBadge: document.getElementById("countBadge"),
  roomBadge: document.getElementById("roomBadge"),
  revBadge: document.getElementById("revBadge"),
  syncLine: document.getElementById("syncLine"),
  btnSync: document.getElementById("btnSync"),

  revealUrl: document.getElementById("revealUrl"),
  revealTypeRadios: document.querySelectorAll('input[name="revealType"]'),
  logoUrl: document.getElementById("logoUrl"),
  skipAnimation: document.getElementById("skipAnimation"),

  logoMs: document.getElementById("logoMs"),
  animationMs: document.getElementById("animationMs"),

  // iOS launch controls
  iosLaunchEnabled: document.getElementById("iosLaunchEnabled"),
  iosLaunchUrl: document.getElementById("iosLaunchUrl"),
  iosLaunchDelayMs: document.getElementById("iosLaunchDelayMs"),

  clientSplashEnabled: document.getElementById("clientSplashEnabled"),
  clientSplashMs: document.getElementById("clientSplashMs"),
  clientSplashTextSize: document.getElementById("clientSplashTextSize"),
  clientSplashCard1: document.getElementById("clientSplashCard1"),
  clientSplashCard2: document.getElementById("clientSplashCard2"),
  clientSplashCard3: document.getElementById("clientSplashCard3"),
  clientSplashCard4: document.getElementById("clientSplashCard4"),
  clientSplashCard5: document.getElementById("clientSplashCard5"),
  clientSplashMsg: document.getElementById("clientSplashMsg"),

  reviewUrl: document.getElementById("reviewUrl"),
  revealMusicUrl: document.getElementById("revealMusicUrl"),
  reviewMusicUrl: document.getElementById("reviewMusicUrl"),
  clientImageUrl: document.getElementById("clientImageUrl"),
  autoRedirect: document.getElementById("autoRedirect"),
  autoRedirectDelayMs: document.getElementById("autoRedirectDelayMs"),

  corporateMode: document.getElementById("corporateMode"),
  idleLogoUrl: document.getElementById("idleLogoUrl"),
  reviewThankTitle: document.getElementById("reviewThankTitle"),
  reviewThankMessage: document.getElementById("reviewThankMessage"),

  karaokeAudioUrl: document.getElementById("karaokeAudioUrl"),
  karaokeLrcUrl: document.getElementById("karaokeLrcUrl"),
  karaokeBgUrl: document.getElementById("karaokeBgUrl"),
  karaokeTitle: document.getElementById("karaokeTitle"),
  btnStartKaraoke: document.getElementById("btnStartKaraoke"),
  btnStopKaraoke: document.getElementById("btnStopKaraoke"),

  btnSendReveal: document.getElementById("btnSendReveal"),
  btnSendReview: document.getElementById("btnSendReview"),
  btnResetPhase: document.getElementById("btnResetPhase"),
  btnResetAll: document.getElementById("btnResetAll"),

  btnShowQR: document.getElementById("btnShowQR"),
  btnCopyLink: document.getElementById("btnCopyLink"),

  qrOverlay: document.getElementById("qrOverlay"),
  btnCloseQR: document.getElementById("btnCloseQR"),
  qrTarget: document.getElementById("qrTarget"),
  qrLinkText: document.getElementById("qrLinkText"),
};

const LS_KEY = `revealReviewHostSettings:v41:${ROOM}`;

function debounce(fn, waitMs) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), waitMs);
  };
}

function isIOS() {
  const ua = navigator.userAgent || "";
  const isAppleMobile = /iPhone|iPad|iPod/i.test(ua);
  const isIpadOnMac = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return isAppleMobile || isIpadOnMac;
}

function safeOpenDeepLink(url) {
  if (!url) return;
  try { window.location.href = url; } catch {}
}

function getAudienceUrl() {
  const url = new URL(window.location.href);
  url.pathname = "/audience.html";
  url.searchParams.set("room", ROOM);
  return url.toString();
}

els.audienceLink.textContent = getAudienceUrl();
if (els.roomBadge) els.roomBadge.textContent = `Room: ${ROOM}`;
try { document.title = `Host Control - ${ROOM}`; } catch {}
try {
  const h1 = document.querySelector("h1");
  if (h1) h1.textContent = `Host Control — Room ${ROOM}`;
} catch {}

function getSelectedRevealType() {
  return [...els.revealTypeRadios].find((r) => r.checked)?.value || "page";
}
function setSelectedRevealType(value) {
  [...els.revealTypeRadios].forEach((r) => (r.checked = r.value === value));
}

function loadSettings() {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) {
    setSelectedRevealType("page");
    els.autoRedirect.checked = true;
    els.reviewUrl.value = DEFAULT_REVIEW_URL;
    els.revealMusicUrl.value = DEFAULT_REVEAL_MUSIC_URL;
    els.reviewMusicUrl.value = DEFAULT_REVIEW_MUSIC_URL;
    els.clientImageUrl.value = DEFAULT_CLIENT_IMAGE_URL;
    els.revealUrl.value = randomRevealUrl();
    els.skipAnimation.checked = false;

    if (els.corporateMode) els.corporateMode.checked = false;
    if (els.idleLogoUrl) els.idleLogoUrl.value = "";
    if (els.reviewThankTitle) els.reviewThankTitle.value = "";
    if (els.reviewThankMessage) els.reviewThankMessage.value = "";

    els.clientSplashEnabled.checked = true;
    els.clientSplashMs.value = 3000;
    if (els.clientSplashTextSize) els.clientSplashTextSize.value = 6.2;
    els.clientSplashCard1.value = "Hope you enjoyed my show";
    els.clientSplashCard2.value = "Let\'s all wish Kylie a very happy B'Day";
    els.clientSplashCard3.value = "";
    els.clientSplashCard4.value = "";
    els.clientSplashCard5.value = "";
    els.clientSplashMsg.value = "Thank you — one last quick thing ❤️";

    els.iosLaunchEnabled.checked = true;
    els.iosLaunchDelayMs.value = 250;
    els.iosLaunchUrl.value = DEFAULT_IOS_LAUNCH_URL;
    if (els.karaokeAudioUrl) els.karaokeAudioUrl.value = "";
    if (els.karaokeLrcUrl) els.karaokeLrcUrl.value = "";
    if (els.karaokeBgUrl) els.karaokeBgUrl.value = "";
    if (els.karaokeTitle) els.karaokeTitle.value = "";
    return;
  }

  try {
    const s = JSON.parse(raw);

    els.revealUrl.value = s.revealUrl ?? randomRevealUrl();
    els.logoUrl.value = s.logoUrl ?? "";
    els.skipAnimation.checked = !!s.skipAnimation;

    els.logoMs.value = s.logoMs ?? 4000;
    els.animationMs.value = s.animationMs ?? 12000;

    els.reviewUrl.value = s.reviewUrl ?? DEFAULT_REVIEW_URL;
    els.revealMusicUrl.value = s.revealMusicUrl ?? DEFAULT_REVEAL_MUSIC_URL;
    els.reviewMusicUrl.value = s.reviewMusicUrl ?? DEFAULT_REVIEW_MUSIC_URL;
    els.clientImageUrl.value = s.clientImageUrl ?? DEFAULT_CLIENT_IMAGE_URL;
    els.autoRedirect.checked = s.autoRedirect ?? true;
    els.autoRedirectDelayMs.value = s.autoRedirectDelayMs ?? 3000;

    if (els.corporateMode) els.corporateMode.checked = !!s.corporateMode;
    if (els.idleLogoUrl) els.idleLogoUrl.value = s.idleLogoUrl ?? "";
    if (els.reviewThankTitle) els.reviewThankTitle.value = s.reviewThankTitle ?? "";
    if (els.reviewThankMessage) els.reviewThankMessage.value = s.reviewThankMessage ?? "";

    els.clientSplashEnabled.checked = s.clientSplashEnabled ?? true;
    els.clientSplashMs.value = s.clientSplashMs ?? 3000;
    if (els.clientSplashTextSize) els.clientSplashTextSize.value = s.clientSplashTextSize ?? 6.2;
    els.clientSplashCard1.value = s.clientSplashCard1 ?? "Hope you enjoyed my show";
    els.clientSplashCard2.value = s.clientSplashCard2 ?? "Let\'s all wish Kylie a very happy B'Day";
    els.clientSplashCard3.value = s.clientSplashCard3 ?? "";
    els.clientSplashCard4.value = s.clientSplashCard4 ?? "";
    els.clientSplashCard5.value = s.clientSplashCard5 ?? "";
    els.clientSplashMsg.value = s.clientSplashMsg ?? "Thank you — one last quick thing ❤️";

    els.iosLaunchEnabled.checked = s.iosLaunchEnabled ?? false;
    els.iosLaunchDelayMs.value = s.iosLaunchDelayMs ?? 250;
    els.iosLaunchUrl.value = s.iosLaunchUrl ?? DEFAULT_IOS_LAUNCH_URL;

    if (els.karaokeAudioUrl) els.karaokeAudioUrl.value = s.karaokeAudioUrl ?? "";
    if (els.karaokeLrcUrl) els.karaokeLrcUrl.value = s.karaokeLrcUrl ?? "";
    if (els.karaokeBgUrl) els.karaokeBgUrl.value = s.karaokeBgUrl ?? "";
    if (els.karaokeTitle) els.karaokeTitle.value = s.karaokeTitle ?? "";

    setSelectedRevealType(s.revealType ?? "page");
  } catch {
    setSelectedRevealType("page");
    els.autoRedirect.checked = true;
    els.reviewUrl.value = DEFAULT_REVIEW_URL;
    els.revealMusicUrl.value = DEFAULT_REVEAL_MUSIC_URL;
    els.reviewMusicUrl.value = DEFAULT_REVIEW_MUSIC_URL;
    els.clientImageUrl.value = DEFAULT_CLIENT_IMAGE_URL;
    els.revealUrl.value = randomRevealUrl();

    els.iosLaunchEnabled.checked = true;
    els.iosLaunchDelayMs.value = 250;
    els.iosLaunchUrl.value = DEFAULT_IOS_LAUNCH_URL;
    if (els.karaokeAudioUrl) els.karaokeAudioUrl.value = "";
    if (els.karaokeLrcUrl) els.karaokeLrcUrl.value = "";
    if (els.karaokeBgUrl) els.karaokeBgUrl.value = "";
    if (els.karaokeTitle) els.karaokeTitle.value = "";
  }
}

function saveSettings() {
  const s = {
    revealType: getSelectedRevealType(),
    revealUrl: els.revealUrl.value.trim() || randomRevealUrl(),
    logoUrl: els.logoUrl.value.trim(),
    skipAnimation: !!els.skipAnimation.checked,

    logoMs: Number(els.logoMs.value || 0),
    animationMs: Number(els.animationMs.value || 0),

    reviewUrl: els.reviewUrl.value.trim() || DEFAULT_REVIEW_URL,
    revealMusicUrl: els.revealMusicUrl.value.trim() || DEFAULT_REVEAL_MUSIC_URL,
    reviewMusicUrl: els.reviewMusicUrl.value.trim() || DEFAULT_REVIEW_MUSIC_URL,
    clientImageUrl: els.clientImageUrl.value.trim() || DEFAULT_CLIENT_IMAGE_URL,
    autoRedirect: !!els.autoRedirect.checked,
    autoRedirectDelayMs: Number(els.autoRedirectDelayMs.value || 0),

    corporateMode: !!els.corporateMode?.checked,
    idleLogoUrl: (els.idleLogoUrl?.value || "").trim(),
    reviewThankTitle: (els.reviewThankTitle?.value || "").trim(),
    reviewThankMessage: (els.reviewThankMessage?.value || "").trim(),

    clientSplashEnabled: !!els.clientSplashEnabled.checked,
    clientSplashMs: Number(els.clientSplashMs.value || 0),
    clientSplashTextSize: Number(els.clientSplashTextSize?.value || 6.2),
    clientSplashCard1: (els.clientSplashCard1?.value || "").trim(),
    clientSplashCard2: (els.clientSplashCard2?.value || "").trim(),
    clientSplashCard3: (els.clientSplashCard3?.value || "").trim(),
    clientSplashCard4: (els.clientSplashCard4?.value || "").trim(),
    clientSplashCard5: (els.clientSplashCard5?.value || "").trim(),
    clientSplashMsg: (els.clientSplashMsg.value || "").trim(),

    iosLaunchEnabled: !!els.iosLaunchEnabled.checked,
    iosLaunchDelayMs: Number(els.iosLaunchDelayMs.value || 0),
    iosLaunchUrl: (els.iosLaunchUrl.value || "").trim(),

    karaokeAudioUrl: (els.karaokeAudioUrl?.value || "").trim(),
    karaokeLrcUrl: (els.karaokeLrcUrl?.value || "").trim(),
    karaokeBgUrl: (els.karaokeBgUrl?.value || "").trim(),
    karaokeTitle: (els.karaokeTitle?.value || "").trim(),
  };

  localStorage.setItem(LS_KEY, JSON.stringify(s));
  return s;
}

function payloadFromUI() {
  const s = saveSettings();
  return {
    room: ROOM,
    revealType: s.revealType,
    revealUrl: s.revealUrl,
    logoUrl: s.logoUrl,
    skipAnimation: s.skipAnimation,
    timings: { logoMs: s.logoMs, animationMs: s.animationMs },

    corporateMode: s.corporateMode,
    idleLogoUrl: s.idleLogoUrl,

    reviewUrl: s.reviewUrl,
    revealMusicUrl: s.revealMusicUrl,
    reviewMusicUrl: s.reviewMusicUrl,
    clientImageUrl: s.clientImageUrl,
    reviewMode: {
      autoRedirect: s.autoRedirect,
      autoRedirectDelayMs: s.autoRedirectDelayMs,
      thankTitle: s.reviewThankTitle,
      thankMessage: s.reviewThankMessage,
    },

    clientSplash: {
      enabled: s.clientSplashEnabled,
      durationMs: s.clientSplashMs,
      textSize: s.clientSplashTextSize,
      card1: s.clientSplashCard1,
      card2: s.clientSplashCard2,
      card3: s.clientSplashCard3,
      card4: s.clientSplashCard4,
      card5: s.clientSplashCard5,
      photoMessage: s.clientSplashMsg,
    },

    karaoke: {
      audioUrl: s.karaokeAudioUrl,
      lrcUrl: s.karaokeLrcUrl,
      bgUrl: s.karaokeBgUrl,
      title: s.karaokeTitle,
    },
  };
}

setInterval(() => {
  if (socket.connected) socket.emit("client:keepalive", { room: ROOM });
}, 20000);

const debouncedSave = debounce(() => {
  // payloadFromUI() writes localStorage via saveSettings(). Always do that so
  // every field (incl. Corporate Mode + URL) persists locally regardless of
  // connection state; only the server push depends on the socket being up.
  const payload = payloadFromUI();
  if (socket.connected) emitHostAction("host:saveSettings", "saveSettings", payload);
}, 180);

["input", "change"].forEach((evt) => {
  document.addEventListener(evt, (e) => {
    if (e.target && e.target.matches("input, textarea")) debouncedSave();
  });
});


function postHostActionFallback(action, payload = {}) {
  // Do not replace websocket behavior. This is only a backup in case the socket is paused.
  try {
    fetch(`/api/host/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, room: ROOM }),
      cache: "no-store",
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

function emitHostAction(eventName, actionName, payload = {}) {
  const body = { ...payload, room: ROOM, clientTs: Date.now() };

  // Send both ways. Socket is instant when connected; HTTP makes sure the room state
  // is also updated even if the mobile browser or Wi‑Fi briefly drops the socket.
  try {
    if (socket.connected) socket.emit(eventName, body);
  } catch {}
  postHostActionFallback(actionName, body);
}

// Re-join room after any reconnect.
socket.on("reconnect", () => {
  try { socket.emit("client:role", { role: "host", room: ROOM }); } catch {}
});

els.btnSendReveal.addEventListener("click", () => {
  const p = payloadFromUI();
  const s = saveSettings();
  if (!p.revealUrl) return alert("Please enter a Reveal URL first.");

  preloadKaraokeIfConfigured(p);
  emitHostAction("host:sendReveal", "sendReveal", p);

  if (s.iosLaunchEnabled && isIOS() && s.iosLaunchUrl) {
    const delay = Math.max(0, Number(s.iosLaunchDelayMs || 0));
    setTimeout(() => safeOpenDeepLink(s.iosLaunchUrl), delay);
  }
});

els.btnSendReview.addEventListener("click", () => {
  const p = payloadFromUI();
  if (!p.reviewUrl) return alert("Please enter a Review URL first.");
  emitHostAction("host:sendToReview", "sendToReview", p);
});


els.btnPrepareKaraoke?.addEventListener("click", () => {
  const p = payloadFromUI();
  if (!p.karaoke?.audioUrl) return alert("Please enter a Karaoke MP3 URL first.");
  if (!p.karaoke?.lrcUrl) return alert("Please enter a Karaoke .LRC Lyrics URL first.");
  emitHostAction("host:preloadKaraokeSilent", "preloadKaraokeSilent", p);
});



function getBestKaraokeEndPhotoUrlFromUI() {
  const candidates = [
    "clientImageUrl",
    "clientImage",
    "clientPhotoUrl",
    "revealImageUrl",
    "revealUrl",
    "imageUrl",
    "finalImageUrl",
    "finalImage",
    "photoUrl",
    "karaokeBgUrl",
    "karaokeImageUrl"
  ];

  for (const id of candidates) {
    const el = document.getElementById(id);
    if (el && el.value && el.value.trim()) return el.value.trim();
  }

  // Fallback: scan all inputs/textareas whose id/name/placeholder suggests image/photo/reveal.
  const all = Array.from(document.querySelectorAll("input, textarea"));
  for (const el of all) {
    const hay = `${el.id || ""} ${el.name || ""} ${el.placeholder || ""} ${el.labels ? Array.from(el.labels).map(l => l.textContent).join(" ") : ""}`.toLowerCase();
    const val = (el.value || "").trim();
    if (val && /^https?:\/\//i.test(val) && /(client|photo|image|reveal|picture)/i.test(hay)) {
      return val;
    }
  }

  return "";
}


function preloadKaraokeIfConfigured(p) {
  if (p?.karaoke?.audioUrl && p?.karaoke?.lrcUrl) {
    p.karaokeEndPhotoUrl = getBestKaraokeEndPhotoUrlFromUI();
    if (!p.karaoke) p.karaoke = {};
    if (!p.karaoke.endPhotoUrl) p.karaoke.endPhotoUrl = p.karaokeEndPhotoUrl;
    emitHostAction("host:preloadKaraokeSilent", "preloadKaraokeSilent", p);
  }
}

els.btnStartKaraoke?.addEventListener("click", () => {
  const p = payloadFromUI();
  if (!p.karaoke?.audioUrl) return alert("Please enter a Karaoke MP3 URL first.");
  if (!p.karaoke?.lrcUrl) return alert("Please enter a Karaoke .LRC Lyrics URL first.");
  p.karaokeEndPhotoUrl = getBestKaraokeEndPhotoUrlFromUI();
  if (!p.karaoke) p.karaoke = {};
  if (!p.karaoke.endPhotoUrl) p.karaoke.endPhotoUrl = p.karaokeEndPhotoUrl;
  emitHostAction("host:startKaraoke", "startKaraoke", p);
});

els.btnStopKaraoke?.addEventListener("click", () => {
  emitHostAction("host:resetPhase", "resetPhase", { room: ROOM });
});

els.btnResetPhase.addEventListener("click", () => emitHostAction("host:resetPhase", "resetPhase", { room: ROOM }));

els.btnResetAll.addEventListener("click", () => {
  localStorage.removeItem(LS_KEY);
  emitHostAction("host:resetAll", "resetAll", { room: ROOM });
  loadSettings();
  emitHostAction("host:saveSettings", "saveSettings", payloadFromUI());
});

els.btnSync.addEventListener("click", () => {
  els.syncLine.textContent = "Sync check: checking…";
  socket.emit("host:syncCheck", { room: ROOM }, (resp) => {
    if (!resp?.ok) {
      els.syncLine.textContent = "Sync check: failed.";
      return;
    }
    const { revision, uptimeSec, counts, state } = resp;
    els.revBadge.textContent = `Revision: ${revision}`;
    els.countBadge.textContent = `Audience: ${counts.audience} • Hosts: ${counts.hosts} • Total: ${counts.total}`;
    els.syncLine.textContent = `Sync OK • phase=${state.phase} • uptime=${uptimeSec}s • ${new Date(resp.nowTs).toLocaleTimeString()}`;
  });
});

function showQR() {
  const link = getAudienceUrl();

  // Show overlay/modal
  if (els.qrOverlay) els.qrOverlay.classList.add("show");
  const linkEl = els.qrLinkText || document.getElementById("qrLinkText");
  if (linkEl) linkEl.textContent = link;

  const target = els.qrTarget || document.getElementById("qrTarget") || document.getElementById("qrCanvasWrap") || document.getElementById("qrBox") || document.querySelector(".qrTarget") || document.querySelector(".qrBox");
  if (!target) return;

  target.innerHTML = "";
  target.classList.add("qrBranded");

  // Compute size based on available space (prevents clipping on iPhone)
  const card = target.closest(".overlayCard") || target.closest(".qrModal") || target.parentElement;
  const rect = (card && card.getBoundingClientRect) ? card.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight };
  const vw = Math.min(window.innerWidth, document.documentElement.clientWidth || window.innerWidth);
  const vh = Math.min(window.innerHeight, document.documentElement.clientHeight || window.innerHeight);
  const maxW = Math.min(rect.width || vw, vw) - 48;
  const maxH = Math.min(rect.height || vh, vh) - 140; // room for buttons + link
  const size = Math.max(220, Math.floor(Math.min(maxW, maxH)));

  // Build QR with high error correction (logo-friendly)
  new QRCode(target, {
    text: link,
    width: size,
    height: size,
    correctLevel: QRCode.CorrectLevel.H,
  });

  // Center logo overlay (prefer logo.png)
  const logoCandidates = ["/logo.png", "/logo.svg"];
  const logo = document.createElement("img");
  logo.className = "qrLogo";
  logo.alt = "logo";
  logo.decoding = "async";
  logo.loading = "eager";

  let idx = 0;
  const tryNext = () => {
    if (idx >= logoCandidates.length) return;
    const u = logoCandidates[idx++];
    logo.src = u + (u.includes("?") ? "&" : "?") + "cb=" + Date.now();
  };
  logo.onerror = tryNext;
  tryNext();

  requestAnimationFrame(() => {
    const prev = target.querySelector(".qrLogo");
    if (prev) prev.remove();
    target.appendChild(logo);
  });
}
function closeQR() { els.qrOverlay.classList.remove("show"); }

els.btnShowQR.addEventListener("click", showQR);
els.btnCloseQR.addEventListener("click", closeQR);

els.btnCopyLink.addEventListener("click", async () => {
  const link = getAudienceUrl();
  try {
    await navigator.clipboard.writeText(link);
    els.btnCopyLink.textContent = "Copied!";
    setTimeout(() => (els.btnCopyLink.textContent = "Copy Link"), 900);
  } catch {
    prompt("Copy this audience link:", link);
  }
});

socket.on("connect", () => {
  socket.emit("client:role", { role: "host", room: ROOM });
  els.statusBadge.textContent = "Status: connected";
  socket.emit("host:syncCheck", { room: ROOM }, (resp) => {
    if (resp?.ok) {
      els.revBadge.textContent = `Revision: ${resp.revision}`;
      els.countBadge.textContent = `Audience: ${resp.counts.audience} • Hosts: ${resp.counts.hosts} • Total: ${resp.counts.total}`;
      els.syncLine.textContent = `Connected • phase=${resp.state.phase} • uptime=${resp.uptimeSec}s`;
      updateDockPhase(resp.state.phase);
    }
  });
});

socket.on("disconnect", () => { els.statusBadge.textContent = "Status: disconnected"; });

socket.on("state:update", (st) => {
  els.stateLine.textContent = `State: ${st.phase} • last update ${new Date(st.lastUpdateTs).toLocaleTimeString()}`;
  updateDockPhase(st.phase);
});

// ── Live-show control dock ──────────────────────────────────────────────────
// Fixed bottom bar so the show triggers are always reachable without scrolling.
// Each dock button proxies to the real section button (.click()), so behavior —
// validations, payload, the iOS deep link on Show Magic — is identical.
const dock = {
  phase: document.getElementById("dockPhase"),
  magic: document.getElementById("dockMagic"),
  karaoke: document.getElementById("dockKaraoke"),
  review: document.getElementById("dockReview"),
  reset: document.getElementById("dockReset"),
};
const DOCK_PHASE_LABELS = {
  idle: "IDLE",
  reveal_sequence: "REVEALING",
  revealed: "REVEALED",
  karaoke_prepare: "KARAOKE…",
  karaoke: "KARAOKE",
  review: "REVIEW",
};
function updateDockPhase(phase) {
  if (dock.phase) dock.phase.textContent = DOCK_PHASE_LABELS[phase] || String(phase || "—").toUpperCase();
}
dock.magic?.addEventListener("click", () => els.btnSendReveal?.click());
dock.karaoke?.addEventListener("click", () => els.btnStartKaraoke?.click());
dock.review?.addEventListener("click", () => els.btnSendReview?.click());
dock.reset?.addEventListener("click", () => els.btnResetPhase?.click());

socket.on("counts:update", (c) => {
  els.countBadge.textContent = `Audience: ${c.audience} • Hosts: ${c.hosts} • Total: ${c.total}`;
  if (c.revision) els.revBadge.textContent = `Revision: ${c.revision}`;
});


loadSettings();
emitHostAction("host:saveSettings", "saveSettings", payloadFromUI());

/* ================== REMOTE HOTKEYS (consolidated) ==================
   Single keydown listener, one action per key, matching the show dock:
     ArrowUp    -> Show Magic
     ArrowRight -> Start Karaoke
     ArrowDown  -> Show Messages / Review
     ArrowLeft  -> Reset Phase
   Reset All is intentionally NOT on the remote (on-screen button only), so a
   stray Left press can never wipe the show. Ignored while typing in a field.
=================================================================== */
function isTypingInField() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = (el.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || el.isContentEditable;
}

document.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  if (isTypingInField()) return;
  const k = e.key;
  if (!["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"].includes(k)) return;
  e.preventDefault();

  if (k === "ArrowUp") els.btnSendReveal?.click();           // Show Magic
  else if (k === "ArrowRight") els.btnStartKaraoke?.click(); // Start Karaoke
  else if (k === "ArrowDown") els.btnSendReview?.click();    // Show Messages / Review
  else if (k === "ArrowLeft") els.btnResetPhase?.click();    // Reset Phase
});

