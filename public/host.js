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
const DEFAULT_REVIEW_THANK_MESSAGE = "If you enjoyed my show, I would love a 5 star review!";

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
  dockAltActionRadios: document.querySelectorAll('input[name="dockAltAction"]'),
  logoUrl: document.getElementById("logoUrl"),
  interactiveLogoUrl: document.getElementById("interactiveLogoUrl"),
  interactiveVoice: document.getElementById("interactiveVoice"),
  interactiveMusicUrl: document.getElementById("interactiveMusicUrl"),
  btnVoiceTest: document.getElementById("btnVoiceTest"),
  btnInteractiveHold: document.getElementById("btnInteractiveHold"),
  voiceStatus: document.getElementById("voiceStatus"),
  voiceSetStatus: document.getElementById("voiceSetStatus"),
  interactiveLogoPreview: document.getElementById("interactiveLogoPreview"),
  skipAnimation: document.getElementById("skipAnimation"),

  logoMs: document.getElementById("logoMs"),
  animationMs: document.getElementById("animationMs"),

  // iOS launch controls
  iosLaunchEnabled: document.getElementById("iosLaunchEnabled"),
  iosLaunchUrl: document.getElementById("iosLaunchUrl"),
  iosLaunchDelayMs: document.getElementById("iosLaunchDelayMs"),

  clientSplashEnabled: document.getElementById("clientSplashEnabled"),
  clientSplashManualAdvance: document.getElementById("clientSplashManualAdvance"),
  clientSplashDurationField: document.getElementById("clientSplashDurationField"),
  clientSplashMs: document.getElementById("clientSplashMs"),
  clientSplashTextSize: document.getElementById("clientSplashTextSize"),
  clientSplashCardsList: document.getElementById("clientSplashCardsList"),
  btnAddCard: document.getElementById("btnAddCard"),
  btnSplashPrev: document.getElementById("btnSplashPrev"),
  btnSplashNext: document.getElementById("btnSplashNext"),

  photoStepEnabled: document.getElementById("photoStepEnabled"),
  photoStepMessage: document.getElementById("photoStepMessage"),
  photoStepDurationMs: document.getElementById("photoStepDurationMs"),

  schoolShowEnabled: document.getElementById("schoolShowEnabled"),
  schoolShowManualAdvance: document.getElementById("schoolShowManualAdvance"),
  schoolShowModeProjector: document.getElementById("schoolShowModeProjector"),
  schoolShowModePhone: document.getElementById("schoolShowModePhone"),
  schoolShowMusicUrl: document.getElementById("schoolShowMusicUrl"),
  schoolShowSlidesText: document.getElementById("schoolShowSlidesText"),
  btnSendSchoolShow: document.getElementById("btnSendSchoolShow"),
  btnSchoolShowPrev: document.getElementById("btnSchoolShowPrev"),
  btnSchoolShowNext: document.getElementById("btnSchoolShowNext"),
  btnUpdateCinematicPage: document.getElementById("btnUpdateCinematicPage"),

  btnStartInteractive: document.getElementById("btnStartInteractive"),
  btnInteractivePrev: document.getElementById("btnInteractivePrev"),
  btnInteractiveNext: document.getElementById("btnInteractiveNext"),
  btnInteractiveReveal: document.getElementById("btnInteractiveReveal"),
  interactiveStatus: document.getElementById("interactiveStatus"),
  interactiveScript: document.getElementById("interactiveScript"),

  reviewUrl: document.getElementById("reviewUrl"),
  btnGoToReview: document.getElementById("btnGoToReview"),
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
  btnKaraokePrepareStep: document.getElementById("btnKaraokePrepareStep"),
  btnStartKaraoke: document.getElementById("btnStartKaraoke"),
  btnStopKaraoke: document.getElementById("btnStopKaraoke"),

  btnSendReveal: document.getElementById("btnSendReveal"),
  btnSendReview: document.getElementById("btnSendReview"),
  btnResetPhase: document.getElementById("btnResetPhase"),
  btnResetAll: document.getElementById("btnResetAll"),
  btnSaveAsDefault: document.getElementById("btnSaveAsDefault"),
  btnPerformMode: document.getElementById("btnPerformMode"),

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

function getSelectedDockAltAction() {
  return [...els.dockAltActionRadios].find((r) => r.checked)?.value || "messages";
}
function setSelectedDockAltAction(value) {
  [...els.dockAltActionRadios].forEach((r) => (r.checked = r.value === (value || "messages")));
}

// Populate the settings form from a flat settings object (the shape saveSettings()
// writes to localStorage). Shared by loadSettings() (local cache) below.
function applySettingsToForm(s) {
  els.revealUrl.value = s.revealUrl ?? randomRevealUrl();
  els.logoUrl.value = s.logoUrl ?? "";
  if (els.interactiveLogoUrl) els.interactiveLogoUrl.value = s.interactiveLogoUrl ?? "";
  if (els.interactiveMusicUrl) els.interactiveMusicUrl.value = s.interactiveMusicUrl ?? "";
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
  if (els.reviewThankMessage) els.reviewThankMessage.value = s.reviewThankMessage ?? DEFAULT_REVIEW_THANK_MESSAGE;

  els.clientSplashEnabled.checked = s.clientSplashEnabled ?? true;
  if (els.clientSplashManualAdvance) els.clientSplashManualAdvance.checked = !!s.clientSplashManualAdvance;
  if (els.clientSplashDurationField) els.clientSplashDurationField.style.display = s.clientSplashManualAdvance ? "none" : "";
  els.clientSplashMs.value = s.clientSplashMs ?? 3000;
  if (els.clientSplashTextSize) els.clientSplashTextSize.value = s.clientSplashTextSize ?? 6.2;
  renderCardsList(s.clientSplashCards ?? ["Hope you enjoyed my show", "Let\'s all wish Kylie a very happy B'Day"]);
  updateSplashControlsVisibility();

  if (els.photoStepEnabled) els.photoStepEnabled.checked = s.photoStepEnabled ?? true;
  if (els.photoStepMessage) els.photoStepMessage.value = s.photoStepMessage ?? "Thank you — one last quick thing ❤️";
  if (els.photoStepDurationMs) els.photoStepDurationMs.value = s.photoStepDurationMs ?? 3000;

  if (els.schoolShowEnabled) els.schoolShowEnabled.checked = s.schoolShowEnabled ?? true;
  if (els.schoolShowManualAdvance) els.schoolShowManualAdvance.checked = !!s.schoolShowManualAdvance;
  if (els.schoolShowModeProjector && els.schoolShowModePhone) {
    const isPhone = s.schoolShowMode === "phone";
    els.schoolShowModePhone.checked = isPhone;
    els.schoolShowModeProjector.checked = !isPhone;
  }
  if (els.schoolShowMusicUrl) els.schoolShowMusicUrl.value = s.schoolShowMusicUrl ?? "";
  if (els.schoolShowSlidesText) els.schoolShowSlidesText.value = s.schoolShowSlidesText ?? "";

  els.iosLaunchEnabled.checked = s.iosLaunchEnabled ?? false;
  els.iosLaunchDelayMs.value = s.iosLaunchDelayMs ?? 250;
  els.iosLaunchUrl.value = s.iosLaunchUrl ?? DEFAULT_IOS_LAUNCH_URL;

  if (els.karaokeAudioUrl) els.karaokeAudioUrl.value = s.karaokeAudioUrl ?? "";
  if (els.karaokeLrcUrl) els.karaokeLrcUrl.value = s.karaokeLrcUrl ?? "";
  if (els.karaokeBgUrl) els.karaokeBgUrl.value = s.karaokeBgUrl ?? "";
  if (els.karaokeTitle) els.karaokeTitle.value = s.karaokeTitle ?? "";

  setSelectedRevealType(s.revealType ?? "page");
  setSelectedDockAltAction(s.dockAltAction ?? "messages");
  updateDockKaraokeSlot();
}

// Populate the settings form from the server's authoritative room state (the
// nested shape broadcast as "state:update" -- see mergeState()/defaultState()
// in server.js). This is what makes settings configured on one device (e.g.
// iPhone) show up when the same show URL is opened on another (e.g. laptop):
// the server, not localStorage, is the shared source of truth across devices.
// Deliberately does NOT touch iosLaunch* -- that's a per-device Shortcuts/deep
// link preference, never sent to or stored on the server.
function applyServerStateToForm(st) {
  if (!st || typeof st !== "object") return;
  applySettingsToForm({
    revealType: st.revealType,
    dockAltAction: st.dockAltAction,
    revealUrl: st.revealUrl,
    logoUrl: st.logoUrl,
    interactiveLogoUrl: st.interactiveLogoUrl,
    interactiveMusicUrl: st.interactiveMusicUrl,
    skipAnimation: st.skipAnimation,
    logoMs: st.timings?.logoMs,
    animationMs: st.timings?.animationMs,
    reviewUrl: st.reviewUrl,
    revealMusicUrl: st.revealMusicUrl,
    reviewMusicUrl: st.reviewMusicUrl,
    clientImageUrl: st.clientImageUrl,
    autoRedirect: st.reviewMode?.autoRedirect,
    autoRedirectDelayMs: st.reviewMode?.autoRedirectDelayMs,
    corporateMode: st.corporateMode,
    idleLogoUrl: st.idleLogoUrl,
    reviewThankTitle: st.reviewMode?.thankTitle,
    reviewThankMessage: st.reviewMode?.thankMessage,
    clientSplashEnabled: st.clientSplash?.enabled,
    clientSplashManualAdvance: st.clientSplash?.manualAdvance,
    clientSplashMs: st.clientSplash?.durationMs,
    clientSplashTextSize: st.clientSplash?.textSize,
    clientSplashCards: st.clientSplash?.cards,
    photoStepEnabled: st.photoStep?.enabled,
    photoStepMessage: st.photoStep?.message,
    photoStepDurationMs: st.photoStep?.durationMs,
    schoolShowEnabled: st.schoolShow?.enabled,
    schoolShowManualAdvance: st.schoolShow?.manualAdvance,
    schoolShowMode: st.schoolShow?.mode,
    schoolShowMusicUrl: st.schoolShow?.musicUrl,
    schoolShowSlidesText: st.schoolShow?.slidesText,
    karaokeAudioUrl: st.karaoke?.audioUrl,
    karaokeLrcUrl: st.karaoke?.lrcUrl,
    karaokeBgUrl: st.karaoke?.bgUrl,
    karaokeTitle: st.karaoke?.title,
    // Preserve whatever iOS-launch values are already in the form (device-local).
    iosLaunchEnabled: els.iosLaunchEnabled.checked,
    iosLaunchDelayMs: els.iosLaunchDelayMs.value,
    iosLaunchUrl: els.iosLaunchUrl.value,
  });
  saveSettings(); // keep the local cache in step with what the server just gave us
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
    if (els.reviewThankMessage) els.reviewThankMessage.value = DEFAULT_REVIEW_THANK_MESSAGE;

    els.clientSplashEnabled.checked = true;
    if (els.clientSplashManualAdvance) els.clientSplashManualAdvance.checked = false;
    els.clientSplashMs.value = 3000;
    if (els.clientSplashTextSize) els.clientSplashTextSize.value = 6.2;
    renderCardsList(["Hope you enjoyed my show", "Let\'s all wish Kylie a very happy B'Day"]);

    if (els.photoStepEnabled) els.photoStepEnabled.checked = true;
    if (els.photoStepMessage) els.photoStepMessage.value = "Thank you — one last quick thing ❤️";
    if (els.photoStepDurationMs) els.photoStepDurationMs.value = 3000;

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
    applySettingsToForm(s);
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
    renderCardsList(["Hope you enjoyed my show", "Let\'s all wish Kylie a very happy B'Day"]);
    if (els.karaokeAudioUrl) els.karaokeAudioUrl.value = "";
    if (els.karaokeLrcUrl) els.karaokeLrcUrl.value = "";
    if (els.karaokeBgUrl) els.karaokeBgUrl.value = "";
    if (els.karaokeTitle) els.karaokeTitle.value = "";
  }
}

// Parses the School Show markdown textarea into [{heading, body}] slides.
// Lines starting with "#" are heading lines (multiple "#" lines join into a
// multi-line heading); a standalone "---" line separates slides; everything
// else is body text (blank lines preserved as paragraph breaks). **word**
// is left as-is -- audience.js renders that as bold, not this parser.
function parseSchoolShowSlides(text) {
  const blocks = String(text || "").split(/^\s*---\s*$/m);
  return blocks
    .map((block) => {
      const headingLines = [];
      const bodyLines = [];
      for (const line of block.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("#")) headingLines.push(trimmed.replace(/^#+\s*/, ""));
        else bodyLines.push(line);
      }
      return { heading: headingLines.join("\n").trim(), body: bodyLines.join("\n").trim() };
    })
    .filter((s) => s.heading || s.body);
}

function saveSettings() {
  const s = {
    revealType: getSelectedRevealType(),
    dockAltAction: getSelectedDockAltAction(),
    revealUrl: els.revealUrl.value.trim() || randomRevealUrl(),
    logoUrl: els.logoUrl.value.trim(),
    interactiveLogoUrl: (els.interactiveLogoUrl?.value || "").trim(),
    interactiveMusicUrl: (els.interactiveMusicUrl?.value || "").trim(),
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
    clientSplashManualAdvance: !!els.clientSplashManualAdvance?.checked,
    clientSplashMs: Number(els.clientSplashMs.value || 0),
    clientSplashTextSize: Number(els.clientSplashTextSize?.value || 6.2),
    clientSplashCards: getCardsFromUI(),

    photoStepEnabled: !!els.photoStepEnabled?.checked,
    photoStepMessage: (els.photoStepMessage?.value || "").trim(),
    photoStepDurationMs: Number(els.photoStepDurationMs?.value || 0),

    schoolShowEnabled: !!els.schoolShowEnabled?.checked,
    schoolShowManualAdvance: !!els.schoolShowManualAdvance?.checked,
    schoolShowMode: els.schoolShowModePhone?.checked ? "phone" : "projector",
    schoolShowMusicUrl: (els.schoolShowMusicUrl?.value || "").trim(),
    schoolShowSlidesText: (els.schoolShowSlidesText?.value || "").trim(),

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
    dockAltAction: s.dockAltAction,
    revealUrl: s.revealUrl,
    logoUrl: s.logoUrl,
    interactiveLogoUrl: s.interactiveLogoUrl,
    interactiveMusicUrl: s.interactiveMusicUrl,
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
      manualAdvance: s.clientSplashManualAdvance,
      durationMs: s.clientSplashMs,
      textSize: s.clientSplashTextSize,
      cards: s.clientSplashCards,
      // currentCardIndex deliberately omitted -- only host:splashNext/Prev/
      // sendToReview change it; a routine settings save must never reset it.
    },

    photoStep: {
      enabled: s.photoStepEnabled,
      message: s.photoStepMessage,
      durationMs: s.photoStepDurationMs,
    },

    karaoke: {
      audioUrl: s.karaokeAudioUrl,
      lrcUrl: s.karaokeLrcUrl,
      bgUrl: s.karaokeBgUrl,
      title: s.karaokeTitle,
    },

    schoolShow: {
      enabled: s.schoolShowEnabled,
      manualAdvance: s.schoolShowManualAdvance,
      mode: s.schoolShowMode,
      musicUrl: s.schoolShowMusicUrl,
      slidesText: s.schoolShowSlidesText,
      slides: parseSchoolShowSlides(s.schoolShowSlidesText),
      // currentCardIndex deliberately omitted -- only host:schoolShowNext/
      // Prev/sendToSchoolShow change it; a routine settings save must never
      // reset it (same rationale as clientSplash's currentCardIndex above).
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

  // HTTP is a fallback for when the socket is actually down (mobile browser
  // paused it, Wi-Fi dropped), NOT a second parallel send. Firing both
  // unconditionally raced two DIFFERENT actions' deliveries against each
  // other whenever they were clicked in quick succession (e.g. Show Messages
  // then Reset Phase): the socket messages usually landed in click order, but
  // the older action's HTTP fallback could straggle in afterward (slower,
  // cold network request) and silently reapply it -- Reset Phase "not
  // sticking", the room reverting to review. Only using HTTP when the socket
  // isn't connected removes that race for the normal (connected) case.
  if (socket.connected) {
    try { socket.emit(eventName, body); return; } catch {}
  }
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
  markContentTriggered();
});

// ── Interactive emoji routine ──────────────────────────────────────────────
// The panel runs the verifier on load and shows the result. If a set is ever
// edited and stops converging, that has to be visible HERE, before a show,
// rather than discovered as a soft reaction in the room.
/* ── Voice over ─────────────────────────────────────────────────────────────
 * Pre-rendered lines, played from THIS device rather than the audience phones.
 * Fifty phones speaking a beat apart would be noise; one voice through the PA
 * is the version that sounds like a show.
 *
 * Files are generated by tools/make-voiceover.sh and served from /vo. Not
 * browser speech synthesis: that varies by device and by OS version, so the
 * same show would sound different on Shine's phone than on his laptop, and a
 * voice he never chose could turn up mid-performance.
 */
const VOICE_LINES = {
  intro: "/vo/intro",
  0: "/vo/round1",
  1: "/vo/round2",
  2: "/vo/round3",
  3: "/vo/round4",
  // Round 5 depends on which finish is armed, exactly like the script does.
  4: { logo: "/vo/round5-logo", green: "/vo/round5-green" },
};

/* Extension is resolved at load, not hardcoded.
 *
 * The committed files are .m4a from macOS `say`. A properly recorded set --
 * ElevenLabs or a real voice artist -- normally arrives as .mp3, and dropping
 * those into public/vo/ should be the entire installation step. So each line
 * probes for .mp3 first and falls back to .m4a, and whichever answers is used.
 * That means no code change, no rename, and no chance of a half-swapped set
 * where two lines are in one voice and five in another.
 */
const VOICE_EXT = new Map();
async function resolveVoiceExt(base) {
  for (const ext of [".mp3", ".m4a"]) {
    try {
      const r = await fetch(base + ext, { method: "HEAD" });
      if (r.ok) { VOICE_EXT.set(base, ext); return; }
    } catch {}
  }
  VOICE_EXT.set(base, ".m4a");
}
function voiceFile(base) {
  return base + (VOICE_EXT.get(base) || ".m4a");
}

/* Reports a half-swapped set.
 *
 * The recorded lines arrived as one take covering seven of the eight, so the
 * eighth still falls back to the machine voice. That only bites on a show with
 * no client logo, where the closing line would suddenly be a different person
 * -- the kind of thing nobody notices until it happens in a room. So the panel
 * says which lines are recorded and which are not, for the finish that is
 * actually armed.
 */
function reportVoiceSet() {
  const box = els.voiceSetStatus;
  if (!box) return;
  const armedFive = currentInteractiveLogo() ? VOICE_LINES[4].logo : VOICE_LINES[4].green;
  const bases = [VOICE_LINES.intro, VOICE_LINES[0], VOICE_LINES[1], VOICE_LINES[2],
                 VOICE_LINES[3], armedFive, VOICE_HOLD];
  const generated = bases.filter((b) => (VOICE_EXT.get(b) || ".m4a") !== ".mp3");
  if (!generated.length) {
    box.textContent = "All 7 lines for this finish are the recorded voice.";
    box.style.color = "";
    return;
  }
  box.innerHTML =
    "⚠️ <b>" + generated.length + " of 7 lines still use the machine voice</b> for the finish " +
    "you have armed: " + generated.map((b) => b.replace("/vo/", "")).join(", ") +
    ". Record and drop it into public/vo/ as an .mp3 with that name.";
  box.style.color = "#ffcf8a";
}
// Played when the reveal is triggered, over the start of the vanish. Without
// it the routine simply stopped talking after the last move and the room had
// no idea it was finished choosing.
const VOICE_HOLD = "/vo/hold";

// One element, reused. A new Audio per line would stack overlapping voices if
// Shine pressed Next twice quickly, which is precisely the moment it must not.
const voicePlayer = new Audio();
voicePlayer.preload = "auto";

// Every line fetched up front. A 2-second line that starts buffering when the
// button is pressed arrives late, and late is worse than absent when the room
// is waiting.
(async function preloadVoice() {
  const bases = [VOICE_LINES.intro, VOICE_LINES[0], VOICE_LINES[1], VOICE_LINES[2],
                 VOICE_LINES[3], VOICE_LINES[4].logo, VOICE_LINES[4].green, VOICE_HOLD];
  await Promise.all(bases.map(resolveVoiceExt));
  bases.forEach((b) => { const a = new Audio(); a.preload = "auto"; a.src = voiceFile(b); });
  reportVoiceSet();
})();

/* Music bed. Loops under the whole routine from this same device, and ducks
 * while a line is spoken so the voice always sits on top. Starts when the
 * field appears and fades out over the reveal, so the finish lands in silence.
 */
const musicBed = new Audio();
musicBed.loop = true;
musicBed.preload = "auto";
const MUSIC_FULL = 0.55;     // under a spoken voice, not competing with it
const MUSIC_DUCKED = 0.16;
let musicFade = null;

function musicUrl() {
  return (els.interactiveMusicUrl?.value || "").trim();
}

function startMusic() {
  const url = musicUrl();
  if (!url || !els.interactiveVoice?.checked) return;
  try {
    if (musicFade) { clearInterval(musicFade); musicFade = null; }
    if (musicBed.src !== url) musicBed.src = url;
    musicBed.volume = MUSIC_FULL;
    musicBed.play()?.catch(() => {});
  } catch {}
}

function stopMusic(fadeMs) {
  if (musicFade) clearInterval(musicFade);
  if (!fadeMs) { try { musicBed.pause(); } catch {} return; }
  const step = 60;
  const drop = musicBed.volume / Math.max(1, fadeMs / step);
  musicFade = setInterval(() => {
    musicBed.volume = Math.max(0, musicBed.volume - drop);
    if (musicBed.volume <= 0.001) {
      clearInterval(musicFade); musicFade = null;
      try { musicBed.pause(); } catch {}
    }
  }, step);
}

function duckMusic(durationMs) {
  if (musicBed.paused) return;
  musicBed.volume = MUSIC_DUCKED;
  // Back up once the line has finished, not on a timer tied to the file being
  // decoded -- the line length is known from the audio element itself.
  clearTimeout(duckMusic._t);
  duckMusic._t = setTimeout(() => {
    if (!musicBed.paused && !musicFade) musicBed.volume = MUSIC_FULL;
  }, durationMs);
}

function voiceUrlForRound(round) {
  const entry = round < 0 ? VOICE_LINES.intro : VOICE_LINES[round];
  if (!entry) return null;
  const base = typeof entry === "string"
    ? entry
    : (currentInteractiveLogo() ? entry.logo : entry.green);
  return voiceFile(base);
}

function playVoice(round) {
  playVoiceUrl(voiceUrlForRound(round));
}

function playVoiceUrl(url) {
  if (!els.interactiveVoice?.checked) return;
  if (!url) return;
  try {
    voicePlayer.pause();
    voicePlayer.currentTime = 0;
    voicePlayer.src = url;
    voicePlayer.onloadedmetadata = () => {
      duckMusic((voicePlayer.duration || 3) * 1000 + 400);
    };
    const p = voicePlayer.play();
    if (p && p.catch) {
      p.catch(() => {
        // Browsers refuse audio until the page has been tapped. Say so rather
        // than failing silently, since silence mid-show looks like a dead app.
        if (els.voiceStatus) {
          els.voiceStatus.textContent = "Blocked — tap Test voice once to unlock audio.";
          els.voiceStatus.style.color = "#ff8a8a";
        }
      });
    }
  } catch {}
}

els.btnVoiceTest?.addEventListener("click", () => {
  const p = voicePlayer.play ? (voicePlayer.src = voiceFile(VOICE_LINES.intro), voicePlayer.play()) : null;
  if (p && p.then) {
    p.then(() => {
      if (els.voiceStatus) {
        els.voiceStatus.textContent = "Audio unlocked ✓";
        els.voiceStatus.style.color = "#8fe0a5";
      }
    }).catch(() => {
      if (els.voiceStatus) {
        els.voiceStatus.textContent = "Could not play — check this device is not muted.";
        els.voiceStatus.style.color = "#ff8a8a";
      }
    });
  }
});

// Which logo this gig is configured with, and therefore which of the two sets
// the routine will run. Module scope rather than inside initInteractive below,
// because the transport buttons need it too.
function currentInteractiveLogo() {
  return (els.interactiveLogoUrl?.value || "").trim() ||
         (els.logoUrl?.value || "").trim();
}

(function initInteractive() {
  const kit = globalThis.InteractiveSet;
  if (!kit || !els.interactiveStatus) return;

  const currentLogo = currentInteractiveLogo;

  // Both sets are verified, not just the one about to be performed. A broken
  // set that happens to be the inactive one today is still broken, and finding
  // that out the first time a gig has no logo configured is finding out too
  // late.
  /* How badly a spectator can misjudge a distance before the room stops
   * converging. This is the number that matters: the routine failed in a real
   * show at 6.8%, because the verifier only ever checked exact-nearest paths.
   * Shown on the panel so the margin is visible rather than assumed.
   */
  function holdsTo(set) {
    if (!kit.setTolerance) return null;
    let last = 0;
    for (let t = 0.05; t <= 0.60; t += 0.01) {
      kit.setTolerance(t);
      if (kit.verifySet(set).ok) last = t; else break;
    }
    kit.setTolerance(0.18);
    return last;
  }

  function describe(set) {
    const r = kit.verifySet(set);
    if (!r.ok) {
      return { ok: false, html: "⛔ <b>DO NOT PERFORM</b> — " + r.problems.join(" ") };
    }
    if (set.wantsLogos && r.targetIndex !== set.clientSlot) {
      // Converges, but not onto the slot the client's logo is drawn at -- so
      // the room would land on a decoy while the client's mark sat untouched
      // elsewhere. The routine would look like it worked and the payoff would
      // be gone, which is the failure worth shouting about.
      return {
        ok: false,
        html: "⛔ <b>DO NOT PERFORM</b> — converges on slot " + r.targetIndex +
              " but the client logo is drawn at slot " + set.clientSlot +
              ". Set CLIENT_SLOT to " + r.targetIndex + " in interactive-set.js.",
      };
    }
    return {
      ok: true,
      ends: set.wantsLogos ? "the client logo" : r.target.label,
      sizes: r.sizes.join(" → "),
      warnings: r.warnings,
      holds: holdsTo(set),
    };
  }

  function refreshInteractive() {
    const logo = currentLogo();
    const set = kit.setFor(logo);
    const other = kit.setFor(logo ? "" : "x");
    const mine = describe(set);
    const theirs = describe(other);

    if (!mine.ok) {
      els.interactiveStatus.innerHTML = mine.html;
      els.interactiveStatus.style.color = "#ff8a8a";
    } else {
      els.interactiveStatus.innerHTML =
        "✅ <b>" + (set.wantsLogos ? "Logo finish" : "Emoji finish") + " armed</b> — " +
        (set.wantsLogos
          ? "five logos in the field, every path ends on the client logo"
          : "no logo set, so no logos in the field; every path ends on " + mine.ends) +
        " &nbsp;·&nbsp; " + mine.sizes + " items" +
        (mine.holds
          ? "<br>Holds even if everyone misjudges every distance by up to <b>" +
            Math.round(mine.holds * 100) + "%</b>."
          : "") +
        (mine.warnings.length ? "<br>⚠️ " + mine.warnings.join(" ") : "") +
        (theirs.ok ? "" : "<br>⚠️ The other finish is broken: " + theirs.html);
      els.interactiveStatus.style.color = "#8fe0a5";
    }

    // The script, so the wording is in front of Shine while he performs rather
    // than remembered. It changes with the set, since only the last line does.
    els.interactiveScript.innerHTML = set.rounds
      .map((r, i) => (i + 1) + ". " + r.say)
      .join("<br>");
  }

  // Show the logo the way the room will see it -- on its white plate, at the
  // real proportions. A URL that 404s or a logo that turns out to be white on
  // transparent is something to find out here, not from the back of a ballroom.
  function previewLogo() {
    refreshInteractive();
    reportVoiceSet();

    const box = els.interactiveLogoPreview;
    if (!box) return;
    const url = currentLogo();
    box.innerHTML = "";

    if (!url) {
      box.textContent =
        "No logo set. The routine runs emoji only and finishes on the turtle — " +
        "no logos appear on screen at all.";
      return;
    }

    const plate = document.createElement("span");
    plate.style.cssText =
      "display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;" +
      "background:#fff;border-radius:14px;padding:8px;vertical-align:middle;margin-right:10px";
    const img = document.createElement("img");
    img.style.cssText = "width:100%;height:100%;object-fit:contain;display:block";
    img.alt = "";
    const note = document.createElement("span");
    note.textContent = "Loading…";
    img.onload = () => { note.textContent = "Logo loads. This is what the room converges on."; };
    img.onerror = () => {
      note.innerHTML = "⚠️ <b>This URL did not load.</b> The show will fall back to a default mark.";
      img.src = kit.DEFAULT_LOGO;
    };
    img.src = url;

    plate.appendChild(img);
    box.appendChild(plate);
    box.appendChild(note);
  }

  els.interactiveLogoUrl?.addEventListener("input", previewLogo);
  els.logoUrl?.addEventListener("input", previewLogo);
  previewLogo();
  // The field is filled from the server a moment after load, so preview again
  // once that has landed rather than showing "no logo set" for a saved show.
  setTimeout(previewLogo, 1200);
})();

/* Driven off the broadcast round rather than off the button handlers, so the
 * Bluetooth remote, the show dock, the section buttons and the HTTP fallback
 * all speak without four separate call sites -- and so the line can never fire
 * for a round the server did not actually move to.
 */
let lastSpokenRound = null;
let spokeHold = false;
function speakRoundIfChanged(st) {
  if (!st || st.phase !== "interactive") {
    lastSpokenRound = null;
    spokeHold = false;
    stopMusic(600);
    return;
  }

  if (st.interactive?.revealed) {
    // The hold line is NOT played here. It is its own beat now, triggered
    // before the reveal by the Lock it in button, so Shine controls the pause
    // between "stay where you are" and the vanish rather than having them
    // land on top of each other.
    if (!spokeHold) {
      spokeHold = true;
      stopMusic(7000);   // fade out so the finish lands in silence
    }
    return;
  }

  spokeHold = false;
  const round = st.interactive?.round ?? -1;
  if (round === lastSpokenRound) return;         // a re-broadcast, not a move
  if (lastSpokenRound === null) startMusic();    // field just came up
  lastSpokenRound = round;
  playVoice(round);
}

function interactiveEmit(event, action) {
  // Read the round count off the set that is actually armed. This used to read
  // a `SET` export that no longer exists once the routine grew two sets, and
  // because `?.` only guarded InteractiveSet itself and not the missing
  // property, every button in the card threw instead of doing nothing visible.
  const kit = globalThis.InteractiveSet;
  const set = kit && kit.setFor ? kit.setFor(currentInteractiveLogo()) : null;
  emitHostAction(event, action, { room: ROOM, totalRounds: set ? set.rounds.length : 0 });
}

// Speaks only -- deliberately sends nothing to the server. The audience screen
// does not change on this beat; the room is being told to hold still on what
// it is already looking at, and the next press is the vanish.
els.btnInteractiveHold?.addEventListener("click", () => playVoiceUrl(voiceFile(VOICE_HOLD)));

els.btnStartInteractive?.addEventListener("click", () => interactiveEmit("host:startInteractive", "startInteractive"));
els.btnInteractiveNext?.addEventListener("click", () => interactiveEmit("host:interactiveNext", "interactiveNext"));
els.btnInteractivePrev?.addEventListener("click", () => interactiveEmit("host:interactivePrev", "interactivePrev"));
els.btnInteractiveReveal?.addEventListener("click", () => interactiveEmit("host:interactiveReveal", "interactiveReveal"));

els.btnSendSchoolShow?.addEventListener("click", () => {
  const p = payloadFromUI();
  if (!p.schoolShow?.slides?.length) return alert("Please add at least one School Show slide first.");
  emitHostAction("host:sendToSchoolShow", "sendToSchoolShow", p);
  markContentTriggered();
});

els.btnGoToReview?.addEventListener("click", () => {
  const p = payloadFromUI();
  if (!p.reviewUrl) return alert("Please enter a Review URL first.");
  emitHostAction("host:goToReview", "goToReview", { reviewUrl: p.reviewUrl });
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

els.btnKaraokePrepareStep?.addEventListener("click", () => {
  const p = payloadFromUI();
  if (!p.karaoke?.audioUrl) return alert("Please enter a Karaoke MP3 URL first.");
  if (!p.karaoke?.lrcUrl) return alert("Please enter a Karaoke .LRC Lyrics URL first.");
  p.karaokeEndPhotoUrl = getBestKaraokeEndPhotoUrlFromUI();
  if (!p.karaoke) p.karaoke = {};
  if (!p.karaoke.endPhotoUrl) p.karaoke.endPhotoUrl = p.karaokeEndPhotoUrl;
  emitHostAction("host:prepareKaraoke", "prepareKaraoke", p);
});

els.btnStartKaraoke?.addEventListener("click", () => {
  const p = payloadFromUI();
  if (!p.karaoke?.audioUrl) return alert("Please enter a Karaoke MP3 URL first.");
  if (!p.karaoke?.lrcUrl) return alert("Please enter a Karaoke .LRC Lyrics URL first.");
  p.karaokeEndPhotoUrl = getBestKaraokeEndPhotoUrlFromUI();
  if (!p.karaoke) p.karaoke = {};
  if (!p.karaoke.endPhotoUrl) p.karaoke.endPhotoUrl = p.karaokeEndPhotoUrl;
  emitHostAction("host:startKaraoke", "startKaraoke", p);
  markContentTriggered();
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

// Saves just the two music URLs + review URL as the server's new baseline
// defaults (server.js customDefaults) -- applied to any brand-new room and
// to Reset All from now on, until changed again here. Deliberately scoped to
// these three fields only; everything else (splash cards, karaoke song, the
// reveal image, corporate mode, etc.) stays per-show / freshly randomized.
els.btnSaveAsDefault?.addEventListener("click", () => {
  const payload = {
    room: ROOM,
    revealMusicUrl: els.revealMusicUrl.value.trim() || DEFAULT_REVEAL_MUSIC_URL,
    reviewMusicUrl: els.reviewMusicUrl.value.trim() || DEFAULT_REVIEW_MUSIC_URL,
    reviewUrl: els.reviewUrl.value.trim() || DEFAULT_REVIEW_URL,
  };
  emitHostAction("host:saveAsDefault", "saveAsDefault", payload);
  const btn = els.btnSaveAsDefault;
  const original = btn.textContent;
  btn.textContent = "Saved as default ✓";
  setTimeout(() => { btn.textContent = original; }, 1600);
});

// ── Message slides: advance controls (manual-advance mode) ─────────────────
els.btnSplashNext?.addEventListener("click", () => emitHostAction("host:splashNext", "splashNext", { room: ROOM }));
els.btnSplashPrev?.addEventListener("click", () => emitHostAction("host:splashPrev", "splashPrev", { room: ROOM }));
els.btnSchoolShowNext?.addEventListener("click", () => emitHostAction("host:schoolShowNext", "schoolShowNext", { room: ROOM }));
els.btnSchoolShowPrev?.addEventListener("click", () => emitHostAction("host:schoolShowPrev", "schoolShowPrev", { room: ROOM }));

// The standalone Cinematic page (cinematic.html) always fetches this
// room's current saved slides itself, so this button doesn't need to
// "push" anything separately -- the routine 180ms auto-save already covers
// that. This just forces an explicit save right now and gives Shine a
// visible confirmation, same UX pattern as "Save as Default" above.
els.btnUpdateCinematicPage?.addEventListener("click", () => {
  emitHostAction("host:saveSettings", "saveSettings", payloadFromUI());
  const btn = els.btnUpdateCinematicPage;
  const original = btn.textContent;
  btn.textContent = "Updated ✓";
  setTimeout(() => { btn.textContent = original; }, 1600);
});

els.clientSplashManualAdvance?.addEventListener("change", () => {
  if (els.clientSplashDurationField) els.clientSplashDurationField.style.display = els.clientSplashManualAdvance.checked ? "none" : "";
  updateSplashControlsVisibility();
  updateRemoteLabels();
});

// ── Message slides: dynamic list (add/remove any number of slides) ─────────
function makeCardRow(value) {
  const row = document.createElement("div");
  row.className = "cardRow";
  const ta = document.createElement("textarea");
  ta.className = "clientSplashCardInput";
  ta.placeholder = "Type line 1\nType line 2";
  ta.value = value || "";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "removeCard";
  btn.textContent = "✕";
  btn.title = "Remove this slide";
  btn.addEventListener("click", () => { row.remove(); debouncedSave(); });
  row.appendChild(ta);
  row.appendChild(btn);
  return row;
}
function renderCardsList(cards) {
  if (!els.clientSplashCardsList) return;
  els.clientSplashCardsList.innerHTML = "";
  const list = Array.isArray(cards) && cards.length ? cards : [""];
  list.forEach((c) => els.clientSplashCardsList.appendChild(makeCardRow(c)));
}
function getCardsFromUI() {
  if (!els.clientSplashCardsList) return [];
  return [...els.clientSplashCardsList.querySelectorAll(".clientSplashCardInput")].map((ta) => ta.value.trim());
}
els.btnAddCard?.addEventListener("click", () => {
  els.clientSplashCardsList?.appendChild(makeCardRow(""));
  debouncedSave();
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

socket.on("disconnect", () => {
  els.statusBadge.textContent = "Status: disconnected";
  // Re-hydrate from the server on the next reconnect too, in case another
  // device changed settings while this one was offline.
  hasHydratedSettings = false;
});

// Only hydrate the form from the server once per connection (right after the
// initial state:update that follows client:role below) -- not on every later
// broadcast, so a live edit on THIS device (or another) doesn't reset a field
// the person here is actively mid-typing into.
let hasHydratedSettings = false;
socket.on("state:update", (st) => {
  els.stateLine.textContent = `State: ${st.phase} • last update ${new Date(st.lastUpdateTs).toLocaleTimeString()}`;
  updateDockPhase(st.phase);
  speakRoundIfChanged(st);
  if (!hasHydratedSettings) {
    hasHydratedSettings = true;
    applyServerStateToForm(st);
    initialPushDone = true; // real state already hydrated the form -- no blind push needed
  }
});

// ── Live-show control dock ──────────────────────────────────────────────────
// Fixed bottom bar so the show triggers are always reachable without scrolling.
// Each dock button proxies to the real section button (.click()), so behavior —
// validations, payload, the iOS deep link on Show Magic — is identical.
const dock = {
  phase: document.getElementById("dockPhase"),
  magic: document.getElementById("dockMagic"),
  karaoke: document.getElementById("dockKaraoke"),
  splashPrev: document.getElementById("dockSplashPrev"),
  splashNext: document.getElementById("dockSplashNext"),
  reset: document.getElementById("dockReset"),
};
const DOCK_PHASE_LABELS = {
  idle: "IDLE",
  reveal_sequence: "REVEALING",
  revealed: "REVEALED",
  karaoke_prepare: "KARAOKE…",
  karaoke: "KARAOKE",
  review: "REVIEW",
  school_show: "CINEMATIC",
};

// Perform Mode's on-screen D-pad -- a touch stand-in for the physical
// Bluetooth remote's 4 arrow keys (see REMOTE HOTKEYS below), for when Shine
// doesn't have the clicker in hand. Both call the same triggerRemoteDirection()
// so a tap and a real remote press always do exactly the same thing.
const dpad = {
  root: document.getElementById("dpad"),
  up: document.getElementById("dpadUp"),
  right: document.getElementById("dpadRight"),
  down: document.getElementById("dpadDown"),
  left: document.getElementById("dpadLeft"),
  rightLabel: document.getElementById("dpadRightLabel"),
  downLabel: document.getElementById("dpadDownLabel"),
  leftLabel: document.getElementById("dpadLeftLabel"),
  center: document.getElementById("dpadCenter"),
};
// Tracked so the keydown remote handler (below) knows whether Right/Left
// should be repurposed for slide advance instead of Karaoke/Reset Phase.
let currentPhase = "idle";

// The real server phase deliberately never leaves "reveal_sequence" on its
// own -- see audience.js's runRevealSequence comment: broadcasting a global
// "revealed" phase change would cut off any OTHER phone still mid-animation,
// since every phone runs the reveal locally and finishes at a slightly
// different time. That's correct and must not change. This timer is purely
// local to the host's OWN browser, never touches server state, and never
// broadcasts anything -- it just corrects the host's own status pill/D-pad
// readout from a permanent "REVEALING" to "REVEALED" once enough time has
// passed for the reveal to realistically be done, using the same
// logo/animation durations every phone is already using.
let revealTimerHandle = null;
let revealVisuallyDone = false;
function scheduleRevealVisuallyDone() {
  if (revealTimerHandle) { clearTimeout(revealTimerHandle); revealTimerHandle = null; }
  revealVisuallyDone = !!els.skipAnimation?.checked;
  if (revealVisuallyDone) return;
  const logoMs = Number(els.logoMs?.value || 4000);
  const animationMs = Number(els.animationMs?.value || 12000);
  revealTimerHandle = setTimeout(() => {
    revealTimerHandle = null;
    revealVisuallyDone = true;
    updateDockPhase(currentPhase);
  }, logoMs + animationMs + 300);
}

// Tracks whether the actual content for this run (Messages sent, Karaoke
// actually STARTED -- not just prepared, or Cinematic sent) has been
// triggered yet. Once true, Right/Down on the remote/D-pad switch from
// "trigger the Show Format action" to "send everyone to the review page
// now" (see triggerRemoteDirection below) -- lets a single remote press
// take the audience straight to Google review once the thank-you content
// has run, instead of re-triggering the same content again.
let contentStageTriggered = false;
function markContentTriggered() {
  contentStageTriggered = true;
  updateRemoteLabels();
}

function updateDockPhase(phase) {
  if (phase === "reveal_sequence" && currentPhase !== "reveal_sequence") {
    scheduleRevealVisuallyDone();
    contentStageTriggered = false; // fresh Magic press -- back to square one
  } else if (phase !== "reveal_sequence") {
    if (revealTimerHandle) { clearTimeout(revealTimerHandle); revealTimerHandle = null; }
    revealVisuallyDone = false;
  }
  if (phase === "idle") contentStageTriggered = false; // Reset Phase
  currentPhase = phase;
  const displayPhase = phase === "reveal_sequence" && revealVisuallyDone ? "revealed" : phase;
  const label = DOCK_PHASE_LABELS[displayPhase] || String(displayPhase || "—").toUpperCase();
  if (dock.phase) dock.phase.textContent = label;
  if (dpad.center) dpad.center.textContent = label;
  updateSplashControlsVisibility();
  updateDockKaraokeSlot();
  updateRemoteLabels();
}
// Keeps the D-pad's Right/Down/Left labels (and the physical remote's actual
// behavior, since both share triggerRemoteDirection()) in sync with Show
// Format, contentStageTriggered, and the manual-advance contextual override
// described in the REMOTE HOTKEYS comment below. Also highlights whichever
// button is the logical NEXT thing to press, so the highlight moves off
// Magic once it's actually been used instead of staying stuck there.
function updateRemoteLabels() {
  const splashRemoteActive = currentPhase === "review" && !!els.clientSplashManualAdvance?.checked;
  const choice = getSelectedDockAltAction();
  const formatLabel = choice === "cinematic" ? "Cinematic" : choice === "karaoke" ? (currentPhase === "karaoke_prepare" ? "Start Karaoke" : "Karaoke") : "Messages";
  const rightDefaultLabel = contentStageTriggered ? "Send to Review" : formatLabel;
  if (dpad.rightLabel) dpad.rightLabel.textContent = splashRemoteActive ? "Next Slide" : rightDefaultLabel;
  if (dpad.downLabel) dpad.downLabel.textContent = contentStageTriggered ? "Send to Review" : formatLabel;
  if (dpad.leftLabel) dpad.leftLabel.textContent = splashRemoteActive ? "Prev Slide" : "Reset";

  // "revealed" is basically never reached in real use -- audience.js plays
  // the reveal animation entirely client-side and never reports back, so the
  // server-side phase just stays "reveal_sequence" for the rest of the show
  // until the next format is triggered. Treat it the same as "revealed" here
  // so the highlight actually moves off Magic once Magic's been pressed.
  let next = [];
  if (currentPhase === "idle") next = ["up"];
  else if (contentStageTriggered) next = ["right", "down"];
  else if (currentPhase === "reveal_sequence" || currentPhase === "revealed" || currentPhase === "karaoke_prepare") next = ["right", "down"];
  dpad.up?.classList.toggle("next", next.includes("up"));
  dpad.right?.classList.toggle("next", next.includes("right"));
  dpad.down?.classList.toggle("next", next.includes("down"));
  dpad.left?.classList.toggle("next", next.includes("left"));
}
// The dock's 2nd slot is one button whose meaning is set explicitly by the
// "Show Format" radio group (Messages / Karaoke / Cinematic), not derived
// from which content happens to be filled in -- lets Shine keep Karaoke
// AND Cinematic both loaded and configured at once (e.g. one for an evening
// show, one for a morning show) and just flip the selection between shows
// without clearing anything out.
function updateDockKaraokeSlot() {
  if (!dock.karaoke) return;
  const choice = getSelectedDockAltAction();
  if (choice === "cinematic") {
    dock.karaoke.textContent = "🎬 Cinematic";
    return;
  }
  if (choice === "karaoke") {
    // Two-step: first press prepares (loads the screen on every phone, shows
    // Enable Sound, nothing plays yet); once everyone's confirmed ready, the
    // same button's second press actually starts it, perfectly in sync.
    dock.karaoke.textContent = currentPhase === "karaoke_prepare" ? "▶ Start Karaoke" : "🎤 Prepare Karaoke";
    return;
  }
  dock.karaoke.textContent = "💬 Messages";
}
// Prev/Next slide controls (both the dock's compact buttons and the full
// buttons in the Client Splash card) only make sense while actually showing
// message slides in manual-advance mode -- hidden otherwise so they can't be
// clicked to silently nudge an index that isn't currently on screen.
function updateSplashControlsVisibility() {
  const show = currentPhase === "review" && !!els.clientSplashManualAdvance?.checked;
  if (dock.splashPrev) dock.splashPrev.style.display = show ? "" : "none";
  if (dock.splashNext) dock.splashNext.style.display = show ? "" : "none";
  if (els.btnSplashPrev) els.btnSplashPrev.style.display = show ? "" : "none";
  if (els.btnSplashNext) els.btnSplashNext.style.display = show ? "" : "none";
}
dock.magic?.addEventListener("click", () => els.btnSendReveal?.click());
// Single source of truth for "do whatever the Show Format selector currently
// points at" -- used by the dock's alt-slot button AND (as of v127) the
// remote/D-pad's Right and Down directions, so all three always agree with
// each other and with Show Format, instead of Right/Down being hardcoded to
// Karaoke/Messages the way they were before Cinematic existed.
function triggerShowFormatAction() {
  const choice = getSelectedDockAltAction();
  if (choice === "cinematic") { els.btnSendSchoolShow?.click(); return; }
  if (choice === "karaoke") {
    (currentPhase === "karaoke_prepare" ? els.btnStartKaraoke : els.btnKaraokePrepareStep)?.click();
    return;
  }
  els.btnSendReview?.click();
}
dock.karaoke?.addEventListener("click", triggerShowFormatAction);
dock.splashPrev?.addEventListener("click", () => els.btnSplashPrev?.click());
dock.splashNext?.addEventListener("click", () => els.btnSplashNext?.click());
dock.reset?.addEventListener("click", () => els.btnResetPhase?.click());
els.dockAltActionRadios?.forEach((r) => r.addEventListener("change", () => { updateDockKaraokeSlot(); updateRemoteLabels(); }));

socket.on("counts:update", (c) => {
  els.countBadge.textContent = `Audience: ${c.audience} • Hosts: ${c.hosts} • Total: ${c.total}`;
  if (c.revision) els.revBadge.textContent = `Revision: ${c.revision}`;
});


loadSettings();
updateRemoteLabels(); // paints the D-pad's initial "next" highlight before the first server round-trip

// Push this browser's local settings cache to the server ONLY if the
// server's real state doesn't show up in time (e.g. a genuinely brand-new
// room). Pushing unconditionally on every load was a real bug: if this
// particular browser's local cache was stale or missing a field that had
// only ever been set from a DIFFERENT device (e.g. Cinematic slides typed
// in on the laptop, then the host panel opened fresh on the phone), the
// blind push fired before the server's real "state:update" arrived and
// silently overwrote the live show's real content with this browser's
// stale/empty local copy. See the state:update handler below -- once the
// real state hydrates the form, that hydration wins and this fallback
// becomes a no-op.
let initialPushDone = false;
function pushInitialSettingsIfNeeded() {
  if (initialPushDone) return;
  initialPushDone = true;
  emitHostAction("host:saveSettings", "saveSettings", payloadFromUI());
}
setTimeout(pushInitialSettingsIfNeeded, 2500);

/* ================== PERFORM MODE ==================
   Hides every settings card (and group headers) during a live show, leaving
   just the status badges and the fixed bottom dock -- nothing left to
   scroll past once everything is configured. Persisted per-browser so it
   survives a reload mid-show. */
const PERFORM_MODE_KEY = `hostPerformMode:${ROOM}`;
function setPerformMode(on) {
  document.body.classList.toggle("perform-mode", on);
  els.btnPerformMode?.classList.toggle("active", on);
  if (els.btnPerformMode) els.btnPerformMode.textContent = on ? "🎯 Exit Perform Mode" : "🎯 Perform Mode";
  localStorage.setItem(PERFORM_MODE_KEY, on ? "1" : "0");
}
els.btnPerformMode?.addEventListener("click", () => setPerformMode(!document.body.classList.contains("perform-mode")));
setPerformMode(localStorage.getItem(PERFORM_MODE_KEY) === "1");

/* ================== CARD COLLAPSE/EXPAND ==================
   Each settings card is a <details> -- remember open/closed per card so the
   layout from setup is still there next time. */
const CARD_STATE_KEY = `hostCardOpen:${ROOM}`;
(function initCardCollapse() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(CARD_STATE_KEY) || "{}"); } catch {}
  document.querySelectorAll("details.card[id]").forEach((d) => {
    if (Object.prototype.hasOwnProperty.call(saved, d.id)) d.open = !!saved[d.id];
    d.addEventListener("toggle", () => {
      saved[d.id] = d.open;
      localStorage.setItem(CARD_STATE_KEY, JSON.stringify(saved));
    });
  });
})();

/* ================== REMOTE HOTKEYS (consolidated) ==================
   Single keydown listener, one action per key, matching the show dock:
     ArrowUp    -> Show Magic
     ArrowRight -> Whichever Show Format is selected (Messages/Karaoke/
                   Cinematic) -- Karaoke is a two-step Prepare-then-Start
                   (v111); repeat presses toggle between the two.
     ArrowDown  -> Same Show Format action as ArrowRight (v127 -- see below)
     ArrowLeft  -> Reset Phase
   Reset All is intentionally NOT on the remote (on-screen button only), so a
   stray Left press can never wipe the show. Ignored while typing in a field.

   Contextual override (v85): while in the review phase with message-slide
   Manual advance turned on, ArrowRight/ArrowLeft are repurposed to Next/
   Previous slide instead of the Show Format action/Reset Phase -- this is
   what lets a single presenter-clicker-style remote pace through slides for
   live commentary. Reverts to normal behavior in every other phase, and
   immediately once manual advance is off or review ends, so muscle memory
   for the remote's normal behavior is never permanently changed.

   v127: ArrowRight and ArrowDown used to be hardcoded to Karaoke and
   Messages respectively, predating the Show Format selector (v119) and
   Cinematic (v113+) -- so neither key could ever reach Cinematic. Both now
   route through the same triggerShowFormatAction() the dock's alt-slot
   button already used, so the remote always agrees with whatever Show
   Format is selected. Confirmed with Shine before changing since it does
   change the remote's existing muscle-memory behavior.

   v132: once the content stage has actually been triggered this run
   (contentStageTriggered -- Messages sent, Karaoke actually started, or
   Cinematic sent), ArrowRight/ArrowDown switch AGAIN, from the Show Format
   action to "send everyone to the review page now" (host:goToReview). For
   Auto Redirect being off in Review Settings: the review/thank-you screen
   no longer auto-advances to the Google review link on its own, so this is
   what lets one more remote press take the whole audience there without
   waiting on each phone's own on-screen review button.
=================================================================== */
function isTypingInField() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = (el.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || el.isContentEditable;
}

// Single source of truth for what each of the 4 directions does -- shared by
// the physical/Bluetooth remote's keydown handler below AND the on-screen
// Perform Mode D-pad, so a tap and a real remote press are always identical.
// v127: Right and Down now both route through triggerShowFormatAction() --
// whichever of Messages/Karaoke/Cinematic is selected in Show Format -- so
// they finally reach Cinematic instead of being hardcoded to Karaoke/
// Messages from before Cinematic existed. Manual-advance slide stepping
// still takes priority on Right/Left while actively in that mode.
function triggerRemoteDirection(dir) {
  const splashRemoteActive = currentPhase === "review" && !!els.clientSplashManualAdvance?.checked;

  if (dir === "up") els.btnSendReveal?.click();                                       // Show Magic
  else if (dir === "right") {
    if (splashRemoteActive) els.btnSplashNext?.click();
    else if (contentStageTriggered) els.btnGoToReview?.click();
    else triggerShowFormatAction();
  }
  else if (dir === "down") {
    if (contentStageTriggered) els.btnGoToReview?.click();
    else triggerShowFormatAction();
  }
  else if (dir === "left") (splashRemoteActive ? els.btnSplashPrev : els.btnResetPhase)?.click();
}

document.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  if (isTypingInField()) return;
  const DIR_BY_KEY = { ArrowUp: "up", ArrowRight: "right", ArrowDown: "down", ArrowLeft: "left" };
  const dir = DIR_BY_KEY[e.key];
  if (!dir) return;
  e.preventDefault();
  triggerRemoteDirection(dir);
});

dpad.up?.addEventListener("click", () => triggerRemoteDirection("up"));
dpad.right?.addEventListener("click", () => triggerRemoteDirection("right"));
dpad.down?.addEventListener("click", () => triggerRemoteDirection("down"));
dpad.left?.addEventListener("click", () => triggerRemoteDirection("left"));

