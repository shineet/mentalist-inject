//
//  lib/render.js
//
//  Turns a sequence into a page that plays it.
//
//  Used two ways from one template: served live for rehearsal, or exported with
//  every clip inlined as a single file for a laptop with no internet. Both go
//  through here so the thing rehearsed and the thing performed cannot differ.
//

export function renderSequence(seq, { standalone = false } = {}) {
  const data = JSON.stringify(seq);
  const title = (seq.title || "Sequence").replace(/[<>]/g, "");
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${title}</title>
<style>
  :root { --gold: #ffd76a; }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; background: #000; overflow: hidden; }
  body {
    font-family: "Iowan Old Style", Georgia, "Times New Roman", serif;
    color: #fff; -webkit-font-smoothing: antialiased;
    display: flex; align-items: center; justify-content: center;
    cursor: none;
  }
  #stage { text-align: center; padding: 6vmin; max-width: 92vw; }
  #main, #sub {
    opacity: 0; transition: opacity .9s ease; white-space: pre-line;
    text-wrap: balance;
  }
  #main { font-size: clamp(28px, 5.6vw, 92px); line-height: 1.22; }
  #sub  { font-size: clamp(17px, 2.6vw, 40px); line-height: 1.35; margin-top: 3vmin;
          color: rgba(255,255,255,.72); }
  .show { opacity: 1 !important; }
  .gold { color: var(--gold); }

  /* The wheel. Drawn rather than an image so the export carries no files. */
  #wheel { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; }
  #wheel.show { display: flex; }
  #wheel .spin {
    width: 78vmin; height: 78vmin; border-radius: 50%;
    background: repeating-conic-gradient(#fff 0 9deg, #000 9deg 18deg);
    animation: turn 7s linear infinite;
    mask-image: radial-gradient(circle, #000 62%, transparent 72%);
    -webkit-mask-image: radial-gradient(circle, #000 62%, transparent 72%);
  }
  @keyframes turn { to { transform: rotate(360deg); } }

  #start {
    position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
    background: #000; cursor: pointer; z-index: 10; text-align: center; padding: 8vmin;
  }
  #start b { font-size: clamp(22px, 3.4vw, 44px); font-weight: 500; display: block; }
  #start span { display: block; margin-top: 2.4vmin; font-size: clamp(14px, 1.7vw, 20px);
                color: rgba(255,255,255,.55); }
</style></head>
<body>
<div id="wheel"><div class="spin"></div></div>
<div id="stage"><div id="main"></div><div id="sub"></div></div>
<div id="start"><div>
  <b>${title}</b>
  <span>Tap to begin. Full screen first, and check the volume &mdash; browsers keep audio muted until the page has been touched.</span>
</div></div>
<audio id="bed" loop></audio>
<audio id="voice"></audio>
<script>
const SEQ = ${data};
const mainEl = document.getElementById('main');
const subEl  = document.getElementById('sub');
const wheel  = document.getElementById('wheel');
const bed    = document.getElementById('bed');
const voice  = document.getElementById('voice');
const start  = document.getElementById('start');

// Steps with a time run themselves; the rest wait for a click. Splitting them
// here rather than while playing keeps the click handler from having to know
// whether the timed part has finished.
const timed  = (SEQ.steps || []).filter(s => typeof s.atMs === 'number');
const manual = (SEQ.steps || []).filter(s => !(typeof s.atMs === 'number'));
let manualAt = -1;
let started  = false;

function paint(step) {
  wheel.classList.toggle('show', !!step.wheel);
  if (step.wheel) { mainEl.classList.remove('show'); subEl.classList.remove('show'); return; }
  const main = step.main || '';
  const sub  = step.sub || '';
  mainEl.textContent = main;
  subEl.textContent  = sub;
  mainEl.classList.toggle('gold', !!step.gold);
  subEl.classList.toggle('gold', !!step.gold);
  mainEl.classList.toggle('show', main.length > 0);
  subEl.classList.toggle('show', sub.length > 0);
  if (step.voiceUrl) {
    try {
      voice.src = step.voiceUrl;
      voice.currentTime = 0;
      const p = voice.play();
      // Was swallowed entirely. A refused clip is exactly the failure worth
      // hearing about, and it fails in the room rather than at the desk.
      if (p && p.catch) p.catch((e) => console.warn('voice blocked:', e && e.message));
    } catch (e) { console.warn('voice failed:', e && e.message); }
  }
}

function fadeBed(ms) {
  const from = bed.volume, steps = 30, gap = Math.max(16, ms / steps);
  let i = 0;
  const t = setInterval(() => {
    i++;
    bed.volume = Math.max(0, from * (1 - i / steps));
    if (i >= steps) { clearInterval(t); try { bed.pause(); } catch {} }
  }, gap);
}

// A single sample of silence. Browsers unlock audio PER ELEMENT, not per page,
// so an element first touched seventy-four seconds after the click is refused
// no matter how many other sounds have played since. Priming it inside the
// gesture is what makes a clip late in a sequence audible at all -- this is why
// the pre-show's announcer never spoke.
const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

function unlock(el) {
  try {
    el.src = SILENCE;
    const p = el.play();
    if (p && p.then) p.then(() => { el.pause(); el.currentTime = 0; }).catch(() => {});
  } catch {}
}

function begin() {
  if (started) return;
  started = true;
  start.style.display = 'none';
  unlock(voice);
  if (SEQ.musicUrl) {
    bed.src = SEQ.musicUrl;
    bed.volume = 0.7;
    bed.play().catch(() => {});
  }
  timed.forEach(step => setTimeout(() => paint(step), step.atMs));
  if (typeof SEQ.fadeOutAtMs === 'number') {
    setTimeout(() => fadeBed(SEQ.fadeMs || 3000), SEQ.fadeOutAtMs);
  }
}

function advance(dir) {
  if (!manual.length) return;
  const next = manualAt + dir;
  if (next < 0 || next >= manual.length) return;
  manualAt = next;
  paint(manual[manualAt]);
}

start.addEventListener('click', begin);
document.addEventListener('click', () => { started ? advance(1) : begin(); });
document.addEventListener('keydown', (e) => {
  if (!started) { begin(); return; }
  if (e.key === 'ArrowLeft') advance(-1);
  else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') advance(1);
});
</script>
</body></html>`;
}
