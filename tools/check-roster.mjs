/*
 * check-roster.mjs — run this after changing the ROSTER.
 *
 * The layout is frozen, so swapping pictures cannot move anything and cannot
 * break the convergence. What it CAN break is honesty: a picture that answers
 * an instruction it was not meant to. Every failure this routine has had in
 * performance came from exactly that -- a "sparkle" that draws green, a shape
 * that reads as a ball you could pick up, a decoy that did not read as a logo.
 *
 * So this checks the things a swap can actually get wrong: enough pictures for
 * the slots, no repeats, nothing appearing in two lists that would make it
 * answer two rounds, and it prints what the show will reveal.
 *
 * It cannot check the one thing that matters most -- whether a spectator reads
 * a picture the way the list claims. Look at the field before performing.
 *
 *   node tools/check-roster.mjs
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
await import(path.join(here, '..', 'public', 'interactive-layout.js'));
await import(path.join(here, '..', 'public', 'interactive-set.js'));
const K = globalThis.InteractiveSet;
const L = globalThis.InteractiveLayout;

let problems = 0;

for (const [name, which, set] of [['EMOJI (no client logo)', 'emoji', K.EMOJI_SET],
                                  ['LOGO (client logo)', 'logo', K.LOGO_SET]]) {
  console.log(`\n=== ${name} ===`);

  // Are there enough pictures for the slots that need them?
  const need = {};
  L[which].slots.forEach(([, , , sig]) => { need[sig] = (need[sig] || 0) + 1; });
  for (const [sig, count] of Object.entries(need)) {
    if (sig === 'logo') continue;
    const listName = { 'face+animal': 'faceAnimal', 'face': 'faceOnly',
      'face+animal+green': 'faceAnimalGreen', 'green': 'green', 'food': 'food',
      'thing': 'thing', 'filler': 'filler' }[sig];
    const have = (K.ROSTER[listName] || []).length;
    const short = have < count;
    if (short) problems++;
    console.log(`  ${listName.padEnd(16)} needs ${String(count).padStart(2)}, has ${String(have).padStart(2)}` +
      (short ? `   SHORT — ${count - have} slot(s) will repeat a picture` : ''));
  }

  // The same picture in two lists would answer two rounds.
  const seen = new Map();
  for (const [listName, list] of Object.entries(K.ROSTER)) {
    for (const e of list) {
      if (seen.has(e) && seen.get(e) !== listName) {
        console.log(`  ${e} is in both ${seen.get(e)} and ${listName} — it would answer both rounds`);
        problems++;
      }
      seen.set(e, listName);
    }
  }

  const r = K.verifySet(set);
  console.log(`  converges: ${r.ok ? 'yes' : 'NO — ' + r.problems.join(' | ')}`);
  if (!r.ok) problems++;
  console.log(`  THE SHOW REVEALS: ${set.wantsLogos ? 'the client logo' : r.target.label}`);
}

console.log(`\n${problems ? problems + ' problem(s) above' : 'Roster OK. Look at the field before performing — no tool can check whether a picture reads the way its list claims.'}\n`);
