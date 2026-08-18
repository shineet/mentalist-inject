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
// How much longer a real separator must be than the longest in-line pause.
const SEPARATION = 1.6;

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

const bySize = [...gaps].sort((a, b) => b.len - a.len);
const separators = bySize.slice(0, NEEDED - 1);
const longestInline = bySize[NEEDED - 1];
const ratio = separators[separators.length - 1].len / longestInline.len;

console.log(`  shortest separator ${separators[separators.length - 1].len.toFixed(2)}s`);
console.log(`  longest in-line pause ${longestInline.len.toFixed(2)}s`);
console.log(`  ratio ${ratio.toFixed(2)}x  (need ${SEPARATION}x)`);

if (ratio < SEPARATION) {
  console.error(`
REFUSING TO SPLIT. The line breaks are not clearly longer than the pauses
inside sentences, so any split would be guesswork -- and a mis-assigned line
puts the wrong words at the finish of the routine.

Regenerate with stacked [long pause] separators, or generate the eight lines
separately. See tools/voiceover-script.txt.`);
  process.exit(1);
}

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
