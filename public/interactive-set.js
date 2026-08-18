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
  const ROWS = 6;   // 8 x 6 = 48 slots for 39 live items; the gaps read as natural

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
  // 29271 puts 96 things on screen and funnels 13 -> 6 -> 5 -> 3 -> 1.
  //
  // Chosen for robustness and balance, not for looks -- a deliberate reversal
  // after an earlier seed, picked for how well its logos spread, failed in a
  // real show. This one holds together if everyone misjudges every distance by
  // up to 20%, and every round has at least two targets on each side of the
  // screen so no instruction drags the whole room in one direction.
  //
  // That balance costs robustness: unbalanced layouts reach 31% and higher,
  // because lopsidedness is what makes a category funnel. 21% is still three
  // times the 6.8% margin that actually failed in performance, and being
  // dragged across the field is a giveaway in its own right, so the trade is
  // worth making -- but it is a trade, not a free win.
  //
  // Worth knowing before swapping it: passing a WIDER reading of round 3 does
  // not imply passing the narrow one. Widening `maybe` changes WHICH items are
  // nearest, not merely how many qualify, so the two tests are independent.
  //
  // The emoji set cannot cover animals being read as holdable at all -- with
  // animals counted, rounds 3 and 4 both target animals and the funnel will not
  // close, in 25,000 seeds. That is why the spoken wording rules animals out
  // explicitly rather than leaving it to the layout.
  const SEED = 29271;

  // The layout index the room converges on. Established by the search that
  // chose SEED, re-checked by verifySet on every load. The client's logo is
  // drawn here; the other four logo positions get the decoy marks.
  //
  // It lands near the middle of the field, which is where you want it: the
  // reveal grows from the centre of the screen rather than an edge.
  const CLIENT_SLOT = 19;

  const LOGO_COUNT = 5;

  /* ---------------------------------------------------------------------- *
   * The logo plates
   *
   * ALL FIVE show the same logo -- the client's.
   *
   * They used to be four invented wordmarks plus the client's, which was a
   * mistake Shine spotted: at a corporate show the room already knows the
   * finish will be their own logo, so the client mark is the only one that
   * matters and spotting it tells you the ending before the reveal happens.
   * The surprise was leaking out through the decoys.
   *
   * Making them identical costs nothing, because the decoys were never doing
   * the work people assume. They exist so that "move to the nearest logo" has
   * more than one honest answer and does not feel forced -- and five identical
   * plates satisfy that just as well as five different ones. The CONVERGENCE is
   * what puts everybody on the same plate, and it is purely geometric: the
   * plates are interchangeable, so what is drawn on them cannot affect it.
   *
   * The reveal is unaffected for the same reason. Everyone genuinely ends on
   * the same plate, so nobody watches a different plate survive.
   * ---------------------------------------------------------------------- */
  function logoMark(inner, name) {
    return (
      'data:image/svg+xml;utf8,' +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">' +
        '<g fill="none" stroke="#141414" stroke-width="7" stroke-linecap="round" ' +
        'stroke-linejoin="round" transform="translate(28,16)">' + inner + '</g>' +
        '<text x="60" y="106" text-anchor="middle" fill="#141414" ' +
        'font-family="Helvetica Neue, Helvetica, Arial, sans-serif" ' +
        'font-size="24" font-weight="700" textLength="96" ' +
        'lengthAdjust="spacingAndGlyphs">' + name + '</text>' +
        '</svg>'
      )
    );
  }

  // Drawn on every plate when a gig has no logo configured, so an unconfigured
  // show still reads as five of one company rather than five different ones.
  const DEFAULT_LOGO = logoMark(
    '<circle cx="32" cy="34" r="26"/><path d="M32 12 V34 L50 46"/>', 'ORBIT');

  /* ---------------------------------------------------------------------- *
   * THE TWO KINDS OF THING ON SCREEN
   *
   * LIVE items are the routine. Every instruction points at one of these
   * groups, and the convergence is decided entirely by where they sit.
   *
   * FILLER matches NO instruction at all. It exists so the screen can be
   * packed edge to edge, which is what makes the field look like a genuine
   * jumble rather than a small arrangement someone designed.
   *
   * That split is not cosmetic, it is the only way to have both. Adding more
   * LIVE items does not make the routine harder to follow, it makes it
   * impossible: with faces everywhere, "the nearest face" only ever moves you
   * to a neighbour, the reachable set stops shrinking, and the room never
   * funnels to one thing. Filler is free precisely because no rule can select
   * it, so it can be as dense as the screen will take.
   *
   * The constraint on filler is therefore absolute: it must be a legitimate
   * answer to NOTHING. Not a face, not food, not an animal, not something you
   * could pick up, not a logo, and -- for the emoji set, whose finish is about
   * colour -- not green. Weather, sky, symbols and hearts clear all six.
   * ---------------------------------------------------------------------- */

  // prettier-ignore
  const GROUPS = {
    // Round 1's destination.
    face: ['🐼', '🐨', '🐸', '🐶', '🐱', '🦁', '🐵', '🐷', '👻', '🤖', '😀', '🦊'],
    food: ['🍎', '🍌', '🍕', '🍉', '🍦', '🍔', '🍇', '🥕'],
    // Round 3 is "something you could pick up and hold", so this group is
    // exactly that and nothing else. It used to be "not alive and not food",
    // which also caught stars, clouds and hearts -- fine when those were live
    // items, fatal once they became filler, because filler must never be a
    // legitimate answer.
    object: ['⚽', '🎸', '🔑', '📚', '⌚', '📱', '✏️', '🎩', '🧢', '🔨'],
    // Several visibly green things, on purpose. The EMOJI set's closing
    // instruction is "the nearest green thing", and it has to have MORE than
    // one honest answer or it is a naked force at the most exposed moment.
    // In the LOGO set these tags are simply inert.
    green: ['🐸', '🌵', '🥑', '🍀', '🐢'],
  };

  // Deliberately no faces here: 🌞 and 🌝 are out for that reason alone, and
  // 🌙 is the crescent rather than the one with a profile on it. Deliberately
  // nothing green either, or it would become an honest answer to the emoji
  // set's closing instruction -- which is why 🌈 is absent, and why ❇️ was
  // pulled after seeing it on screen: it is described as a "sparkle" but Apple
  // draws it as a solid GREEN tile. Check new filler by looking at it rendered,
  // not by reading its name. The spectator sees the picture, not the codepoint.
  // prettier-ignore
  const FILLER = [
    '⭐', '🌟', '💫', '✨', '☄️', '🌠', '🌙', '☀️', '☁️', '⚡', '❄️', '💧',
    '🌊', '🔥', '💥', '💨', '🌀', '🎵', '🎶', '✴️', '❤️', '💙', '💜', '🤍',
  ];

  const TAGS = {};
  GROUPS.face.forEach((e) => (TAGS[e] = ['face', 'animal']));
  ['👻', '🤖', '😀'].forEach((e) => (TAGS[e] = ['face']));   // faces, not animals
  GROUPS.food.forEach((e) => (TAGS[e] = ['food']));
  GROUPS.object.forEach((e) => (TAGS[e] = ['thing']));
  TAGS['🐼'] = ['face', 'animal', 'greyish'];
  TAGS['🐨'] = ['face', 'animal', 'greyish'];
  TAGS['🐸'] = ['face', 'animal', 'green'];
  TAGS['🐢'] = ['face', 'animal', 'green'];
  // 🌵 and 🍀 are alive and not food, and you would not call either of them
  // something you pick up and hold, so outside the green round they match
  // nothing -- live items that behave like filler.
  TAGS['🌵'] = ['green'];
  // NOT tagged green, deliberately. The avocado emoji shows a big brown pit
  // and pale yellow-green flesh -- nobody scanning for "the green thing" picks
  // it, and it was the emoji set's target until Shine said so. Every remaining
  // green is unmistakable at a glance: frog, cactus, clover, turtle.
  TAGS['🥑'] = ['food'];
  TAGS['🍀'] = ['green'];

  const EMOJI = [].concat(
    GROUPS.face, GROUPS.food, GROUPS.object,
    GROUPS.green.filter((e) => e !== '🐸')
  );

  // The logos carry ONLY 'logo' now. Under the old round 3 they also carried
  // 'thing', because "not alive and not food" plainly described a logo and the
  // tags have to agree with what the room can see. Under "something you could
  // pick up and hold" a logo is just as plainly excluded, so the tag went with
  // the wording.
  const EMOJI_SPECS = EMOJI.map((emoji) => ({
    kind: 'emoji', emoji, label: emoji, tags: (TAGS[emoji] || []).slice(),
  }));

  const LOGO_SPECS = [].concat(
    EMOJI_SPECS,
    Array.from({ length: LOGO_COUNT }, (_, i) => ({
      kind: 'logo', logo: i, label: 'LOGO' + (i + 1), tags: ['logo'],
    }))
  );

  // How close two things may sit, in box units (the box is BOX_W wide). Filler
  // is packed down to this, so it decides whether the screen reads as "full"
  // or as "cluttered", and the two are only a hair apart.
  //
  // The number that matters is this against the rendered glyph size. A glyph
  // occupies roughly 0.85 of its font-size, and audience.html sets font-size to
  // 0.064 of the field width -- so a glyph is about 0.082 box units across. At
  // PACK below that they overlap and the field turns to mush; at PACK well
  // above it they read as separate objects with air between them, which is
  // what makes a busy screen legible rather than cluttered. Keep the two in
  // step: raising the font size without raising this turns the field to soup.
  //
  // Live items keep their own much wider lattice spacing, so packing the gaps
  // never makes "the nearest face" harder to judge -- the faces are still
  // exactly where they were.
  const PACK = 0.094;

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

    /* Shuffled so the category blocks are not laid down in reading order --
     * otherwise all the food would sit in one band of the screen.
     *
     * NOT stratified, and that is a finding rather than an oversight. Dealing
     * the categories out evenly across the lattice balances every one of them
     * perfectly and drops convergence to ZERO in 40,000 seeds. Same tension as
     * density: if every category is spread evenly then "the nearest food" is
     * always a local one, the reachable set never shrinks, and the room never
     * funnels to a single item. The unevenness IS the mechanism.
     */
    const emojiSpecs = specs.filter((sp) => sp.kind !== 'logo');
    const logoSpecs = specs.filter((sp) => sp.kind === 'logo');
    for (let i = emojiSpecs.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [emojiSpecs[i], emojiSpecs[j]] = [emojiSpecs[j], emojiSpecs[i]];
    }

    /* Logos are PLACED, not shuffled.
     *
     * Left to the shuffle they landed in consecutive lattice slots -- three of
     * the five ended up touching in the top-left corner, which reads as
     * arranged and wastes the whole point of having five. Searching for a seed
     * that happened to spread them failed completely: converging, balanced and
     * spread together was 0 seeds in 60,000, because each constraint is fighting
     * the others.
     *
     * So the grid is cut into as many horizontal bands as there are logos, and
     * one slot is taken from each. Spread is then guaranteed by construction
     * rather than hoped for, and the seed only has to solve convergence -- which
     * is the thing a search is actually good at. Same move as separating live
     * items from filler: make the constraint structural, then search the rest.
     */
    const slots = cols * rows;
    const taken = new Set();
    const logoSlots = [];
    const band = Math.floor(slots / Math.max(1, logoSpecs.length));
    logoSpecs.forEach((_, i) => {
      // A random slot within this logo's own band, avoiding the extreme edges
      // of the band so two neighbouring logos cannot end up adjacent.
      const lo = i * band + Math.floor(band * 0.15);
      const hi = i * band + Math.ceil(band * 0.85);
      let slot = lo + Math.floor(rand() * Math.max(1, hi - lo));
      while (taken.has(slot)) slot = (slot + 1) % slots;
      taken.add(slot);
      logoSlots.push(slot);
    });

    const shuffled = new Array(slots).fill(null);
    logoSpecs.forEach((spec, i) => { shuffled[logoSlots[i]] = spec; });
    let next = 0;
    for (let i = 0; i < slots && next < emojiSpecs.length; i++) {
      if (!shuffled[i]) shuffled[i] = emojiSpecs[next++];
    }
    // Trailing empty slots are simply gaps in the lattice, which is what the
    // 8x6 grid holding 39 items already relies on to look natural.
    for (let i = shuffled.length - 1; i >= 0; i--) {
      if (!shuffled[i]) shuffled.splice(i, 1);
    }

    const cellW = BOX_W / cols;
    const cellH = BOX_H / rows;
    // Jitter stays inside 34% of a cell so nothing can overlap or drift off
    // the edge, which keeps "nearest" readable at a glance.
    const jx = cellW * 0.34;
    const jy = cellH * 0.34;

    const live = shuffled.map((spec, index) => {
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

    relax(live);
    return live.concat(buildFiller(live, seed));
  }

  /**
   * Pushes overlapping LIVE items apart.
   *
   * Filler respects PACK by construction -- it is only ever placed where there
   * is room. Live items are not: they sit on a lattice with jitter, and two
   * neighbours that happen to jitter toward each other end up closer than a
   * glyph is wide, so they visibly touch. Cell width is 0.1875 and the jitter
   * is +/-0.0638, which puts the worst case at 0.060 apart against a glyph
   * about 0.082 across.
   *
   * Shrinking the jitter would fix it and would also make the lattice show
   * through as rows, which is the thing the jitter is there to hide. So instead
   * the overlaps are relaxed out afterwards: a few passes of pushing any too-close
   * pair apart along the line between them. Deterministic, no randomness, so the
   * layout stays identical on every device -- and the seed search runs against
   * the relaxed positions, so what is verified is what is drawn.
   */
  function relax(items) {
    const MIN = PACK;
    const EDGE = 0.012;
    for (let pass = 0; pass < 60; pass++) {
      let moved = false;
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i], b = items[j];
          let dx = b.x - a.x, dy = b.y - a.y;
          let d = Math.hypot(dx, dy);
          if (d >= MIN) continue;
          if (d < 1e-6) { dx = 1e-3; dy = 0; d = 1e-3; }   // exact overlap: pick an axis
          const push = (MIN - d) / 2;
          const ux = (dx / d) * push, uy = (dy / d) * push;
          a.x -= ux; a.y -= uy;
          b.x += ux; b.y += uy;
          moved = true;
        }
      }
      // Keep everything inside the box, or the relaxation walks items off the edge.
      items.forEach((it) => {
        it.x = Math.min(BOX_W - EDGE, Math.max(EDGE, it.x));
        it.y = Math.min(BOX_H - EDGE, Math.max(EDGE, it.y));
      });
      if (!moved) break;
    }
    // Half-of-field tags are derived from position, so they have to be redone.
    items.forEach((it) => {
      it.tags = it.tags.filter((t) => !['leftHalf', 'rightHalf', 'topHalf', 'bottomHalf'].includes(t));
      it.tags.push(it.x < BOX_W / 2 ? 'leftHalf' : 'rightHalf');
      it.tags.push(it.y < BOX_H / 2 ? 'topHalf' : 'bottomHalf');
    });
  }

  /**
   * Packs filler into every gap the live items leave.
   *
   * Dart-throwing rather than a lattice: a lattice would show through as rows
   * once the screen is this busy, and rows are the thing that makes a field
   * look arranged. Candidates are tried in a fixed shuffled order and kept only
   * if they clear everything already placed, live items included.
   *
   * Seeded off the set's own seed so the packing is identical on the host
   * screen and on every phone in the room. It has no effect on the routine --
   * nothing here matches any instruction -- but two devices showing visibly
   * different fields would still be a giveaway.
   */
  function buildFiller(live, seed) {
    const rand = mulberry32(seed ^ 0x5f3759df);
    const placed = live.map((i) => ({ x: i.x, y: i.y }));
    const out = [];

    // A generous candidate grid, walked in random order. Far more candidates
    // than can be accepted, which is what lets the accepted ones look scattered
    // instead of aligned.
    const candidates = [];
    const step = PACK * 0.5;
    for (let x = step; x < BOX_W; x += step) {
      for (let y = step; y < BOX_H; y += step) candidates.push([x, y]);
    }
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    for (const [cx, cy] of candidates) {
      const x = cx + (rand() * 2 - 1) * step * 0.45;
      const y = cy + (rand() * 2 - 1) * step * 0.45;
      if (x < 0.01 || x > BOX_W - 0.01 || y < 0.01 || y > BOX_H - 0.01) continue;
      let ok = true;
      for (const p of placed) {
        const dx = p.x - x, dy = p.y - y;
        if (dx * dx + dy * dy < PACK * PACK) { ok = false; break; }
      }
      if (!ok) continue;
      placed.push({ x, y });
      const emoji = FILLER[Math.floor(rand() * FILLER.length)];
      out.push({
        id: 'f' + out.length,
        // Indices continue after the live items, so a live item's index -- and
        // therefore CLIENT_SLOT -- never moves when the packing changes.
        index: live.length + out.length,
        x, y,
        tilt: (rand() * 2 - 1) * 14,
        // Empty. This is the whole contract: filler answers to no instruction.
        tags: [],
        kind: 'filler',
        emoji,
        label: emoji,
      });
    }
    return out;
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
      say: 'Now move to the nearest OBJECT you could pick up and hold. Not food, and nothing alive.',
      requires: ['thing'],
      // Food is the honest ambiguity here, and it is the one that broke a
      // performance. A carrot IS something you could pick up and hold, as is
      // every apple, burger and slice of pizza on screen -- but the tags only
      // ever counted the ten objects. Rather than argue with the spectator,
      // the verifier now walks BOTH readings and a set only passes if the room
      // converges either way.
      maybe: ['food'],
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

  /* How much closer one candidate must be before a spectator can reliably tell.
   *
   * This is the difference between a routine that works on paper and one that
   * works in a room. The verifier used to assume everyone computes exact
   * Euclidean distance and picks the true nearest. They do not: a target 7%
   * nearer than the runner-up looks identical from across a table, and the
   * choice becomes a coin flip.
   *
   * That is not hypothetical. Shine ran it, started on the pencil, and finished
   * on the cactus instead of the turtle -- because on his last move the turtle
   * was 0.394 away and the cactus 0.421, a 6.8% margin. The maths said one
   * thing, his eyes said either, and the routine broke.
   *
   * So anything within this fraction of the nearest counts as a legitimate
   * choice, and verifySet walks EVERY such branch. A set only passes if the
   * room converges no matter which of the plausible options each person takes.
   */
  let TOLERANCE = 0.18;
  // Adjustable only so tools/search-seed.mjs can find the point at which a
  // candidate layout breaks, which is the honest measure of how much room for
  // human error it has. Nothing at runtime changes it.
  function setTolerance(t) { TOLERANCE = t; }

  function allowedTargets(items, round, from) {
    // A round can be read more than one way. `requires` is the narrow reading;
    // `maybe` names categories a reasonable spectator might also include. Each
    // reading produces its own set of plausible choices and the union is what
    // the verifier has to survive -- because different people in the same room
    // WILL read it differently, and the routine has to work for all of them.
    if (round.maybe && round.maybe.length) {
      const narrow = nearestWithin(items, round, from, round.requires);
      const wide = nearestWithin(items, round, from, round.requires.concat(round.maybe), true);
      const seen = new Map();
      narrow.concat(wide).forEach((c) => seen.set(c.id, c));
      return Array.from(seen.values());
    }
    return nearestWithin(items, round, from, round.requires);
  }

  // `anyOf` true means an item qualifies if it matches ANY of the tags rather
  // than all of them -- which is what a widened reading means in practice.
  function nearestWithin(items, round, from, tags, anyOf) {
    let candidates = items.filter((item) =>
      anyOf ? tags.some((t) => matches(item, [t])) : matches(item, tags)
    );
    if (round.excludeSelf && from) {
      candidates = candidates.filter((c) => c.id !== from.id);
    }
    if (round.type !== 'relational' || !from) return candidates;
    if (!candidates.length) return [];
    const best = Math.min(...candidates.map((c) => distance(from, c)));
    // Everything a spectator could plausibly read as nearest, not just the one
    // that actually is. Exact equality was useless here -- two floats are never
    // equal -- so the old version only ever returned a single target and proved
    // a guarantee that did not survive contact with human eyesight.
    return candidates.filter((c) => distance(from, c) <= best * (1 + TOLERANCE));
  }

  function verifySet(set) {
    const items = set.items;
    const problems = [];
    const warnings = [];
    // The closest call a spectator has to make anywhere on any live path,
    // as a percentage. Reported so a set that only just passes is visible as
    // such rather than looking as safe as one that passes comfortably.
    let tightest = Infinity;
    const sizes = [items.length];
    const layers = [];

    // Only live items can start a path. Filler is on screen and a spectator can
    // certainly pick one to begin with, so it is included in the opening count
    // -- but a filler item matches no rule, so a spectator standing on one
    // still has somewhere to go on round 1 like everybody else.
    let reachable = items.slice();
    set.rounds.forEach((round, i) => {
      const next = new Map();
      let someoneStandsStill = false;

      reachable.forEach((from) => {
        const targets = allowedTargets(items, round, from);

        // Record how obvious the decision was from here.
        const pool = items
          .filter((i) => matches(i, round.requires) && !(round.excludeSelf && i.id === from.id))
          .map((i) => distance(from, i))
          .sort((a, b) => a - b);
        if (pool.length > 1 && pool[0] > 0) {
          tightest = Math.min(tightest, (pool[1] - pool[0]) / pool[0]);
        }
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

    // Filler exists only to fill the screen. If a rule can ever select one, it
    // is not filler any more -- it is an untested live item sitting in a field
    // of a hundred others, and the convergence proved above is meaningless.
    // Cheap to check and catastrophic to miss, so it is a hard failure.
    const strayFiller = layers.flat().filter((i) => i.kind === 'filler');
    if (strayFiller.length) {
      problems.push(
        `${strayFiller.length} filler item(s) are reachable (e.g. ${strayFiller[0].label}). ` +
        `Filler must match no instruction.`
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
      tolerance: TOLERANCE,
      tightestCallPct: isFinite(tightest) ? tightest * 100 : null,
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
  // Configs, kept separate from the built sets so the seed searcher can rebuild
  // either one at any seed without duplicating what a set is made of.
  const EMOJI_CONFIG = {
    id: 'emoji-green-finish',
    specs: EMOJI_SPECS,
    finish: GREEN_FINISH,
    cols: 8,
    rows: 5,          // 8 x 5 = 40 slots for 34 live emoji
    // 102 items on screen, funnels 13 -> 5 -> 6 -> 6 -> 1 onto the cactus, and
    // holds together even if every spectator misjudges every distance by 20%.
    //
    // Two constraints beyond convergence, both from things Shine hit in
    // testing. The finish must be UNMISTAKABLY green -- the avocado was the
    // target until he pointed out that it reads brown-pit-and-pale-flesh and
    // nobody would pick it. And every round's targets must exist on both sides
    // of the screen: all nine foods landed on the left half here, so anyone
    // starting on the right was dragged across the whole field on round 2.
    // Only 16 layouts in 60,000 satisfy the lot.
    seed: 67255,
    clientSlot: null,
    wantsLogos: false,
  };

  const LOGO_CONFIG = {
    id: 'logo-logo-finish',
    specs: LOGO_SPECS,
    finish: LOGO_FINISH,
    cols: COLS,
    rows: ROWS,
    seed: SEED,
    clientSlot: CLIENT_SLOT,
    wantsLogos: true,
  };

  const EMOJI_SET = buildSet(EMOJI_CONFIG);
  const LOGO_SET = buildSet(LOGO_CONFIG);

  /**
   * Which set a show runs, decided by whether a client logo is configured.
   * Host and audience both call this with the same value out of show state, so
   * they cannot disagree about which routine is on screen.
   */
  function setFor(clientLogoUrl) {
    return clientLogoUrl ? LOGO_SET : EMOJI_SET;
  }

  /**
   * The picture to draw at a given logo item.
   *
   * Every plate gets the same thing -- see the note at the top. CLIENT_SLOT
   * still matters, because it is the plate the room converges ON and the seed
   * search is pinned to it; it just no longer looks any different from the
   * others.
   */
  function logoSrc(item, clientLogoUrl) {
    if (item.kind !== 'logo') return null;
    return clientLogoUrl || DEFAULT_LOGO;
  }

  // globalThis rather than an export: this loads as a classic <script> in the
  // browser, and package.json sets "type": "module", so a CommonJS export would
  // never run under Node either. This is the one thing both agree on, which
  // also lets the verifier be run from the command line before a show.
  root.InteractiveSet = {
    EMOJI_SET, LOGO_SET, EMOJI_CONFIG, LOGO_CONFIG, setFor, buildSet, buildItems,
    verifySet, allowedTargets, matches, distance,
    EMOJI_SPECS, LOGO_SPECS, FILLER, PACK, OPENING_ROUNDS, LOGO_FINISH, GREEN_FINISH,
    setTolerance,
    BOX_W, BOX_H, SEED, CLIENT_SLOT, DEFAULT_LOGO, logoSrc,
  };
})(globalThis);
