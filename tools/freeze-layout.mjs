import path from 'node:path';
import fs from 'node:fs';
await import(path.resolve('public/interactive-set.js'));
const K = globalThis.InteractiveSet;

const sig = (i) => i.kind === 'filler' ? 'filler'
  : i.kind === 'logo' ? 'logo'
  : ['face', 'animal', 'food', 'thing', 'green'].filter(t => i.tags.includes(t)).join('+') || 'none';

const dump = (set) => set.items.map(i =>
  `    [${i.x.toFixed(4)}, ${i.y.toFixed(4)}, ${(i.tilt||0).toFixed(1)}, '${sig(i)}'],`).join('\n');

const targetOf = (set) => {
  const r = K.verifySet(set);
  return set.items.findIndex(i => i.id === r.target.id);
};

const out = `/*
 * interactive-layout.js — the frozen positions.
 *
 * GENERATED, and deliberately so. Every position here was found by a seed
 * search and then proved: from every starting item, along every branch a
 * spectator could plausibly take, the room ends on one thing. That proof cost
 * roughly one seed in 40,000 once the constraints were stacked up, so the
 * positions are now fixed rather than regenerated.
 *
 * WHAT THIS BUYS: the convergence depends only on WHERE things are and WHICH
 * CATEGORY sits at each spot -- never on which particular picture. So any emoji
 * can be swapped for another emoji of the same signature with no search, no
 * risk, and no possibility of breaking the routine. A different set of images
 * makes a different show that reveals a different thing.
 *
 * The signature is the full tag set, not a single category, and it has to match
 * exactly. 🐶 is 'face+animal' and can be replaced by any other animal with a
 * face; 👻 is 'face' alone and cannot, because swapping it would change which
 * items answer the animal round.
 *
 * Edit the ROSTER in interactive-set.js, not this file. Regenerate this only
 * after a new seed search, with tools/freeze-layout.mjs.
 *
 * Generated ${new Date().toISOString().slice(0, 10)}.
 */
(function (root) {
  'use strict';

  root.InteractiveLayout = {
    emoji: {
      // reveal lands on slot ${targetOf(K.EMOJI_SET)}
      target: ${targetOf(K.EMOJI_SET)},
      slots: [
${dump(K.EMOJI_SET)}
      ],
    },
    logo: {
      // reveal lands on slot ${targetOf(K.LOGO_SET)}
      target: ${targetOf(K.LOGO_SET)},
      slots: [
${dump(K.LOGO_SET)}
      ],
    },
  };
})(globalThis);
`;
fs.writeFileSync('public/interactive-layout.js', out);
console.log('wrote public/interactive-layout.js');
console.log('emoji target slot', targetOf(K.EMOJI_SET), ' logo target slot', targetOf(K.LOGO_SET));
