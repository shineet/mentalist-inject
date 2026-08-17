/*
 * interactive-set.js — the "everyone ends on the same thing" routine.
 *
 * THE PRINCIPLE
 * Each instruction is "move to the nearest X". Whatever a spectator is looking
 * at, they end up on something matching X, so after the instruction the whole
 * room is inside that set no matter where they started. The last set collapses
 * to one, and the room has converged.
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
 * So consecutive rounds are DISJOINT: nothing is in both round N and round
 * N+1. Everyone moves, every single time. And because each round is a
 * different category rather than a subset of the last, the pool never appears
 * to shrink -- it changes character. It is not a funnel until the final beat.
 *
 * THE LOGO FINISH
 * The closing round is "move to the nearest LOGO", and there are five logos on
 * screen. That matters for the same reason the old green round had five greens:
 * a final instruction with only one honest answer is a naked force at the most
 * exposed moment of the routine. Five visible logos, and position alone decides
 * which one a spectator reaches.
 *
 * WHY THE CLIENT LOGO IS A SLOT, NOT A CHOICE
 * Which logo the room lands on is decided by the geometry, and the geometry is
 * frozen by SEED. So the target is a fixed POSITION in the layout -- CLIENT_SLOT
 * below -- and the per-gig client logo is simply the picture drawn at that
 * position. Changing the picture cannot change where anybody walks, so a new
 * client needs no new seed search and carries no showtime risk. If no logo is
 * configured, the default mark is drawn there and the routine still works.
 *
 * WHY THE VERIFIER EXISTS
 * A hand-built set fails silently. Get one tag wrong and a few spectators end
 * elsewhere, say nothing, and the only symptom is a soft reaction you cannot
 * explain. verifySet() refuses to pass a set that does not end on exactly one
 * item, that strands anyone with nothing to move to, that lets anyone stand
 * still, or whose closing rounds sit clustered together.
 */

(function (root) {
  'use strict';

  // The scatter lives in a box of this fixed aspect on EVERY screen, phone or
  // projector. That is not cosmetic: every round asks for the nearest thing, so
  // if the layout reflowed differently on a tall phone than on a wide projector,
  // two spectators would compute different answers and the whole guarantee
  // would quietly fail. Fixed aspect means identical geometry everywhere.
  const BOX_W = 1.5;
  const BOX_H = 1.0;

  // Laid out on a lattice and then jittered. Deterministic on purpose: it has
  // to LOOK scattered while being the SAME scatter for the host screen and
  // every phone in the room.
  const COLS = 8;
  const ROWS = 7;   // 8 x 7 = 56 slots for 49 items; the gaps read as natural

  // Load-bearing, not decorative. Every round is relational, so the LAYOUT is
  // the only thing deciding whether the room converges at all -- the
  // instructions on their own guarantee nothing. Found by searching the seed
  // space and testing each candidate with verifySet.
  //
  // CHANGING THIS, ANY EMOJI, OR THE NUMBER OF LOGOS WILL BREAK THE ROUTINE
  // unless a new seed is searched the same way (tools/search-seed.mjs). Roughly
  // 1 layout in 250 converges cleanly, so it is not something to guess at --
  // the host panel's verified badge is the backstop.
  //
  // 241716 funnels 49 -> 13 -> 6 -> 5 -> 5 -> 1. It was chosen over hundreds of
  // other converging layouts on two counts the maths does not care about but
  // the room does:
  //
  //  - The five logos span 88% of the width and 90% of the height, with no two
  //    closer than 0.40. Most converging layouts huddle all five logos into one
  //    corner, because that is the easy way for everybody's nearest logo to be
  //    the same one -- and it looks exactly as arranged as it is.
  //  - The five survivors going into the last round sit in four different
  //    quadrants, so the closing move is five people crossing the screen from
  //    genuinely different places, not five neighbours stepping sideways.
  const SEED = 241716;

  // The layout index the room converges on. Established by the search that
  // chose SEED, re-checked by verifySet on every load. The client's logo is
  // drawn here; the other four logo positions get the decoy marks.
  //
  // It lands near the middle of the field, which is where you want it: the
  // reveal grows from the centre of the screen rather than an edge.
  const CLIENT_SLOT = 27;

  const LOGO_COUNT = 5;

  /* ---------------------------------------------------------------------- *
   * Decoy marks
   *
   * Drawn here as inline SVG rather than fetched, so the routine has no
   * external dependency and works on a room's bad wifi. They are abstract on
   * purpose: no real company's mark, nothing anyone can recognise and wonder
   * about. What they have to be is unmistakably a LOGO at a glance, since the
   * closing instruction depends on a spectator sorting them from the emoji
   * without hesitating.
   * ---------------------------------------------------------------------- */
  function mark(inner) {
    return (
      'data:image/svg+xml;utf8,' +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" ' +
        'stroke="#111" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">' +
        inner + '</svg>'
      )
    );
  }

  const DECOY_LOGOS = [
    mark('<circle cx="32" cy="32" r="20"/><circle cx="32" cy="32" r="5" fill="#111" stroke="none"/>'),
    mark('<path d="M32 12 L54 50 H10 Z"/><path d="M20 38 H44"/>'),
    mark('<path d="M32 10 L52 22 V42 L32 54 L12 42 V22 Z"/><path d="M22 40 L42 24"/>'),
    mark('<rect x="12" y="12" width="26" height="26" rx="4"/><rect x="26" y="26" width="26" height="26" rx="4"/>'),
    mark('<path d="M14 26 L32 14 L50 26"/><path d="M14 42 L32 30 L50 42"/>'),
  ];

  // Used at CLIENT_SLOT when a gig has no logo configured. Deliberately in the
  // same abstract family as the decoys, so an unconfigured show looks like five
  // sibling marks rather than four marks and a hole.
  const DEFAULT_LOGO = mark('<circle cx="32" cy="32" r="20"/><path d="M32 12 V32 L46 42"/>');

  // prettier-ignore
  const GROUPS = {
    // Round 1's destination.
    face: ['🐼', '🐨', '🐸', '🐶', '🐱', '🦁', '🐵', '🐷', '👻', '🤖', '😀', '🦊'],
    food: ['🍎', '🍌', '🍕', '🍉', '🍦', '🍔', '🍇', '🥕'],
    // Round 3 is "not alive and not food", so objects, abstract things AND the
    // logos are one pool. Keeping the emoji groups separate here only documents
    // the intent.
    object: ['⚽', '🎸', '🔑', '📚', '⌚', '📱', '✏️', '🎩', '🧢', '🔨'],
    abstract: ['⭐', '🌈', '❤️', '🔥', '💧', '🌙', '🎵', '⚡', '☁️', '🌊'],
    // Several visibly green things, on purpose. The EMOJI set's closing
    // instruction is "the nearest green thing", and it has to have MORE than
    // one honest answer or it is a naked force at the most exposed moment.
    // In the LOGO set these tags are simply inert.
    green: ['🐸', '🌵', '🥑', '🍀', '🐢'],
  };

  const TAGS = {};
  GROUPS.face.forEach((e) => (TAGS[e] = ['face', 'animal']));
  ['👻', '🤖', '😀'].forEach((e) => (TAGS[e] = ['face']));   // faces, not animals
  GROUPS.food.forEach((e) => (TAGS[e] = ['food']));
  GROUPS.object.forEach((e) => (TAGS[e] = ['thing']));
  GROUPS.abstract.forEach((e) => (TAGS[e] = ['thing']));
  TAGS['🐼'] = ['face', 'animal', 'greyish'];
  TAGS['🐨'] = ['face', 'animal', 'greyish'];
  TAGS['🐸'] = ['face', 'animal', 'green'];
  TAGS['🐢'] = ['face', 'animal', 'green'];
  // 🌵 and 🍀 are alive and not food, so outside the green round they match
  // nothing at all -- they exist to fill the field, which is what a spectator
  // assumes most of the screen is doing anyway.
  TAGS['🌵'] = ['green'];
  TAGS['🥑'] = ['food', 'green'];
  TAGS['🍀'] = ['green'];

  const EMOJI = [].concat(
    GROUPS.face, GROUPS.food, GROUPS.object, GROUPS.abstract,
    GROUPS.green.filter((e) => e !== '🐸')
  );

  // What goes into the scatter: every emoji, plus the logo tiles.
  //
  // The logos carry 'thing' as well as 'logo' because round 3 says "not alive
  // and not food", and a spectator looking at a logo would plainly count it.
  // The tags have to agree with what the room can see, not with what is
  // convenient -- a logo excluded from round 3 in code but included by the
  // audience's own reading is exactly the silent failure verifySet cannot catch.
  const EMOJI_SPECS = EMOJI.map((emoji) => ({
    kind: 'emoji', emoji, label: emoji, tags: (TAGS[emoji] || []).slice(),
  }));

  const LOGO_SPECS = [].concat(
    EMOJI_SPECS,
    Array.from({ length: LOGO_COUNT }, (_, i) => ({
      kind: 'logo', logo: i, label: 'LOGO' + (i + 1), tags: ['logo', 'thing'],
    }))
  );

  // Small deterministic PRNG. Same seed, same scatter, every device.
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildItems(specs, seed, cols, rows) {
    const rand = mulberry32(seed);
    // Shuffle first so the category blocks are not laid down in reading order
    // -- otherwise all the food would sit in one band of the screen, and worse,
    // the five logos would land in a row along the bottom.
    const shuffled = specs.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const cellW = BOX_W / cols;
    const cellH = BOX_H / rows;
    // Jitter stays inside 34% of a cell so nothing can overlap or drift off
    // the edge, which keeps "nearest" readable at a glance.
    const jx = cellW * 0.34;
    const jy = cellH * 0.34;

    return shuffled.map((spec, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = (col + 0.5) * cellW + (rand() * 2 - 1) * jx;
      const y = (row + 0.5) * cellH + (rand() * 2 - 1) * jy;
      const tags = spec.tags.slice();
      tags.push(x < BOX_W / 2 ? 'leftHalf' : 'rightHalf');
      tags.push(y < BOX_H / 2 ? 'topHalf' : 'bottomHalf');
      // Rotation is cosmetic only, never used by any rule. Logos stay upright:
      // a tilted corporate mark looks like a rendering bug, not a scatter.
      const tilt = spec.kind === 'logo' ? 0 : (rand() * 2 - 1) * 14;
      return {
        id: 'i' + index, index, x, y, tilt, tags,
        kind: spec.kind,
        emoji: spec.emoji,
        logo: spec.logo,
        label: spec.label,
      };
    });
  }

  /*
   * Every round is relational, so the spectator's own free choice decides where
   * they go at each step. excludeSelf keeps it honest: someone already standing
   * on a face still has to move when faces are called.
   */
  // The first four rounds are shared. Only the finish differs between the two
  // sets, which is the whole reason the routine can have two finishes at all.
  const OPENING_ROUNDS = [
    {
      key: 'face', type: 'relational', excludeSelf: true,
      say: 'Move to the CLOSEST emoji that has a face — not your own one. If two look equally close, take either.',
      requires: ['face'],
    },
    {
      key: 'food', type: 'relational', excludeSelf: true,
      say: 'Now move to the FOOD nearest to you.',
      requires: ['food'],
    },
    {
      key: 'thing', type: 'relational', excludeSelf: true,
      say: 'Now move to whatever is NEAREST to you that is not alive and not food.',
      requires: ['thing'],
    },
    {
      key: 'animal', type: 'relational', excludeSelf: true,
      say: 'Now move to the ANIMAL nearest to you.',
      requires: ['animal'],
    },
  ];

  const LOGO_FINISH = {
    key: 'logo', type: 'relational', excludeSelf: true,
    // Five logos are on screen and every one of them is a legitimate answer to
    // this. Which one a spectator reaches is decided entirely by the path their
    // own choices took them along.
    say: 'And finally — move to the nearest LOGO.',
    requires: ['logo'],
  };

  const GREEN_FINISH = {
    key: 'green', type: 'relational', excludeSelf: true,
    // Same principle with colour instead of logos: five green things are
    // visible and position alone decides which one is reached.
    say: 'And finally — move to the GREEN thing nearest to you.',
    requires: ['green'],
  };

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
    // Everything at the minimum distance, not just one: a tie is a genuine free
    // choice, and the verifier has to walk all of them to prove anything.
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
            `Round ${i + 1} (${round.key}): nothing to move to from ${from.label}.`
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
      // shape of it. Two or three survivors sitting almost on top of each other
      // make the closing move look mechanical; the same three scattered read as
      // coincidence.
      if (reachable.length > 1 && reachable.length <= 3) {
        const spread = Math.min(
          ...reachable.flatMap((a, ai) =>
            reachable.slice(ai + 1).map((b) => distance(a, b))
          )
        );
        if (isFinite(spread) && spread < 0.25) {
          warnings.push(
            `Round ${i + 1} (${round.key}) leaves ${reachable.length} items clustered together — that move will barely register.`
          );
        }
      }
    });

    if (reachable.length !== 1) {
      problems.push(
        `Ends on ${reachable.length} items (${reachable.map((r) => r.label).join(' ')}) instead of exactly one.`
      );
    }

    const target = reachable.length === 1 ? reachable[0] : null;

    // For the logo set the finish has to BE a logo, not merely unique. If it
    // converged on an emoji the routine would still "work" and the reveal would
    // be worthless, so this is a hard failure rather than a warning. The emoji
    // set has the mirror requirement: it must not land on a logo, which would
    // mean logo tiles had leaked into a field that is supposed to have none.
    if (target && set.wantsLogos && target.kind !== 'logo') {
      problems.push(`Ends on ${target.label}, which is not a logo.`);
    }
    if (target && !set.wantsLogos && target.kind === 'logo') {
      problems.push(`Ends on ${target.label}, but this set should have no logos in it.`);
    }

    return {
      ok: problems.length === 0,
      problems,
      warnings,
      sizes,
      layers,
      target,
      // Which layout position the client's logo has to occupy. The host panel
      // shows this so a mismatch with CLIENT_SLOT is visible before a show
      // rather than during one.
      targetIndex: target ? target.index : null,
      apparentPaths: sizes.slice(0, -1).reduce((a, b) => a * b, 1),
    };
  }

  function buildSet(config) {
    return {
      id: config.id,
      box: { w: BOX_W, h: BOX_H },
      cols: config.cols,
      rows: config.rows,
      seed: config.seed,
      clientSlot: config.clientSlot,
      wantsLogos: !!config.wantsLogos,
      items: buildItems(config.specs, config.seed, config.cols, config.rows),
      rounds: OPENING_ROUNDS.concat([config.finish]),
    };
  }

  /*
   * TWO SETS, ONE ROUTINE
   *
   * With a client logo configured the field carries five logo tiles and closes
   * on "the nearest LOGO". With no logo configured it must NOT invent one --
   * five abstract marks nobody chose is a worse finish than no logo at all --
   * so the field is emoji only and closes on "the nearest GREEN thing",
   * landing on the turtle.
   *
   * They are genuinely separate layouts, not one layout with a swap. Each has
   * its own item count, its own lattice and its own searched seed, because the
   * convergence depends entirely on the geometry and the two fields have
   * different geometry. Both are verified independently on every load.
   */
  const EMOJI_SET = buildSet({
    id: 'emoji-44-green-finish',
    specs: EMOJI_SPECS,
    finish: GREEN_FINISH,
    cols: 8,
    rows: 6,          // 8 x 6 = 48 slots for 44 emoji
    seed: 4090,       // funnels 44 -> 13 -> 7 -> 3 -> 3 -> 1, landing on the turtle
    clientSlot: null,
    wantsLogos: false,
  });

  const LOGO_SET = buildSet({
    id: 'logo-49-logo-finish',
    specs: LOGO_SPECS,
    finish: LOGO_FINISH,
    cols: COLS,
    rows: ROWS,
    seed: SEED,
    clientSlot: CLIENT_SLOT,
    wantsLogos: true,
  });

  /**
   * Which set a show runs, decided by whether a client logo is configured.
   * Host and audience both call this with the same value out of show state, so
   * they cannot disagree about which routine is on screen.
   */
  function setFor(clientLogoUrl) {
    return clientLogoUrl ? LOGO_SET : EMOJI_SET;
  }

  /**
   * The picture to draw at a given item, given the gig's configured logo.
   * Everything about per-gig configuration lives here: one slot varies, the
   * rest are constant.
   */
  function logoSrc(item, clientLogoUrl) {
    if (item.kind !== 'logo') return null;
    if (item.index === CLIENT_SLOT) return clientLogoUrl || DEFAULT_LOGO;
    return DECOY_LOGOS[item.logo % DECOY_LOGOS.length];
  }

  // globalThis rather than an export: this loads as a classic <script> in the
  // browser, and package.json sets "type": "module", so a CommonJS export would
  // never run under Node either. This is the one thing both agree on, which
  // also lets the verifier be run from the command line before a show.
  root.InteractiveSet = {
    EMOJI_SET, LOGO_SET, setFor, buildSet, buildItems,
    verifySet, allowedTargets, matches, distance,
    EMOJI_SPECS, LOGO_SPECS, OPENING_ROUNDS, LOGO_FINISH, GREEN_FINISH,
    BOX_W, BOX_H, SEED, CLIENT_SLOT, DEFAULT_LOGO, DECOY_LOGOS, logoSrc,
  };
})(globalThis);
