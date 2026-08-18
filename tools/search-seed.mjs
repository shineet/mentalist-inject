/*
 * search-seed.mjs — finds layouts the routine actually converges on.
 *
 * Every round is relational ("move to the nearest X"), which means the
 * instructions guarantee nothing on their own: the SCATTER decides whether the
 * room ends on one thing or five. Only a small fraction of layouts converge,
 * and there is no way to reason your way to a good one, so this brute-forces
 * the seed space for both sets and reports the candidates that pass.
 *
 * Run it after changing ANY emoji, the number of logos, a lattice, or the
 * rounds. Then paste the winning seeds back into EMOJI_CONFIG / LOGO_CONFIG in
 * public/interactive-set.js, and the logo set's target index into CLIENT_SLOT.
 *
 * Filler is irrelevant here by construction -- it matches no rule, so it cannot
 * appear in any reachable set. It is packed into the built sets anyway so the
 * item counts printed below match what the room will actually see.
 *
 *   node tools/search-seed.mjs [maxSeed]
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
await import(path.join(here, '..', 'public', 'interactive-set.js'));
const K = globalThis.InteractiveSet;
const { buildSet, verifySet, distance, BOX_W, BOX_H, EMOJI_CONFIG, LOGO_CONFIG } = K;

const maxSeed = Number(process.argv[2] || 200000);

function search(config, label) {
  const found = [];

  for (let seed = 1; seed <= maxSeed; seed++) {
    const set = buildSet({ ...config, seed });
    const report = verifySet(set);
    if (!report.ok || report.warnings.length) continue;

    // How much misjudgement the layout survives. This, not target spread, is
    // the thing to maximise: the routine's one real-world failure was a
    // closing move where the right answer was only 6.8% nearer than the wrong
    // one, on a layout that had been chosen for how well its targets spread.
    let holds = 0;
    for (let t = 0.05; t <= 0.60; t += 0.01) {
      K.setTolerance(t);
      if (verifySet(buildSet({ ...config, seed })).ok) holds = t; else break;
    }
    K.setTolerance(0.18);
    report.holds = holds;

    const entry = { seed, report, spread: 1, minPair: 1 };

    if (config.wantsLogos) {
      // Converging is necessary, not sufficient. Most layouts that converge do
      // it the lazy way -- all five logos bunched in one corner, so of course
      // everybody's nearest logo is the same one. That reads as arranged from
      // the back of the room.
      const logos = set.items.filter((i) => i.kind === 'logo');
      const xs = logos.map((l) => l.x);
      const ys = logos.map((l) => l.y);
      entry.spanW = (Math.max(...xs) - Math.min(...xs)) / BOX_W;
      entry.spanH = (Math.max(...ys) - Math.min(...ys)) / BOX_H;
      entry.spread = Math.min(entry.spanW, entry.spanH);
      entry.minPair = Math.min(
        ...logos.flatMap((a, ai) => logos.slice(ai + 1).map((b) => distance(a, b)))
      );
    } else {
      // Same idea for the green finish: the greens must be spread, or the
      // closing instruction is a short hop nobody had to think about.
      const greens = set.items.filter((i) => i.tags.includes('green'));
      const xs = greens.map((l) => l.x);
      const ys = greens.map((l) => l.y);
      entry.spanW = (Math.max(...xs) - Math.min(...xs)) / BOX_W;
      entry.spanH = (Math.max(...ys) - Math.min(...ys)) / BOX_H;
      entry.spread = Math.min(entry.spanW, entry.spanH);
      entry.minPair = Math.min(
        ...greens.flatMap((a, ai) => greens.slice(ai + 1).map((b) => distance(a, b)))
      );
    }

    entry.total = set.items.length;
    found.push(entry);
  }

  // Rank on how the closing beat will actually look:
  //   1. Targets spread across the field rather than huddled.
  //   2. No two of them sitting on top of each other.
  //   3. More survivors funnelling in, so the last move is a real convergence
  //      rather than a formality.
  found.sort((a, b) =>
    (b.report.holds - a.report.holds) ||
    (b.spread - a.spread) ||
    (b.minPair - a.minPair) ||
    (b.report.sizes[b.report.sizes.length - 2] - a.report.sizes[a.report.sizes.length - 2])
  );

  console.log(`\n=== ${label} — ${found.length} of ${maxSeed} seeds converge cleanly ===`);
  for (const f of found.slice(0, 10)) {
    console.log(
      `seed ${String(f.seed).padStart(7)}  ${f.report.sizes.join('->').padEnd(24)}` +
      `  ends on ${String(f.report.target.label).padEnd(6)} idx ${String(f.report.targetIndex).padStart(2)}` +
      `  holds to ${(f.report.holds * 100).toFixed(0)}%` +
      `  span ${(f.spanW * 100).toFixed(0)}x${(f.spanH * 100).toFixed(0)}%` +
      `  closest ${f.minPair.toFixed(2)}  on screen ${f.total}`
    );
  }
  return found;
}

search(EMOJI_CONFIG, 'EMOJI SET (green finish)');
search(LOGO_CONFIG, 'LOGO SET (logo finish)');

console.log('\nPaste the chosen seeds into EMOJI_CONFIG / LOGO_CONFIG, and the');
console.log('logo set\'s target index into CLIENT_SLOT, then reload the host panel.');
