/*
 * nudge-slot.mjs — move ONE frozen slot and re-prove the whole routine.
 *
 * The layout is frozen because finding it cost roughly one seed in 40,000.
 * That makes it expensive to regenerate but it does not make it untouchable:
 * sometimes a single item needs to move and everything else should stay
 * exactly where it is. Re-running the seed search would move all 61.
 *
 * Why this exists: Shine's daughter landed on the turtle, was told to move to
 * the nearest green thing, and picked the frog instead of the clover. The
 * clover was genuinely 30% nearer -- comfortably outside the 18% tolerance --
 * so the geometry was never in question. A big vividly green frog simply
 * outpulled a smaller clover. Numbers cannot see that, so the answer is to buy
 * margin: push the frog far enough that the choice stops being close ENOUGH TO
 * LOOK close, not merely far enough to be provably right.
 *
 * What it does: grid-searches every position the slot could occupy, keeps only
 * the ones where the routine still passes everything it passed before, and
 * ranks by the margin at the closing instruction -- which is the beat that
 * fails in the room, because it is the only one where being wrong is visible.
 *
 *   node tools/nudge-slot.mjs 🐸           # search positions for the frog
 *   node tools/nudge-slot.mjs 🐸 --apply   # and rewrite interactive-layout.js
 */
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const LAYOUT_PATH = path.join(here, '..', 'public', 'interactive-layout.js');
await import(LAYOUT_PATH);
await import(path.join(here, '..', 'public', 'interactive-set.js'));
const K = globalThis.InteractiveSet;
const L = globalThis.InteractiveLayout;

const wanted = process.argv[2];
const APPLY = process.argv.includes('--apply');
if (!wanted) {
  console.error('usage: node tools/nudge-slot.mjs <emoji> [--apply]');
  process.exit(1);
}

// Keep items off the very edge. The field is inset when drawn, so an item at
// 0 or BOX_W sits half off the screen.
const EDGE = 0.06;
const PACK = K.PACK;
// Two of the same category touching reads as a pair and muddies the choice
// between them, so they are held further apart than mixed neighbours. Same
// rule the original search used.
const SAME_CATEGORY_PACK = PACK * 1.5;
// interactive-layout.js stores coordinates to 4 decimals, and relax() pushes
// pairs to EXACTLY the minimum, so the frozen layout sits a hair under its own
// rule -- the closest mixed pair is 0.117965 against a PACK of 0.118. Without
// this slack the search rejects the position the layout is already using.
// 0.001 box units is about half a pixel on a phone.
const SLACK = 0.001;

const baseline = K.buildSet(K.EMOJI_CONFIG);
const slotIndex = baseline.items.findIndex((i) => i.label === wanted);
if (slotIndex < 0) {
  console.error(`no slot holds ${wanted}. Items: ${[...new Set(baseline.items.map((i) => i.label))].join(' ')}`);
  process.exit(1);
}
const originalSlot = L.emoji.slots[slotIndex].slice();

/* Everything the layout has to keep being true.
 *
 * Returned as a report rather than a boolean so a rejected candidate can say
 * WHY, which is the difference between "no position works" and "my search box
 * was too small".
 */
function evaluate() {
  const set = K.buildSet(K.EMOJI_CONFIG);
  const report = K.verifySet(set);
  if (!report.ok || report.warnings.length) {
    return { ok: false, why: 'verifySet: ' + (report.warnings.join('; ') || 'did not converge') };
  }

  const moved = set.items[slotIndex];

  // Spacing. Only the moved item can newly collide, so only it is checked.
  for (const other of set.items) {
    if (other === moved) continue;
    const d = K.distance(moved, other);
    const sameCat = other.tags.some((t) => moved.tags.includes(t) &&
      ['green', 'food', 'thing', 'face', 'animal'].includes(t));
    if (d < (sameCat ? SAME_CATEGORY_PACK : PACK) - SLACK) {
      return { ok: false, why: `too close to ${other.label} (${d.toFixed(3)})` };
    }
  }

  // Both sides of the screen must answer every instruction, or an instruction
  // drags the whole room one way. This is a search criterion, not something
  // construction guarantees.
  for (const round of set.rounds) {
    const hits = set.items.filter((i) => K.matches(i, round.requires));
    const left = hits.filter((i) => i.x < K.BOX_W / 2).length;
    if (left < 2 || hits.length - left < 2) {
      return { ok: false, why: `round ${round.key} unbalanced (${left} left, ${hits.length - left} right)` };
    }
  }

  // Exhaustive branch walk, identical in standard to audit-routine.mjs: from
  // every start, following every plausible branch, everyone ends on the reveal.
  let worstOverall = Infinity, worstFinal = Infinity;
  let worstFinalFrom = null, worstOverallWhere = null;
  const lastRound = set.rounds.length - 1;

  /* How temptingly close the MOVED item ever is at the closing instruction.
   *
   * The global worst closing margin cannot rank these candidates: on this
   * layout it comes from 🦁 weighing 🍀 against 🌴, which the frog's position
   * does not affect at all. What went wrong in the room was specific -- the
   * frog was the runner-up and got picked anyway -- so that is what to score.
   *
   * For every item that has to choose at the finish, and where the moved item
   * is NOT the right answer, this measures how far behind it sits. The
   * minimum over all of them is the layout's most temptable moment, and
   * pushing that number up is the whole point of the exercise.
   */
  let worstLure = Infinity, worstLureFrom = null;

  for (const start of set.items) {
    let frontier = new Set([start.id]);
    for (let ri = 0; ri < set.rounds.length; ri++) {
      const round = set.rounds[ri];
      const next = new Set();
      for (const id of frontier) {
        const from = set.items.find((i) => i.id === id);
        const pool = set.items
          .filter((i) => K.matches(i, round.requires) && i.id !== from.id)
          .map((i) => ({ i, d: K.distance(from, i) }))
          .sort((a, b) => a.d - b.d);
        if (pool.length < 2) return { ok: false, why: `${from.label} has ${pool.length} option(s) at ${round.key}` };
        const pct = (pool[1].d - pool[0].d) / pool[0].d;
        if (pct < worstOverall) {
          worstOverall = pct;
          worstOverallWhere = `${from.label} r${ri + 1} ${round.key}: ${pool[0].i.label} over ${pool[1].i.label}`;
        }
        // The closing instruction is scored separately. It is the one the room
        // watches, and the only one where picking wrong is visible.
        if (ri === lastRound && pct < worstFinal) {
          worstFinal = pct;
          worstFinalFrom = `${from.label}: ${pool[0].i.label} over ${pool[1].i.label}`;
        }
        if (ri === lastRound && from.id !== moved.id && pool[0].i.id !== moved.id) {
          const lure = pool.find((p) => p.i.id === moved.id);
          if (lure) {
            const gap = (lure.d - pool[0].d) / pool[0].d;
            if (gap < worstLure) {
              worstLure = gap;
              worstLureFrom = `${from.label}: ${pool[0].i.label} beats ${moved.label}`;
            }
          }
        }
        K.allowedTargets(set.items, round, from).forEach((t) => next.add(t.id));
      }
      frontier = next;
    }
    const ends = [...frontier].map((id) => set.items.find((i) => i.id === id).label);
    if (ends.length !== 1 || ends[0] !== report.target.label) {
      return { ok: false, why: `${start.label} ends on ${ends.join('/')}` };
    }
  }

  return { ok: true, target: report.target.label, worstOverall, worstFinal, worstFinalFrom, worstOverallWhere,
           worstLure, worstLureFrom };
}

// ── Baseline ────────────────────────────────────────────────────────────────
const before = evaluate();
console.log(`Slot ${slotIndex} holds ${wanted}, signature '${originalSlot[3]}'`);
console.log(`Currently at x=${originalSlot[0].toFixed(4)} y=${originalSlot[1].toFixed(4)}\n`);
if (!before.ok) {
  console.log(`The layout does not currently pass: ${before.why}`);
  process.exit(1);
}
console.log('BEFORE');
console.log(`  reveal ......................... ${before.target}`);
console.log(`  worst margin, closing round .... ${(before.worstFinal * 100).toFixed(1)}%   (${before.worstFinalFrom})`);
console.log(`  worst margin, any round ........ ${(before.worstOverall * 100).toFixed(1)}%   (${before.worstOverallWhere})`);
console.log(`  closest ${wanted} ever is at the finish ... ${(before.worstLure * 100).toFixed(1)}%   (${before.worstLureFrom})`);

// ── Search ──────────────────────────────────────────────────────────────────
const STEP = 0.02;
const found = [];
let rejected = 0;
const reasons = {};

for (let x = EDGE; x <= K.BOX_W - EDGE + 1e-9; x += STEP) {
  for (let y = EDGE; y <= K.BOX_H - EDGE + 1e-9; y += STEP) {
    L.emoji.slots[slotIndex] = [Number(x.toFixed(4)), Number(y.toFixed(4)), originalSlot[2], originalSlot[3]];
    const r = evaluate();
    if (!r.ok) {
      rejected++;
      const kind = r.why.split(/[:(]/)[0].trim();
      reasons[kind] = (reasons[kind] || 0) + 1;
      continue;
    }
    found.push({ x, y, ...r });
  }
}
L.emoji.slots[slotIndex] = originalSlot;

// Rank on the closing margin first -- that is the beat that failed in the room.
// Overall margin breaks ties, so a candidate does not buy the finish by making
// an earlier round a coin flip.
// Rank by how far the moved item sits behind the right answer at the finish,
// then by the ordinary closing margin so a candidate cannot buy its lure by
// making some other pair of greens a coin flip.
found.sort((a, b) => (b.worstLure - a.worstLure) || (b.worstFinal - a.worstFinal) || (b.worstOverall - a.worstOverall));

console.log(`\nSearched ${found.length + rejected} positions: ${found.length} valid, ${rejected} rejected`);
Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 6)
  .forEach(([why, n]) => console.log(`   ${String(n).padStart(5)}  ${why}`));

if (!found.length) {
  console.log('\nNo position works. Widen the search or accept the current one.');
  process.exit(1);
}

console.log('\nBest positions (closing margin first):');
found.slice(0, 10).forEach((f, n) => {
  console.log(`  ${n === 0 ? '->' : '  '} x=${f.x.toFixed(3)} y=${f.y.toFixed(3)}  ` +
    `${wanted}-lure ${(f.worstLure * 100).toFixed(1)}%  closing ${(f.worstFinal * 100).toFixed(1)}%  ` +
    `any-round ${(f.worstOverall * 100).toFixed(1)}%  ${f.worstLureFrom}`);
});

const best = found[0];
console.log(`\nAFTER (best)`);
console.log(`  worst margin, closing round .... ${(before.worstFinal * 100).toFixed(1)}% -> ${(best.worstFinal * 100).toFixed(1)}%`);
console.log(`  worst margin, any round ........ ${(before.worstOverall * 100).toFixed(1)}% -> ${(best.worstOverall * 100).toFixed(1)}%`);
console.log(`  closest ${wanted} ever is at finish  .... ${(before.worstLure * 100).toFixed(1)}% -> ${(best.worstLure * 100).toFixed(1)}%   (${best.worstLureFrom})`);

if (!APPLY) {
  console.log('\nNothing written. Re-run with --apply to move the slot.');
  process.exit(0);
}

const src = fs.readFileSync(LAYOUT_PATH, 'utf8');
const oldLine = `    [${originalSlot[0].toFixed(4)}, ${originalSlot[1].toFixed(4)}, ${originalSlot[2].toFixed(1)}, '${originalSlot[3]}'],`;
const newLine = `    [${best.x.toFixed(4)}, ${best.y.toFixed(4)}, ${originalSlot[2].toFixed(1)}, '${originalSlot[3]}'],`;
if (!src.includes(oldLine)) {
  console.error(`\nCould not find the slot line to replace:\n  ${oldLine}`);
  process.exit(1);
}
fs.writeFileSync(LAYOUT_PATH, src.replace(oldLine, newLine));
console.log(`\nWrote ${path.relative(process.cwd(), LAYOUT_PATH)}`);
console.log(`  ${oldLine.trim()}\n  ${newLine.trim()}`);
console.log('\nNow run: node tools/audit-routine.mjs');
