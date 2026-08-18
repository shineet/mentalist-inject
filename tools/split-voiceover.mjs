/*
 * split-voiceover.mjs <recording.mp3>
 *
 * Splits one ElevenLabs take into the eight files public/vo/ expects.
 *
 * It does NOT assume a separator length. Two takes have now come back with
 * whatever gap the model felt like -- <break time="3.0s"> was ignored entirely
 * and produced nothing longer than 0.68s -- so a fixed threshold is exactly the
 * wrong tool.
 *
 * Instead it measures every gap, sorts them, and looks for a clean break in the
 * distribution: the 7 longest must be clearly longer than the 8th. If they are,
 * those 7 are the line boundaries whatever their absolute length. If they are
 * not, the file genuinely does not distinguish line breaks from breaths, and it
 * refuses -- because assigning lines by guesswork puts the wrong words at the
 * most exposed moment of the routine, which has already happened three times.
 *
 *   node tools/split-voiceover.mjs ~/Downloads/take.mp3
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2];
if (!SRC) { console.error('usage: node tools/split-voiceover.mjs <recording.mp3>'); process.exit(1); }
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'vo');
const NAMES = ['intro', 'round1', 'round2', 'round3', 'round4', 'round5-logo', 'round5-green', 'hold'];
const NEEDED = NAMES.length;

/* The lines, in order, with the text each one says.
 *
 * Length is what identifies a segment, not the size of the gap before it.
 * Picking the N longest gaps looked obvious and is wrong: in a real take one
 * genuine separator came back at 0.87s while a pause INSIDE a sentence was
 * 1.05s, so the longest-seven rule silently chose a boundary set that made
 * round1 three seconds long and hold nearly ten.
 *
 * Character count is a good proxy for speaking time, so instead every plausible
 * set of boundaries is scored against these proportions and the best fit wins.
 * That is robust to whatever gap lengths the model decides to produce.
 */
const LINES = [
  'Look at the screen. Take a moment. And think of any one of these.',
  'Now, move to the closest one that has a face. Not your own. If two look equally close, take either.',
  'Now, move to the food nearest to you.',
  'Now, move to the nearest object you could pick up and hold. Not food, and nothing alive.',
  'Now, move to the animal nearest to you.',
  'And finally. Move to the nearest logo.',
  'And finally. Move to the green thing nearest to you.',
  'Now stay exactly where you are. Don\'t move. Lock it in, and keep your eyes on it.',
];
const TOTAL_CHARS = LINES.reduce((n, l) => n + l.length, 0);
const EXPECTED = LINES.map((l) => l.length / TOTAL_CHARS);
// Mean absolute error in the length proportions, above which the fit is not
// trustworthy enough to write files.
const MAX_MISFIT = 0.030;

// ffmpeg writes its analysis to STDERR, so both streams have to be read --
// reading only stdout returns nothing and looks exactly like "no gaps found".
const ff = (args) => {
  const r = spawnSync('ffmpeg', args, { encoding: 'utf8' });
  return (r.stdout || '') + (r.stderr || '');
};
const duration = Number(execFileSync('ffprobe',
  ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', SRC], { encoding: 'utf8' }).trim());

// Every gap, however short.
const log = ff(['-i', SRC, '-af', 'silencedetect=noise=-38dB:d=0.20', '-f', 'null', '-']);
const gaps = [];
let pending = null;
for (const line of log.split('\n')) {
  const s = line.match(/silence_start: ([0-9.]+)/);
  const e = line.match(/silence_end: ([0-9.]+)/);
  if (s) pending = Number(s[1]);
  if (e && pending !== null) { gaps.push({ start: pending, end: Number(e[1]), len: Number(e[1]) - pending }); pending = null; }
}

console.log(`${path.basename(SRC)}  ${duration.toFixed(2)}s, ${gaps.length} gaps`);
if (gaps.length < NEEDED - 1) {
  console.error(`\nREFUSING: only ${gaps.length} gaps, need at least ${NEEDED - 1} line breaks.`);
  process.exit(1);
}

/* Try every plausible set of boundaries and keep the one whose segment lengths
 * best match the script. Only gaps long enough to be a line break are
 * considered, which keeps the search tiny -- a dozen or so candidates choose 7,
 * a couple of thousand combinations. */
const candidates = gaps.filter((g) => g.len >= 0.40);
if (candidates.length < NEEDED - 1) {
  console.error(`\nREFUSING: only ${candidates.length} gaps long enough to be line breaks, need ${NEEDED - 1}.`);
  process.exit(1);
}
console.log(`  ${candidates.length} candidate boundaries`);

function misfit(chosen) {
  const segs = [];
  let from = 0;
  for (const c of chosen) { segs.push(c.start - from); from = c.end; }
  segs.push(duration - from);
  if (segs.some((d) => d < 0.6)) return Infinity;      // no line is that short
  const total = segs.reduce((a, b) => a + b, 0);
  return segs.reduce((sum, d, i) => sum + Math.abs(d / total - EXPECTED[i]), 0) / segs.length;
}

let best = null;
const pick = (start, chosen) => {
  if (chosen.length === NEEDED - 1) {
    const m = misfit(chosen);
    if (!best || m < best.m) best = { m, chosen: [...chosen] };
    return;
  }
  for (let i = start; i < candidates.length; i++) {
    // enough candidates must remain to finish the set
    if (candidates.length - i < NEEDED - 1 - chosen.length) break;
    chosen.push(candidates[i]);
    pick(i + 1, chosen);
    chosen.pop();
  }
};
pick(0, []);

console.log(`  best fit misfit ${best.m.toFixed(4)}  (refuse above ${MAX_MISFIT})`);
if (best.m > MAX_MISFIT) {
  console.error(`
REFUSING TO SPLIT. No set of boundaries produces segment lengths that match the
script, so the file probably does not contain these eight lines in this order.
Splitting anyway would put the wrong words at the finish of the routine.

See tools/voiceover-script.txt -- the fallback is eight separate generations.`);
  process.exit(1);
}
const separators = best.chosen;

// Boundaries, back in time order.
separators.sort((a, b) => a.start - b.start);
const segs = [];
let from = 0;
for (const sep of separators) { segs.push([from, sep.start]); from = sep.end; }
segs.push([from, duration]);

fs.mkdirSync(OUT, { recursive: true });
const FILTER = 'silenceremove=start_periods=1:start_silence=0.05:start_threshold=-45dB:detection=peak,' +
  'areverse,silenceremove=start_periods=1:start_silence=0.05:start_threshold=-45dB:detection=peak,areverse,' +
  'adelay=150,apad=pad_dur=0.2,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=44100';
console.log();
segs.forEach(([a, b], i) => {
  const out = path.join(OUT, NAMES[i] + '.mp3');
  ff(['-y', '-loglevel', 'error', '-i', SRC, '-ss', String(a), '-to', String(b),
      '-af', FILTER, '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '128k', out]);
  const d = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], { encoding: 'utf8' }).trim();
  console.log(`  ${(NAMES[i] + '.mp3').padEnd(18)} ${Number(d).toFixed(2)}s`);
});
console.log(`\nPlay it through before trusting it:\n  for f in ${NAMES.slice(0, 6).join(' ')} hold; do afplay ${OUT}/$f.mp3; sleep 1; done`);
