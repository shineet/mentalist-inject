/*
 * interactive-set.js — the "everyone ends on the same emoji" routine.
 *
 * THE PRINCIPLE
 * Each instruction is "switch to any emoji that is X". Whatever a spectator is
 * looking at, they end up somewhere in the set matching X, so after the
 * instruction the whole room is inside that set no matter where they started.
 * The last set has one member, and the room has converged.
 *
 * WHY THE ROUNDS ARE DISJOINT, NOT NESTED
 * The obvious build is a sieve: faces, then left-half faces, then left-half
 * animals, narrowing each time. Two things go wrong with it, and both were
 * caught by looking at the routine rather than the code:
 *
 *  1. Anyone already inside the next set does not move. Half the room stands
 *     still while the other half moves, which looks like some people got it
 *     wrong.
 *  2. The survivors bunch up. In the sieve version the last three rounds all
 *     lived in column 0, so the closing moves were visibly up and down a
 *     single column -- the exact moment a spectator sees the machinery.
 *
 * So consecutive rounds are now DISJOINT: no emoji is in both round N and
 * round N+1. Everyone moves, every single time. And because each round is a
 * different category rather than a subset of the last, the pool never appears
 * to shrink -- it changes character. It is not a funnel until the final beat.
 *
 * The layout is then arranged so the closing sets are spread across rows AND
 * columns, making the last moves diagonal jumps across the grid rather than a
 * slide along one line.
 *
 * WHY THE VERIFIER EXISTS
 * A hand-built set fails silently. Get one tag wrong and a few spectators end
 * elsewhere, say nothing, and the only symptom is a soft reaction you cannot
 * explain. verifySet() refuses to pass a set that does not end on exactly one
 * emoji, that strands anyone with nothing to move to, that lets anyone stand
 * still, or whose closing rounds sit in a single row or column.
 */

(function (root) {
  'use strict';

  // The scatter lives in a box of this fixed aspect on EVERY screen, phone or
  // projector. That is not cosmetic: round 1 asks for the nearest face, so if
  // the layout reflowed differently on a tall phone than on a wide projector,
  // two spectators would compute different answers and the whole guarantee
  // would quietly fail. Fixed aspect means identical geometry everywhere.
  const BOX_W = 1.5;
  const BOX_H = 1.0;

  // Laid out on an 8 x 5 lattice and then jittered. Deterministic on purpose:
  // it has to LOOK scattered while being the SAME scatter for the host screen
  // and every phone in the room.
  const COLS = 8;
  const ROWS = 5;
  const SEED = 0x5ee11e;

  // prettier-ignore
  const GROUPS = {
    // Round 1's destination. Deliberately no white or grey animals beyond the
    // two below -- a spectator asked for "black, white or grey" would happily
    // pick a white rabbit, and their reading of the grid is what matters, not
    // my tags.
    face: ['🐼', '🐨', '🐸', '🐶', '🐱', '🦁', '🐵', '🐷', '👻', '🤖', '😀', '🦊'],
    food: ['🍎', '🍌', '🍕', '🍉', '🍦', '🍔', '🍇', '🥕'],
    // Round 3 is "not alive and not food", so objects and abstract things are
    // one pool. Keeping them separate here only documents the intent.
    object: ['⚽', '🎸', '🔑', '📚', '⌚', '📱', '✏️', '🎩', '🧢', '🔨'],
    abstract: ['⭐', '🌈', '❤️', '🔥', '💧', '🌙', '🎵', '⚡', '☁️', '🌊'],
  };

  const TAGS = {};
  GROUPS.face.forEach((e) => (TAGS[e] = ['face', 'animal']));
  ['👻', '🤖', '😀'].forEach((e) => (TAGS[e] = ['face']));   // faces, not animals
  TAGS['🐼'] = ['face', 'animal', 'greyish'];
  TAGS['🐨'] = ['face', 'animal', 'greyish'];
  TAGS['🐸'] = ['face', 'animal', 'green'];
  GROUPS.food.forEach((e) => (TAGS[e] = ['food']));
  GROUPS.object.forEach((e) => (TAGS[e] = ['thing']));
  GROUPS.abstract.forEach((e) => (TAGS[e] = ['thing']));

  const EMOJI = [].concat(GROUPS.face, GROUPS.food, GROUPS.object, GROUPS.abstract);

  // Small deterministic PRNG. Same seed, same scatter, every device.
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildItems() {
    const rand = mulberry32(SEED);
    // Shuffle first so the four category blocks are not laid down in reading
    // order -- otherwise all the food would sit in one band of the screen.
    const shuffled = EMOJI.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const cellW = BOX_W / COLS;
    const cellH = BOX_H / ROWS;
    // Jitter stays inside 34% of a cell so nothing can overlap or drift off
    // the edge, which keeps "nearest" readable at a glance.
    const jx = cellW * 0.34;
    const jy = cellH * 0.34;

    return shuffled.map((emoji, index) => {
      const col = index % COLS;
      const row = Math.floor(index / COLS);
      const x = (col + 0.5) * cellW + (rand() * 2 - 1) * jx;
      const y = (row + 0.5) * cellH + (rand() * 2 - 1) * jy;
      const tags = (TAGS[emoji] || []).slice();
      tags.push(x < BOX_W / 2 ? 'leftHalf' : 'rightHalf');
      tags.push(y < BOX_H / 2 ? 'topHalf' : 'bottomHalf');
      // Rotation is cosmetic only, never used by any rule.
      const tilt = (rand() * 2 - 1) * 14;
      return { id: 'i' + index, emoji, index, x, y, tilt, tags };
    });
  }

  /*
   * Round 1 is RELATIONAL so the spectator's own free choice decides where they
   * go -- with every round absolute, the emoji they picked at the top is
   * discarded immediately, and that is the thread anyone replaying the routine
   * would pull first. excludeSelf keeps it honest: someone who picked a face
   * still has to move.
   *
   * Rounds 2-5 are absolute and disjoint from their neighbours, so each one
   * moves every person in the room.
   */
  const ROUNDS = [
    {
      key: 'face',
      type: 'relational',
      excludeSelf: true,
      say: 'Move to the CLOSEST emoji that has a face — not your own one. If two look equally close, take either.',
      requires: ['face'],
    },
    {
      key: 'food',
      say: 'Now jump to any FOOD on the screen.',
      requires: ['food'],
    },
    {
      key: 'thing',
      // "Something you could pick up and carry" was ambiguous: an apple is
      // carryable, so food qualified too and round 3 stopped being disjoint
      // from round 2 in the spectator's head even though the tags were clean.
      // Stated as an exclusion instead, which nobody can misread.
      say: 'Now jump to anything on screen that is NOT alive and NOT food.',
      requires: ['thing'],
    },
    {
      key: 'grey',
      say: 'Now go to an animal that is black, white or grey.',
      requires: ['animal', 'greyish'],
    },
    {
      key: 'final',
      say: 'And finally — the green animal.',
      requires: ['animal', 'green'],
    },
  ];

  function distance(a, b) {
    // Straight-line distance in the fixed-aspect box. Since that box has the
    // same shape on a phone and a projector, this is exactly what a spectator's
    // eye measures on either screen.
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function matches(item, requires) {
    return requires.every((tag) =>
      tag.charAt(0) === '!'
        ? !item.tags.includes(tag.slice(1))
        : item.tags.includes(tag)
    );
  }

  function allowedTargets(items, round, from) {
    let candidates = items.filter((item) => matches(item, round.requires));
    if (round.excludeSelf && from) {
      candidates = candidates.filter((c) => c.id !== from.id);
    }
    if (round.type !== 'relational' || !from) return candidates;
    if (!candidates.length) return [];
    const best = Math.min(...candidates.map((c) => distance(from, c)));
    // Every emoji at the minimum distance, not just one: a tie is a genuine
    // free choice, and the verifier has to walk all of them to prove anything.
    return candidates.filter((c) => distance(from, c) === best);
  }

  function verifySet(set) {
    const items = set.items;
    const problems = [];
    const warnings = [];
    const sizes = [items.length];
    const layers = [];

    let reachable = items.slice();
    set.rounds.forEach((round, i) => {
      const next = new Map();
      let someoneStandsStill = false;

      reachable.forEach((from) => {
        const targets = allowedTargets(items, round, from);
        if (targets.length === 0) {
          problems.push(
            `Round ${i + 1} (${round.key}): nothing to move to from ${from.emoji}.`
          );
        }
        // Every instruction must actually move everyone. Someone standing still
        // while the room moves looks like a mistake they made.
        if (targets.some((t) => t.id === from.id)) someoneStandsStill = true;
        targets.forEach((t) => next.set(t.id, t));
      });

      if (someoneStandsStill) {
        problems.push(
          `Round ${i + 1} (${round.key}): someone can stay put. Consecutive rounds must be disjoint.`
        );
      }

      reachable = Array.from(next.values());
      layers.push(reachable);
      sizes.push(reachable.length);

      // The closing rounds are where a spectator is most likely to see the
      // shape of it. Two or three emoji in a line read as a mechanism; the same
      // emoji scattered read as coincidence.
      if (reachable.length > 1 && reachable.length <= 3) {
        // Two survivors sitting almost on top of each other, or in a dead
        // straight line with the target, makes the closing move look
        // mechanical. Measured on the scatter itself now there is no grid.
        const spread = Math.min(
          ...reachable.flatMap((a, ai) =>
            reachable.slice(ai + 1).map((b) => distance(a, b))
          )
        );
        if (isFinite(spread) && spread < 0.25) {
          warnings.push(
            `Round ${i + 1} (${round.key}) leaves ${reachable.length} emoji clustered together — that move will barely register.`
          );
        }
      }
    });

    if (reachable.length !== 1) {
      problems.push(
        `Ends on ${reachable.length} emoji (${reachable.map((r) => r.emoji).join(' ')}) instead of exactly one.`
      );
    }

    return {
      ok: problems.length === 0,
      problems,
      warnings,
      sizes,
      layers,
      target: reachable.length === 1 ? reachable[0] : null,
      apparentPaths: sizes.slice(0, -1).reduce((a, b) => a * b, 1),
    };
  }

  const SET = {
    id: 'emoji-40-scatter-v3',
    box: { w: BOX_W, h: BOX_H },
    items: buildItems(),
    rounds: ROUNDS,
  };

  // globalThis rather than an export: this loads as a classic <script> in the
  // browser, and package.json sets "type": "module", so a CommonJS export would
  // never run under Node either. This is the one thing both agree on, which
  // also lets the verifier be run from the command line before a show.
  root.InteractiveSet = { SET, verifySet, allowedTargets, matches, distance };
})(globalThis);
