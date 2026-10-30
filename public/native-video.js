// Ringer's native camera (?native=1, Shine 2026-10-30).
//
// iOS gives an app its video effects (Edge Light, Center Stage) only if the
// app itself runs the camera: one getUserMedia from this page, which WebKit
// opens with no bundle, and the whole app was marked ineligible until it
// relaunched. So in Ringer's native mode the call runs in the app (Twilio's
// iOS SDK) and this page keeps everything it draws: the screens, the pill,
// the buttons, the fading, the tilt, the swap.
//
// How: Twilio.Video.connect and createLocalVideoTrack are replaced by stand-ins
// with the same shape, whose tracks attach() an EMPTY <video class="nv">. The
// page lays those out exactly as it lays out real ones. Every frame, where
// each one sits (box, clip radius, centre, size, CSS transform, object-fit)
// goes to the app, which paints the real picture underneath this transparent
// page in the same place. The app answers through window.nvEvent.

(function () {
  var q = new URLSearchParams(location.search);
  if (q.get("native") !== "1") { window.NativeVideo = null; return; }

  var h = window.webkit && window.webkit.messageHandlers;
  var handler = h && (h.clipvideo || h.assistantapp);
  function post(m) { try { handler.postMessage(m); } catch (e) {} }

  var css = document.createElement("style");
  css.textContent =
    "video.nv { background: transparent !important; }" +
    // While the app is painting, everything between it and the controls
    // must let it show through.
    "html.nvlive, html.nvlive body, html.nvlive .screen, html.nvlive #video," +
    "html.nvlive #remoteWrap, html.nvlive #selfWrap, html.nvlive #incoming.hasCam," +
    "html.nvlive #inSelf, html.nvlive #call, html.nvlive #big, html.nvlive #small" +
    " { background: transparent !important; }";
  document.head.appendChild(css);

  function Emitter() { this._h = {}; }
  Emitter.prototype.on = function (e, f) { (this._h[e] = this._h[e] || []).push(f); return this; };
  Emitter.prototype.emit = function (e) {
    var args = Array.prototype.slice.call(arguments, 1), self = this;
    (this._h[e] || []).slice().forEach(function (f) { try { f.apply(self, args); } catch (x) {} });
  };

  var dims = { me: [0, 0], them: [0, 0] };

  function Track(kind, who) {
    Emitter.call(this);
    this.kind = kind; this.who = who; this.isEnabled = true; this._els = [];
  }
  Track.prototype = Object.create(Emitter.prototype);
  Track.prototype.attach = function () {
    var who = this.who, el;
    if (this.kind === "video") {
      el = document.createElement("video");
      el.className = "nv";
      el.dataset.nv = who;
      el.muted = true;
      el.setAttribute("playsinline", "");
      Object.defineProperty(el, "videoWidth", { get: function () { return dims[who][0]; } });
      Object.defineProperty(el, "videoHeight", { get: function () { return dims[who][1]; } });
    } else {
      el = document.createElement("span");
    }
    this._els.push(el);
    return el;
  };
  Track.prototype.detach = function () { var e = this._els; this._els = []; return e; };
  Track.prototype.enable = function () { this.isEnabled = true; post({ tag: "nv-enable", kind: this.kind, on: true }); };
  Track.prototype.disable = function () { this.isEnabled = false; post({ tag: "nv-enable", kind: this.kind, on: false }); };
  Track.prototype.stop = function () {};

  function pubs(track) { var m = new Map(); if (track) m.set(track.kind, { track: track }); return m; }

  function Participant(identity) {
    Emitter.call(this);
    this.identity = identity;
    this.videoTracks = pubs(new Track("video", "them"));
    this.audioTracks = pubs(new Track("audio", "them"));
  }
  Participant.prototype = Object.create(Emitter.prototype);

  var room = null, pending = null;

  function Room() {
    Emitter.call(this);
    this.participants = new Map();
    var local = { videoTracks: pubs(new Track("video", "me")), audioTracks: pubs(new Track("audio", "me")) };
    local.publishTrack = function (t) { local.videoTracks = pubs(t); return Promise.resolve(); };
    local.unpublishTrack = function () { local.videoTracks = new Map(); };
    this.localParticipant = local;
    this.state = "connected";
  }
  Room.prototype = Object.create(Emitter.prototype);
  Room.prototype.disconnect = function () {
    if (this.state === "disconnected") return;
    this.state = "disconnected";
    post({ tag: "nv-end" });
    if (room === this) room = null;
    this.emit("disconnected", this);
  };

  function install() {
    if (!window.Twilio || !Twilio.Video) return false;
    Twilio.Video.connect = function (token, opts) {
      return new Promise(function (resolve, reject) {
        pending = { resolve: resolve, reject: reject };
        var facing = opts && opts.video && opts.video.facingMode;
        post({ tag: "nv-connect", token: token, room: opts && opts.name,
               facing: facing || "user" });
      });
    };
    Twilio.Video.createLocalVideoTrack = function (opts) {
      post({ tag: "nv-flip", facing: (opts && opts.facingMode) || "user" });
      return Promise.resolve(new Track("video", "me"));
    };
    return true;
  }
  if (!install()) addEventListener("DOMContentLoaded", install);

  // The app's side of the call.
  window.nvEvent = function (type, data) {
    data = data || {};
    if (type === "connected" && pending) {
      room = new Room();
      var p = pending; pending = null;
      p.resolve(room);
    } else if (type === "failed" && pending) {
      var f = pending; pending = null;
      f.reject(new Error(data.error || "could not connect"));
    } else if (type === "joined" && room && !room.participants.has(data.identity)) {
      var part = new Participant(data.identity);
      room.participants.set(data.identity, part);
      room.emit("participantConnected", part);
    } else if (type === "left" && room && room.participants.has(data.identity)) {
      var gone = room.participants.get(data.identity);
      room.participants.delete(data.identity);
      room.emit("participantDisconnected", gone);
    } else if (type === "ended" && room) {
      var r = room; room = null;
      r.state = "disconnected";
      r.emit("disconnected", r);
    } else if (type === "dims") {
      dims[data.who] = [data.w, data.h];
      document.querySelectorAll('video.nv[data-nv="' + data.who + '"]').forEach(function (v) {
        v.dispatchEvent(new Event("resize"));
      });
    }
  };

  // The camera before the call: the incoming screen's self-view and the
  // outgoing preview. The page puts this where it would put its own video.
  window.NativeVideo = {
    preview: function (facing) {
      post({ tag: "nv-preview", on: true, facing: facing || "user" });
      return new Track("video", "me").attach();
    },
    stopPreview: function () { post({ tag: "nv-preview", on: false }); },
  };

  // Where every picture sits, sent whenever it changes.
  var last = "";
  function report() {
    var slots = [];
    document.querySelectorAll("video.nv").forEach(function (el) {
      if (!el.isConnected) return;
      var r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      var box = el.parentElement, b = box.getBoundingClientRect();
      var cs = getComputedStyle(el), m = [1, 0, 0, 1];
      var t = cs.transform;
      if (t && t !== "none") {
        var n = t.match(/matrix\(([^)]+)\)/);
        if (n) m = n[1].split(",").slice(0, 4).map(parseFloat);
      }
      slots.push({
        who: el.dataset.nv,
        blur: el.classList.contains("themBg"),
        box: [b.left, b.top, b.width, b.height].map(Math.round),
        radius: parseFloat(getComputedStyle(box).borderTopLeftRadius) || 0,
        c: [r.left + r.width / 2, r.top + r.height / 2].map(function (v) { return Math.round(v * 2) / 2; }),
        size: [el.offsetWidth, el.offsetHeight],
        m: m.map(function (v) { return Math.round(v * 1000) / 1000; }),
        fit: cs.objectFit === "contain" ? "contain" : "cover",
      });
    });
    var sig = JSON.stringify(slots);
    if (sig !== last) {
      last = sig;
      document.documentElement.classList.toggle("nvlive", slots.length > 0);
      post({ tag: "nv-slots", slots: slots });
    }
    requestAnimationFrame(report);
  }
  requestAnimationFrame(report);
})();
