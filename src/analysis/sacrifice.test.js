import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isSoundSacrifice,
  annotateSacrifices,
  evalLoss,
  countSacrifices,
  SACRIFICE_CP_TOLERANCE,
} from './sacrifice.js';

/* ── fixtures ─────────────────────────────────────────────────────────────
 * Shapes match buildPlyRecords.js output. cpBefore/cpAfter are both in the
 * MOVER's point of view, which is what makes cpBefore - cpAfter the loss.
 */

/** A real blunder: a piece went, and the engine wanted a completely other move. */
const blunder = {
  ply: 31,
  side: 'w',
  san: 'Nd5',
  uci: 'c3d5',
  cpBefore: 40,
  mateBefore: null,
  cpAfter: -290,
  mateAfter: null,
  bestUci: 'g1f3',
  bestPv: ['g1f3', 'e7e5'],
  hangs: true,
  motifs: ['hangingPiece'],
};

/** A sound sacrifice: the piece went, and it is the engine's own top choice. */
const soundSac = {
  ply: 27,
  side: 'w',
  san: 'Bxh7+',
  uci: 'd3h7',
  cpBefore: 120,
  mateBefore: null,
  cpAfter: 380,
  mateAfter: null,
  bestUci: 'd3h7',
  bestPv: ['d3h7', 'g8h7', 'f3g5'],
  hangs: true,
  motifs: ['hangingPiece'],
};

/** A quiet developing move: nothing hangs, nothing to re-flag. */
const quietGood = {
  ply: 9,
  side: 'b',
  san: 'Re8',
  uci: 'f8e8',
  cpBefore: -15,
  mateBefore: null,
  cpAfter: -20,
  mateAfter: null,
  bestUci: 'f8e8',
  bestPv: ['f8e8', 'd2d4'],
  hangs: false,
  quiet: true,
  motifs: [],
};

/* ── the test itself ──────────────────────────────────────────────────────── */

test('a genuine blunder is not a sacrifice', () => {
  assert.equal(isSoundSacrifice({ ply: blunder }), false);
  assert.equal(evalLoss(blunder), 330, 'cpBefore - cpAfter, both from the mover POV');
  assert.ok(evalLoss(blunder) > SACRIFICE_CP_TOLERANCE);
});

test("a sacrifice the engine itself plays is sound, even though material left", () => {
  assert.equal(soundSac.hangs, true, 'SEE alone calls this a hung bishop');
  assert.equal(isSoundSacrifice({ ply: soundSac }), true);
});

test('a move the engine did not choose still passes if the eval barely moves', () => {
  const nearBest = {
    ...soundSac,
    uci: 'd3g6',
    bestUci: 'd3h7',
    cpBefore: 120,
    cpAfter: 120 - SACRIFICE_CP_TOLERANCE, // exactly at the tolerance
  };
  assert.equal(isSoundSacrifice({ ply: nearBest }), true, 'at the tolerance, still sound');

  const justOver = { ...nearBest, cpAfter: 120 - SACRIFICE_CP_TOLERANCE - 1 };
  assert.equal(isSoundSacrifice({ ply: justOver }), false, 'one cp past it, a blunder again');
});

test('a move that loses no material is never a sacrifice', () => {
  assert.equal(isSoundSacrifice({ ply: quietGood }), false);
  // Even a brilliant, engine-approved move: without hangs there is nothing given up.
  assert.equal(isSoundSacrifice({ ply: { ...quietGood, cpAfter: 900 } }), false);
});

test('mate scores are not mixed into the centipawn comparison', () => {
  const matingSac = {
    ...soundSac,
    uci: 'd1h5',
    bestUci: 'a1a2',
    cpBefore: 90,
    cpAfter: null,
    mateAfter: 3, // the sacrifice forces mate in 3
  };
  assert.equal(isSoundSacrifice({ ply: matingSac }), true);

  const gettingMated = { ...matingSac, mateAfter: -2 };
  assert.equal(isSoundSacrifice({ ply: gettingMated }), false, 'walking into mate is not a sac');

  const threwAwayMate = {
    ...soundSac,
    uci: 'd1h5',
    bestUci: 'a1a2',
    mateBefore: 2,
    cpBefore: null,
    cpAfter: 400,
    mateAfter: null,
  };
  assert.equal(isSoundSacrifice({ ply: threwAwayMate }), false, 'had mate, gave it up');
});

test('a missing evaluation is not quietly treated as agreement', () => {
  const unevaluated = { ...blunder, cpBefore: null, cpAfter: null, bestUci: null, bestPv: [] };
  assert.equal(evalLoss(unevaluated), null);
  assert.equal(isSoundSacrifice({ ply: unevaluated }), false);
  assert.equal(isSoundSacrifice({}), false);
  assert.equal(isSoundSacrifice(), false);
});

test('bestPv[0] stands in when bestUci is absent', () => {
  const noBestUci = { ...soundSac, bestUci: undefined, cpBefore: 120, cpAfter: -500 };
  assert.equal(isSoundSacrifice({ ply: noBestUci }), true, 'bestPv[0] === uci, engine agrees');
});

test('annotateSacrifices flips only the sound sacrifice', () => {
  const plies = [blunder, soundSac, quietGood];
  const out = annotateSacrifices(plies);

  assert.equal(out.length, 3);

  assert.equal(out[0].hangs, true, 'the blunder keeps its hung-piece flag');
  assert.equal(out[0].sacrifice, false);

  assert.equal(out[1].hangs, false, 'the sound sac stops counting against board vision');
  assert.equal(out[1].sacrifice, true);

  assert.equal(out[2].hangs, false, 'the quiet move was never hanging');
  assert.equal(out[2].sacrifice, false);
});

test('annotateSacrifices leaves every other field alone', () => {
  const [, out] = annotateSacrifices([blunder, soundSac]);
  for (const key of Object.keys(soundSac)) {
    if (key === 'hangs') continue;
    assert.deepEqual(out[key], soundSac[key], `field ${key} was rewritten`);
  }
  assert.equal(out.motifs, soundSac.motifs, 'nested values are shared, not cloned or dropped');
});

test('the input array and its records are never mutated', () => {
  const plies = [blunder, soundSac, quietGood];
  const before = JSON.parse(JSON.stringify(plies));

  const out = annotateSacrifices(plies);

  assert.notEqual(out, plies, 'a new array comes back');
  assert.deepEqual(JSON.parse(JSON.stringify(plies)), before, 'the caller keeps the SEE verdict');
  assert.equal(soundSac.hangs, true, 'the original record still says it hung');
  assert.equal('sacrifice' in soundSac, false, 'no field was bolted onto the input');
  assert.notEqual(out[1], soundSac, 'the flipped record is a copy');
});

test('annotateSacrifices survives an empty or absent game', () => {
  assert.deepEqual(annotateSacrifices([]), []);
  assert.deepEqual(annotateSacrifices(undefined), []);
  assert.deepEqual(annotateSacrifices(null), []);
});

test('countSacrifices totals the annotated plies, by side when asked', () => {
  const blackSac = { ...soundSac, side: 'b' };
  const out = annotateSacrifices([blunder, soundSac, blackSac, quietGood]);
  assert.equal(countSacrifices(out), 2);
  assert.equal(countSacrifices(out, 'w'), 1);
  assert.equal(countSacrifices(out, 'b'), 1);
  assert.equal(countSacrifices([]), 0);
});
