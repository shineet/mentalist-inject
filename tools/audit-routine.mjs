/*
 * audit-routine.mjs — the pre-show check.
 *
 * verifySet() proves the room converges. This asks the two questions a
 * spectator actually experiences, which convergence alone does not answer:
 *
 *   1. Does every path, from every starting item, end on the reveal? Not the
 *      best path -- EVERY path, branching at every point where two candidates
 *      are close enough that a person could reasonably pick either.
 *
 *   2. At each step, is there more than one thing they could plausibly move to,
 *      with one clearly nearest? Only one candidate on screen makes the
 *      instruction feel forced. Two nearly equidistant makes it a coin flip,
 *      which is what broke a live performance -- the right answer was 6.8%
 *      nearer than the wrong one and Shine could not tell them apart.
 *
 * Reported by starting region, so "does it work if I start on the right" has an
 * answer rather than an assumption.
 *
 *   node tools/audit-routine.mjs
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
await import(path.join(here, '..', 'public', 'interactive-layout.js'));
await import(path.join(here, '..', 'public', 'interactive-set.js'));
const K = globalThis.InteractiveSet;

// A choice this tight is a coin flip on a phone screen. Anything below it gets
// reported; the routine's one real failure sat at 6.8%.
const TIGHT = 0.15;

// Walk the remaining rounds from a given item, always taking the nearest, and
// report where it ends up.
function finish(set, from, fromRound) {
  let cur = from;
  for (let i = fromRound; i < set.rounds.length; i++) {
    const opts = K.allowedTargets(set.items, set.rounds[i], cur);
    if (!opts.length) return '(stranded)';
    cur = opts.reduce((a, b) => (K.distance(cur, a) <= K.distance(cur, b) ? a : b));
  }
  return cur.label;
}

function auditSet(label, set) {
  const target = K.verifySet(set).target;
  console.log(`\n${'='.repeat(70)}\n${label}  —  ${set.items.length} items, reveal is ${target.label}\n${'='.repeat(70)}`);

  const regions = {
    'left half':   (i) => i.x < K.BOX_W / 2,
    'right half':  (i) => i.x >= K.BOX_W / 2,
    'top half':    (i) => i.y < K.BOX_H / 2,
    'bottom half': (i) => i.y >= K.BOX_H / 2,
  };

  let worstMargin = { pct: Infinity };
  let soleOption = [];
  let failures = [];
  let divergent = [];
  // How many things match each instruction, and how many a spectator actually
  // has to weigh up -- Shine's requirement is that there is always a real
  // choice, never a single obvious answer.
  const optionCounts = set.rounds.map(() => ({ min: Infinity, max: 0 }));
  const endsByRegion = {};
  for (const name of Object.keys(regions)) endsByRegion[name] = new Set();

  for (const start of set.items) {
    // Exhaustive walk: every branch a spectator could plausibly take.
    let frontier = new Set([start.id]);
    for (let ri = 0; ri < set.rounds.length; ri++) {
      const round = set.rounds[ri];
      const next = new Set();
      for (const id of frontier) {
        const from = set.items.find((i) => i.id === id);

        // How obvious was this choice, and was there a choice at all?
        const pool = set.items
          .filter((i) => K.matches(i, round.requires) && i.id !== from.id)
          .map((i) => ({ i, d: K.distance(from, i) }))
          .sort((a, b) => a.d - b.d);
        optionCounts[ri].min = Math.min(optionCounts[ri].min, pool.length);
        optionCounts[ri].max = Math.max(optionCounts[ri].max, pool.length);
        if (pool.length === 1) {
          soleOption.push(`${from.label} round ${ri + 1} (${round.key})`);
        } else if (pool.length > 1 && pool[0].d > 0) {
          const pct = (pool[1].d - pool[0].d) / pool[0].d;
          if (pct < worstMargin.pct) {
            worstMargin = { pct, from: from.label, round: ri + 1, key: round.key,
                            win: pool[0].i.label, runner: pool[1].i.label };
          }
          /* A tight call is only a PROBLEM if the two options lead somewhere
           * different. Two things equidistant that both end on the reveal are
           * harmless -- the spectator makes a free choice and it does not
           * matter, which is exactly what the routine wants. So each tight
           * call is followed through: finish the walk from the runner-up and
           * see whether it still lands on the reveal.
           */
          if (pct < TIGHT) {
            const endA = finish(set, pool[0].i, ri + 1);
            const endB = finish(set, pool[1].i, ri + 1);
            if (endA !== endB) {
              divergent.push(`${from.label} round ${ri + 1} (${round.key}): ` +
                `${pool[0].i.label} -> ${endA} but ${pool[1].i.label} -> ${endB}, ` +
                `only ${(pct * 100).toFixed(1)}% apart`);
            }
          }
        }

        K.allowedTargets(set.items, round, from).forEach((t) => next.add(t.id));
      }
      frontier = next;
    }

    const ends = [...frontier].map((id) => set.items.find((i) => i.id === id).label);
    if (ends.length !== 1 || ends[0] !== target.label) {
      failures.push(`${start.label} at ${start.x.toFixed(2)},${start.y.toFixed(2)} -> ${ends.join(' / ')}`);
    }
    for (const [name, test] of Object.entries(regions)) {
      if (test(start)) ends.forEach((e) => endsByRegion[name].add(e));
    }
  }

  for (const [name, ends] of Object.entries(endsByRegion)) {
    const list = [...ends];
    console.log(`  starting anywhere in the ${name.padEnd(12)} -> ${list.join(', ')}` +
      (list.length === 1 && list[0] === target.label ? '   OK' : '   *** SPLIT ***'));
  }

  console.log(`\n  every start, every branch: ${failures.length ? failures.length + ' FAIL' : 'all ' + set.items.length + ' end on ' + target.label}`);
  failures.slice(0, 8).forEach((f) => console.log(`     ${f}`));

  console.log(`  always a real choice: ${soleOption.length ? soleOption.length + ' cases with only ONE option' : 'yes, never a single option'}`);
  soleOption.slice(0, 5).forEach((c) => console.log(`     ${c}`));
  console.log('  options visible at each instruction:');
  set.rounds.forEach((r, i) => {
    const c = optionCounts[i];
    console.log(`     ${i + 1}. ${r.key.padEnd(7)} ${String(c.min).padStart(2)} to ${String(c.max).padStart(2)} candidates on screen`);
  });

  const w = worstMargin;
  console.log(`  tightest call anywhere: ${(w.pct * 100).toFixed(1)}%  ` +
    `(from ${w.from}, round ${w.round} ${w.key}: ${w.win} beats ${w.runner})`);
  console.log(`  do any tight calls change the ending? ` +
    (divergent.length ? `${divergent.length} DO` : 'no — every close call leads to the same reveal'));
  divergent.slice(0, 8).forEach((d) => console.log(`     ${d}`));

  return failures.length === 0 && soleOption.length === 0 && divergent.length === 0;
}

const okEmoji = auditSet('EMOJI SET (no client logo)', K.EMOJI_SET);
const okLogo = auditSet('LOGO SET (client logo configured)', K.LOGO_SET);
console.log(`\n${okEmoji && okLogo ? 'BOTH SETS PASS' : 'ISSUES ABOVE — read them before performing'}\n`);
