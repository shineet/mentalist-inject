/*
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
 * Generated 2026-08-18.
 */
(function (root) {
  'use strict';

  root.InteractiveLayout = {
    emoji: {
      // reveal lands on slot 19
      target: 19,
      slots: [
    [0.0330, 0.1274, 6.3, 'green'],
    [0.2693, 0.1063, -0.5, 'face+animal'],
    [0.5249, 0.1554, -8.6, 'thing'],
    [0.6631, 0.1063, 9.6, 'food'],
    [0.8232, 0.1006, -3.6, 'face+animal'],
    [1.0701, 0.0828, -1.7, 'food'],
    [1.2750, 0.0556, -12.8, 'thing'],
    [1.4586, 0.0735, 8.1, 'thing'],
    [0.1258, 0.3608, -5.3, 'face+animal'],
    [0.2846, 0.2826, -2.4, 'face'],
    [0.4543, 0.3041, -9.0, 'food'],
    [0.5954, 0.2611, 1.9, 'face+animal'],
    [0.8274, 0.2346, -9.2, 'thing'],
    [1.0485, 0.2585, -1.0, 'food'],
    [1.1611, 0.3140, -12.3, 'face+animal'],
    [1.3644, 0.2772, 12.1, 'food'],
    [0.0681, 0.5282, 1.3, 'face'],
    [0.3195, 0.4562, -4.0, 'face+animal'],
    [0.5005, 0.5473, 9.7, 'thing'],
    [0.6725, 0.5004, -2.5, 'green'],
    [0.8847, 0.5282, -13.6, 'thing'],
    [1.0316, 0.4350, -11.1, 'face+animal'],
    [1.1938, 0.4338, 2.8, 'food'],
    [1.4029, 0.4463, -7.4, 'thing'],
    [0.0600, 0.7800, 11.9, 'face+animal+green'],
    [0.2389, 0.7265, -7.1, 'thing'],
    [0.4822, 0.6639, -4.2, 'face+animal+green'],
    [0.6400, 0.6564, -10.2, 'food'],
    [0.8387, 0.6840, 6.2, 'face'],
    [1.0193, 0.7271, 0.1, 'food'],
    [1.2411, 0.7473, -9.4, 'face+animal'],
    [1.3728, 0.7285, -8.0, 'food'],
    [0.0403, 0.9006, -1.7, 'thing'],
    [0.2392, 0.9035, -11.6, 'thing'],
    [1.3937, 0.8739, -10.4, 'filler'],
    [1.4865, 0.2438, 4.2, 'filler'],
    [0.7882, 0.3902, -5.6, 'filler'],
    [0.2317, 0.5534, -10.6, 'filler'],
    [0.5755, 0.8416, 2.9, 'filler'],
    [1.2572, 0.2231, 0.4, 'filler'],
    [0.8949, 0.8297, -6.3, 'filler'],
    [0.6557, 0.9392, 7.3, 'filler'],
    [1.1548, 0.6382, -2.3, 'filler'],
    [0.4873, 0.9321, 5.8, 'filler'],
    [0.5709, 0.4215, 13.1, 'filler'],
    [0.3713, 0.8956, 0.8, 'filler'],
    [1.0012, 0.6015, 13.6, 'filler'],
    [1.0216, 0.9292, 7.1, 'filler'],
    [0.4078, 0.1735, 8.0, 'filler'],
    [1.1470, 0.8894, 8.3, 'filler'],
    [0.7631, 0.8805, 1.5, 'filler'],
    [0.1306, 0.2253, 11.0, 'green'],
    [0.3525, 0.5809, -3.4, 'filler'],
    [0.4162, 0.7790, -8.4, 'filler'],
    [1.3043, 0.5960, 8.5, 'filler'],
    [1.4775, 0.6570, -9.1, 'filler'],
    [0.9079, 0.3668, -1.3, 'filler'],
    [0.8512, 0.9664, -4.7, 'green'],
    [0.9587, 0.1510, -1.1, 'filler'],
    [0.4873, 0.0395, -12.1, 'filler'],
    [1.4826, 0.9620, 5.4, 'green'],
      ],
    },
    logo: {
      // reveal lands on slot 19
      target: 19,
      slots: [
    [0.0852, 0.0687, -7.7, 'face+animal'],
    [0.2621, 0.0732, -0.1, 'face+animal+green'],
    [0.4691, 0.0489, -8.3, 'food'],
    [0.6586, 0.0349, 6.1, 'face'],
    [0.8852, 0.0953, 0.0, 'logo'],
    [1.0721, 0.0736, 5.3, 'thing'],
    [1.2185, 0.0595, -8.7, 'food'],
    [1.3932, 0.0310, -13.2, 'food'],
    [0.1412, 0.2605, -13.2, 'face+animal+green'],
    [0.3130, 0.3054, -9.6, 'face+animal'],
    [0.4895, 0.2072, 4.5, 'thing'],
    [0.6147, 0.2288, -12.1, 'food'],
    [0.8924, 0.2131, -10.0, 'thing'],
    [1.0381, 0.2626, 5.5, 'food'],
    [1.1555, 0.2512, 0.0, 'logo'],
    [1.4155, 0.2597, -8.1, 'food'],
    [0.1113, 0.4349, 6.8, 'face'],
    [0.3088, 0.4692, 3.2, 'thing'],
    [0.4780, 0.4172, 10.4, 'thing'],
    [0.6016, 0.3972, 0.0, 'logo'],
    [0.8341, 0.4468, 5.9, 'face+animal'],
    [1.0198, 0.4623, 1.0, 'thing'],
    [1.1864, 0.3957, 7.2, 'thing'],
    [1.3781, 0.3723, 11.4, 'green'],
    [0.0899, 0.6106, 2.4, 'face+animal'],
    [0.2241, 0.5871, -9.2, 'food'],
    [0.5314, 0.5660, -6.4, 'face'],
    [0.6730, 0.6072, -9.1, 'thing'],
    [0.8500, 0.6070, 9.6, 'thing'],
    [1.0917, 0.5558, 11.3, 'face+animal'],
    [1.2397, 0.6125, -3.4, 'green'],
    [1.3611, 0.5479, -9.5, 'thing'],
    [0.0775, 0.7872, 0.0, 'face+animal'],
    [0.2420, 0.7650, 0.0, 'logo'],
    [0.5128, 0.7799, -4.7, 'food'],
    [0.6950, 0.7322, -3.8, 'face+animal'],
    [0.8635, 0.7242, -4.4, 'food'],
    [1.0317, 0.7224, 3.4, 'face+animal'],
    [1.1580, 0.7049, 0.0, 'logo'],
    [0.8259, 0.8964, -11.5, 'filler'],
    [1.0693, 0.8600, -6.2, 'filler'],
    [0.7615, 0.1731, -4.1, 'filler'],
    [0.1013, 0.9437, -2.2, 'filler'],
    [1.4831, 0.9104, -4.8, 'filler'],
    [0.4015, 0.9482, -9.5, 'filler'],
    [1.4234, 0.6717, -11.1, 'filler'],
    [1.3360, 0.7640, -7.9, 'filler'],
    [1.2901, 0.2100, -2.7, 'filler'],
    [0.7313, 0.3742, -10.3, 'filler'],
    [1.3345, 0.9254, -3.9, 'filler'],
    [0.5283, 0.9540, -5.7, 'filler'],
    [0.4488, 0.6506, -11.2, 'filler'],
    [0.9831, 0.9679, -0.3, 'filler'],
    [0.6269, 0.8771, -13.5, 'filler'],
    [1.4597, 0.1368, -1.8, 'filler'],
    [0.9455, 0.3623, -11.8, 'filler'],
    [0.2770, 0.8879, 7.7, 'filler'],
    [1.1640, 0.9550, 12.4, 'filler'],
      ],
    },
  };
})(globalThis);
