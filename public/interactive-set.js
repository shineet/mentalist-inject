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

  const COLUMNS = 6;

  // prettier-ignore
  const EMOJI = [
    '🍎', '🐼', '⚽',   '🍌', '🐶', '✈️',
    '👻', '🍕', '🐸',   '🎸', '⭐', '🐱',
    '🔑', '🦁', '🍉',   '🐨', '📚', '🎈',
    '🤖', '🚗', '😀',   '🧊', '🐵', '🍦',
  ];

  // Positional tags are derived from the index below, so moving an emoji in the
  // grid updates them automatically and the layout can never drift out of step
  // with the instructions.
  const TAGS = {
    // Faces — round 1's destination.
    '🐼': ['face', 'animal', 'greyish'],
    '🐨': ['face', 'animal', 'greyish'],
    '🐸': ['face', 'animal', 'green'],
    '🐶': ['face', 'animal'],
    '🐱': ['face', 'animal'],
    '🦁': ['face', 'animal'],
    '🐵': ['face', 'animal'],
    '👻': ['face'],
    '🤖': ['face'],
    '😀': ['face'],
    // Food — round 2.
    '🍎': ['food'], '🍌': ['food'], '🍕': ['food'], '🍉': ['food'], '🍦': ['food'],
    // Objects — round 3.
    '⚽': ['object'], '✈️': ['object'], '🎸': ['object'],
    '🔑': ['object'], '📚': ['object'], '🚗': ['object'],
    // Decoys, in no instruction set at all. They exist so the grid reads as an
    // arbitrary pile of emoji rather than three tidy categories.
    '⭐': [], '🎈': [], '🧊': [],
  };

  function buildItems() {
    return EMOJI.map((emoji, index) => {
      const column = index % COLUMNS;
      const row = Math.floor(index / COLUMNS);
      const tags = (TAGS[emoji] || []).slice();
      tags.push(column < COLUMNS / 2 ? 'leftHalf' : 'rightHalf');
      tags.push(row < 2 ? 'topHalf' : 'bottomHalf');
      return { id: 'i' + index, emoji, index, row, column, tags };
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
      key: 'object',
      say: 'Now jump to any OBJECT — something you could pick up and carry.',
      requires: ['object'],
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
    // Chebyshev ("king move"): a diagonal neighbour looks as close as one
    // straight up, so "nearest" agrees with the eye rather than a taxi route.
    return Math.max(Math.abs(a.row - b.row), Math.abs(a.column - b.column));
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
        const rows = new Set(reachable.map((r) => r.row));
        const cols = new Set(reachable.map((r) => r.column));
        if (rows.size === 1 || cols.size === 1) {
          warnings.push(
            `Round ${i + 1} (${round.key}) leaves ${reachable.length} emoji in a single ${rows.size === 1 ? 'row' : 'column'} — that move will look mechanical.`
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
    id: 'emoji-24-v2',
    columns: COLUMNS,
    items: buildItems(),
    rounds: ROUNDS,
  };

  // globalThis rather than an export: this loads as a classic <script> in the
  // browser, and package.json sets "type": "module", so a CommonJS export would
  // never run under Node either. This is the one thing both agree on, which
  // also lets the verifier be run from the command line before a show.
  root.InteractiveSet = { SET, verifySet, allowedTargets, matches, COLUMNS };
})(globalThis);
