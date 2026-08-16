/*
 * interactive-set.js — the "everyone ends on the same emoji" routine.
 *
 * THE PRINCIPLE
 * Each instruction is "switch to any emoji that is X". Whatever a spectator is
 * looking at, they end up somewhere in the set of items matching X, so after
 * the instruction the whole room is inside that set no matter where they
 * started. Stack instructions whose matching sets nest and shrink, and the
 * room converges. Nobody is ever told they were wrong, and nobody is ever
 * short of options.
 *
 * WHY IT DOES NOT FEEL FORCED
 *  - Every round leaves several valid answers, so the choice is real. Only the
 *    final round has one, and by then it reads as the reveal, not a rule.
 *  - The criterion CHANGES kind every round: a feature, then a position, then
 *    a category, then a colour. Five rounds of the same kind of rule reads as
 *    an algorithm; five different kinds reads as a game.
 *  - Nothing is ever removed from the grid mid-routine. Items vanishing round
 *    by round is what exposes a funnel. There is exactly one vanish, at the end.
 *  - The wording is always "switch to", never "cross out" or "eliminate".
 *    Elimination language invites people to reconstruct the logic afterwards.
 *
 * WHY THE VERIFIER EXISTS
 * A hand-built set fails silently. Get one tag wrong and a few spectators end
 * on the wrong emoji, say nothing, and the only symptom is a soft reaction you
 * cannot explain. verifySet() walks every possible path from every possible
 * starting emoji and refuses to pass unless all of them land on exactly one.
 * Run it against any set before performing it.
 */

(function (root) {
  'use strict';

  // 6 x 4. Column index decides the positional tags, so the layout and the
  // instructions cannot drift apart -- "left half" is derived, never typed.
  const COLUMNS = 6;

  // prettier-ignore
  const EMOJI = [
    '🐸', '🍎', '🤖',   '🐶', '🍌', '🍕',
    '🐨', '⚽', '🌵',   '🐱', '🎸', '🔑',
    '👻', '⭐', '🍉',   '🦁', '✈️', '📚',
    '🐼', '🧊', '🎈',   '🐵', '😀', '🚗',
  ];

  // Hand-tagged properties. Positional tags are added below from the index, so
  // moving an emoji in the grid updates them automatically.
  const TAGS = {
    '🐸': ['face', 'animal', 'green'],
    '🐨': ['face', 'animal'],
    '👻': ['face'],
    '🐼': ['face', 'animal', 'blackwhite'],
    '🤖': ['face'],
    '🐶': ['face', 'animal'],
    '🐱': ['face', 'animal'],
    '🦁': ['face', 'animal'],
    '🐵': ['face', 'animal'],
    '😀': ['face'],
    '🌵': ['green'],
    '🍎': [], '⚽': ['blackwhite'], '⭐': [], '🍉': ['green'], '🧊': [], '🎈': [],
    '🍌': [], '🍕': [], '🎸': [], '🔑': [], '✈️': [], '📚': [], '🚗': [],
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
   * Each round's matching set is defined by tags, prefixed with "!" to negate.
   * The rounds nest deliberately: a spectator always moves to something that
   * still satisfies everything asked so far, so each instruction reads as
   * narrowing rather than as being sent somewhere unrelated.
   *
   * 24 -> 10 -> 5 -> 3 -> 2 -> 1
   */
  const ROUNDS = [
    {
      key: 'face',
      type: 'relational',
      // Both escape hatches are stated out loud. Half the grid IS a face, so
      // those spectators map to themselves and would otherwise sit there
      // wondering whether they had misunderstood; and 12 of the 24 starts
      // give a tie for 'nearest'. Neither is a flaw, but an unspoken one
      // reads to a spectator as having got it wrong, and hesitation is what
      // makes a routine feel like a test instead of a game.
      say: 'Move to the emoji with a face that is CLOSEST to the one you picked. If yours already has a face, stay where you are. If two look equally close, take either one.',
      requires: ['face'],
    },
    {
      key: 'left',
      say: 'Now switch to any emoji with a face on the LEFT half of the screen.',
      requires: ['face', 'leftHalf'],
    },
    {
      key: 'animal',
      say: 'Switch to any of those that is an animal.',
      requires: ['face', 'leftHalf', 'animal'],
    },
    {
      key: 'colour',
      say: 'Switch to any of those that is NOT black and white.',
      requires: ['face', 'leftHalf', 'animal', '!blackwhite'],
    },
    {
      key: 'final',
      say: 'And settle on the green one.',
      requires: ['face', 'leftHalf', 'animal', '!blackwhite', 'green'],
    },
  ];

  /*
   * Chebyshev ("king move") distance. Chosen over Manhattan because it matches
   * how the grid actually reads on screen: a diagonal neighbour looks just as
   * close as one straight up, so "nearest" should agree with the eye rather
   * than with a taxi route.
   */
  function distance(a, b) {
    return Math.max(Math.abs(a.row - b.row), Math.abs(a.column - b.column));
  }

  function matches(item, requires) {
    return requires.every((tag) =>
      tag.charAt(0) === '!'
        ? !item.tags.includes(tag.slice(1))
        : item.tags.includes(tag)
    );
  }

  /*
   * Where a spectator may go this round.
   *
   * ABSOLUTE rounds ("switch to any emoji that is X") ignore where they are:
   * the whole room lands inside the matching set at once.
   *
   * RELATIONAL rounds ("move to the nearest X") depend on where they already
   * are, which is the point of using them -- it makes the free choice at the
   * top actually determine something. Every emoji at the minimum distance is
   * returned, not just one: ties are a genuine free choice for the spectator,
   * and the verifier has to walk all of them or it is not proving anything.
   */
  function allowedTargets(items, round, from) {
    const candidates = items.filter((item) => matches(item, round.requires));
    if (round.type !== 'relational' || !from) return candidates;
    if (!candidates.length) return [];
    const best = Math.min(...candidates.map((c) => distance(from, c)));
    return candidates.filter((c) => distance(from, c) === best);
  }

  /*
   * Walks every path from every starting emoji.
   *
   * Two ways a set can be broken, and both are checked:
   *  1. A round with NO valid target strands the room mid-routine -- worse
   *     than a wrong answer, because people visibly cannot comply.
   *  2. A final set larger than one means some spectators end elsewhere. That
   *     is the silent failure this whole function exists to prevent.
   */
  function verifySet(set) {
    const items = set.items;
    const problems = [];
    const sizes = [items.length];

    let reachable = items.slice();
    set.rounds.forEach((round, i) => {
      // Union over every position the room could currently be in. For an
      // absolute round that collapses to one set; for a relational one it is a
      // real breadth-first step, since two spectators on different emoji get
      // different options.
      const next = new Map();
      reachable.forEach((from) => {
        const targets = allowedTargets(items, round, from);
        if (targets.length === 0) {
          problems.push(
            `Round ${i + 1} (${round.key}): nothing matches from ${from.emoji}, which strands anyone there.`
          );
        }
        targets.forEach((t) => next.set(t.id, t));
      });
      reachable = Array.from(next.values());
      sizes.push(reachable.length);
    });

    if (reachable.length !== 1) {
      problems.push(
        `Ends on ${reachable.length} emoji (${reachable.map((r) => r.emoji).join(' ')}) instead of exactly one.`
      );
    }

    // A round that does not shrink the set is a wasted beat on stage: the
    // audience makes a choice that changed nothing. Not fatal, worth knowing.
    const stalled = [];
    for (let i = 1; i < sizes.length; i++) {
      const round = set.rounds[i - 1];
      // A relational round's job is to make the spectator's own position
      // matter, not to shrink the field, so a flat step there is by design.
      if (round.type === 'relational') continue;
      if (sizes[i] >= sizes[i - 1]) stalled.push(round.key);
    }

    return {
      ok: problems.length === 0,
      problems,
      sizes,
      stalled,
      target: reachable.length === 1 ? reachable[0] : null,
      // Rough sense of how free it felt: the product of the choices offered.
      apparentPaths: sizes.slice(0, -1).reduce((a, b) => a * b, 1),
    };
  }

  const SET = {
    id: 'emoji-24-v1',
    columns: COLUMNS,
    items: buildItems(),
    rounds: ROUNDS,
  };

  // Attached to globalThis rather than exported: this loads as a classic
  // <script> in the browser alongside the other public/ files, and package.json
  // sets "type": "module", so a CommonJS export here would never run under Node
  // either. globalThis is the one thing both agree on, which also lets the
  // verifier be run from the command line before a show.
  root.InteractiveSet = { SET, verifySet, allowedTargets, matches, COLUMNS };
})(globalThis);
