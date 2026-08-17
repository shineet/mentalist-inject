/*
 * search-seed.mjs — finds a layout the routine actually converges on.
 *
 * Every round in the interactive routine is relational ("move to the nearest
 * X"), which means the instructions guarantee nothing on their own: the SCATTER
 * decides whether the room ends on one item or three. Only about one layout in
 * a hundred converges, and there is no way to reason your way to a good one, so
 * this brute-forces the seed space and reports the candidates that pass.
 *
 * Run it after changing ANY emoji, the number of logos, the lattice, or the
 * rounds. Then paste the winning seed into SEED and its target index into
 * CLIENT_SLOT in public/interactive-set.js.
 *
 *   node tools/search-seed.mjs [maxSeed]
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
await import(path.join(here, '..', 'public', 'interactive-set.js'));
const { buildSet, verifySet, distance, BOX_W, BOX_H } = globalThis.InteractiveSet;

const maxSeed = Number(process.argv[2] || 300000);
const found = [];

for (let seed = 1; seed <= maxSeed; seed++) {
  const set = buildSet(seed);
  const report = verifySet(set);
  if (!report.ok || report.warnings.length) continue;

  // Converging is necessary, not sufficient. Most layouts that converge do it
  // the lazy way -- all five logos bunched in one corner, so of course
  // everybody's nearest logo is the same one. That reads as arranged from the
  // back of the room. These two numbers are what separate a layout that works
  // from one that also looks like an accident.
  const logos = set.items.filter((i) => i.kind === 'logo');
  const xs = logos.map((l) => l.x);
  const ys = logos.map((l) => l.y);
  const spanW = (Math.max(...xs) - Math.min(...xs)) / BOX_W;
  const spanH = (Math.max(...ys) - Math.min(...ys)) / BOX_H;
  // Closest pair: two logos almost touching read as one blob rather than as
  // two separate answers a spectator had to choose between.
  const minPair = Math.min(
    ...logos.flatMap((a, ai) => logos.slice(ai + 1).map((b) => distance(a, b)))
  );

  found.push({ seed, report, spread: Math.min(spanW, spanH), minPair, spanW, spanH });
}

// Rank on how the closing beat will actually look:
//   1. Logos spread across the field rather than huddled.
//   2. No two logos sitting on top of each other.
//   3. More survivors funnelling into the logo, so the last move is a real
//      convergence rather than a formality.
found.sort((a, b) =>
  (b.spread - a.spread) ||
  (b.minPair - a.minPair) ||
  (b.report.sizes[b.report.sizes.length - 2] - a.report.sizes[a.report.sizes.length - 2])
);

console.log(`searched ${maxSeed} seeds, ${found.length} converge cleanly\n`);
for (const f of found.slice(0, 15)) {
  console.log(
    `seed ${String(f.seed).padStart(7)}  ${f.report.sizes.join('->').padEnd(26)}` +
    `  CLIENT_SLOT ${String(f.report.targetIndex).padStart(2)}` +
    `  logospan ${(f.spanW * 100).toFixed(0)}%w x ${(f.spanH * 100).toFixed(0)}%h` +
    `  closest pair ${f.minPair.toFixed(2)}`
  );
}
console.log('\nPaste the chosen seed into SEED and its CLIENT_SLOT into');
console.log('public/interactive-set.js, then reload the host panel and check the badge.');
