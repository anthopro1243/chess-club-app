/**
 * src/analysis/scoring.test.js
 *
 * Run with: node --test src/analysis/scoring.test.js
 * (or fold these assertions into whatever runner the repo already uses)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  winPercent,
  moveAccuracy,
  gameAccuracy,
  classifyPly,
  analyseGameForSide,
  rubricScores,
  aggregateRaw,
  updatePlayerScores,
  improvementPlan,
  normaliseAfter,
  curve,
  LOSS_ANCHORS,
  CATEGORY_KEYS,
  recalibrationReport,
} from './scoring.js';

const approx = (a, b, tol = 0.5) =>
  assert.ok(Math.abs(a - b) <= tol, `expected ${a} within ${tol} of ${b}`);

/* ───────────────────── conversions ───────────────────── */

test('winPercent: equal position is 50%', () => {
  approx(winPercent(0), 50, 0.001);
});

test('winPercent: symmetric around zero', () => {
  approx(winPercent(250) + winPercent(-250), 100, 0.001);
});

test('winPercent: a pawn up is a real but not decisive edge', () => {
  const wp = winPercent(100);
  assert.ok(wp > 56 && wp < 62, `pawn up read as ${wp}%`);
});

test('winPercent: mate is 100/0, never run through the sigmoid', () => {
  assert.equal(winPercent(null, 3), 100);
  assert.equal(winPercent(null, -1), 0);
  // a mate score must not be approximated as a big cp value
  assert.notEqual(winPercent(null, 3), winPercent(9999));
});

test('normaliseAfter flips the engine sign into the mover point of view', () => {
  assert.deepEqual(normaliseAfter({ cp: 120, mate: null }), { cp: -120, mate: null });
  assert.deepEqual(normaliseAfter({ cp: null, mate: 2 }), { cp: null, mate: -2 });
});

test('moveAccuracy: a perfect move is 100', () => {
  approx(moveAccuracy(55, 55), 100, 0.01);
});

test('moveAccuracy: decreases monotonically with win% lost', () => {
  const a = moveAccuracy(60, 58), b = moveAccuracy(60, 50), c = moveAccuracy(60, 30);
  assert.ok(a > b && b > c, `${a} > ${b} > ${c}`);
});

test('REGRESSION: centipawn loss must not be fed to the accuracy formula', () => {
  // The original bug: passing raw centipawns where win-percentage points were
  // expected. A 300cp swing is a real blunder but not a 0%-accuracy move.
  const correct = moveAccuracy(winPercent(50), winPercent(-250)); // ~28 win% lost
  const buggy = moveAccuracy(300, 0);                             // cp fed directly
  assert.ok(buggy < 1, 'the buggy call should collapse to ~0, proving the units differ');
  assert.ok(correct > 15 && correct < 45, `correct path gave ${correct}`);
});

test('gameAccuracy: one catastrophe still shows through many perfect moves', () => {
  const perfect = Array(39).fill(100);
  const wps = Array(40).fill(50);
  const clean = gameAccuracy(Array(40).fill(100), wps);
  const oneBlunder = gameAccuracy([...perfect, 8], wps);
  approx(clean, 100, 0.5);
  // ~12 points off a clean game: visible, but not a collapse. Matches how
  // Lichess weights a single catastrophe among otherwise sound moves.
  assert.ok(oneBlunder < 90 && oneBlunder > 70, `one blunder in 40 moves read as ${oneBlunder}`);
});

/* ───────────────────── classification ───────────────────── */

const ply = (over = {}) => ({
  ply: 10, fullmove: 5, side: 'w', san: 'Nf3', uci: 'g1f3', bestUci: 'g1f3',
  secondBestDelta: 40, cpBefore: 20, cpAfter: 20, mateBefore: null, mateAfter: null,
  inBook: false, quiet: true, phase: 'middlegame', tacticAvailable: false,
  hangs: false, missedFreeCapture: false, motifs: [], moveSeconds: 20,
  clockBefore: 900, ...over,
});

test('classify: playing the engine move is Best', () => {
  assert.equal(classifyPly(ply()).label, 'best');
});

test('classify: the only move that holds is credited, not just "best"', () => {
  assert.equal(classifyPly(ply({ secondBestDelta: 400 })).label, 'onlyMove');
});

test('classify: a 300cp drop from equality is a blunder', () => {
  const c = classifyPly(ply({ uci: 'a2a3', cpBefore: 20, cpAfter: -280 }));
  assert.equal(c.label, 'blunder');
  assert.ok(c.counted);
});

test('classify: a small drop is an inaccuracy, not a mistake', () => {
  const c = classifyPly(ply({ uci: 'a2a3', cpBefore: 30, cpAfter: -60 }));
  assert.equal(c.label, 'inaccuracy');
});

test('classify: book moves are excluded from the averages', () => {
  const c = classifyPly(ply({ inBook: true, uci: 'a2a3', cpAfter: -200 }));
  assert.equal(c.label, 'book');
  assert.equal(c.counted, false);
});

test('classify: a move in an already-lost position is not counted against you', () => {
  // This is the documented failure mode: down a queen, every legal move looks
  // like a "Mistake" to raw centipawn scoring. It should not touch the score.
  const c = classifyPly(ply({ uci: 'a2a3', cpBefore: -1400, cpAfter: -2000 }));
  assert.equal(c.label, 'forced');
  assert.equal(c.counted, false);
});

test('classify: missing a forced mate is flagged', () => {
  const c = classifyPly(ply({ uci: 'a2a3', mateBefore: 2, mateAfter: null, cpBefore: null, cpAfter: 300 }));
  assert.equal(c.missedMate, true);
});

/* ───────────────── synthetic games at known skill ───────────────── */

/**
 * Build a game where the player's moves lose `lossCp` on average, with the
 * given proportion of tactical positions going wrong.
 */
function syntheticGame({
  moves = 40, lossCp = 15, blunderEvery = 0, tacticEvery = 6, tacticFailRate = 0,
  oversights = 0, endgameFrom = 30, clock = true, base = 1800,
} = {}) {
  const plies = [];
  let clockLeft = base;
  for (let i = 0; i < moves; i++) {
    const isBlunder = blunderEvery && i > 0 && i % blunderEvery === 0;
    const drop = isBlunder ? 350 : lossCp;
    const tactic = tacticEvery ? i % tacticEvery === 0 : false;
    const failTactic = tactic && Math.random() < tacticFailRate;
    const seconds = 25;
    clockLeft = Math.max(5, clockLeft - seconds);
    plies.push({
      ply: i * 2 + 1, fullmove: i + 1, side: 'w',
      san: 'Xx', uci: drop === 0 ? 'g1f3' : 'a2a3', bestUci: 'g1f3',
      secondBestDelta: 50,
      cpBefore: 10, cpAfter: 10 - (failTactic ? 400 : drop),
      mateBefore: null, mateAfter: null,
      inBook: i < 4, quiet: !tactic,
      phase: i < 10 ? 'opening' : i < endgameFrom ? 'middlegame' : 'endgame',
      tacticAvailable: tactic,
      hangs: i < oversights, missedFreeCapture: false,
      motifs: isBlunder || failTactic ? ['hangingPiece'] : [],
      moveSeconds: clock ? seconds : null,
      clockBefore: clock ? clockLeft + seconds : null,
    });
    plies.push({ ...plies[plies.length - 1], side: 'b', ply: i * 2 + 2 });
  }
  return plies;
}

test('a clean game scores high accuracy; a sloppy one scores low', () => {
  const strong = analyseGameForSide(syntheticGame({ lossCp: 5 }), 'w',
    { baseSeconds: 1800, result: '1-0' });
  const weak = analyseGameForSide(syntheticGame({ lossCp: 60, blunderEvery: 5 }), 'w',
    { baseSeconds: 1800, result: '0-1' });
  assert.ok(strong.accuracy > weak.accuracy + 15,
    `strong ${strong.accuracy} vs weak ${weak.accuracy}`);
  assert.ok(strong.accuracy > 80, `strong game read as ${strong.accuracy}`);
  assert.ok(weak.counts.blunder >= 5, `weak game found ${weak.counts.blunder} blunders`);
});

test('rubric scores separate a strong player from a weak one', () => {
  const strong = rubricScores(analyseGameForSide(
    syntheticGame({ lossCp: 4, tacticFailRate: 0 }), 'w',
    { baseSeconds: 1800, result: '1-0' }).raw);
  const weak = rubricScores(analyseGameForSide(
    syntheticGame({ lossCp: 70, blunderEvery: 4, tacticFailRate: 1, oversights: 6 }), 'w',
    { baseSeconds: 1800, result: '0-1' }).raw);

  assert.ok(strong.positionalUnderstanding.score > weak.positionalUnderstanding.score + 10);
  assert.ok(strong.boardVision.score > weak.boardVision.score + 10);
  assert.ok(strong.tacticalVision.score > weak.tacticalVision.score + 10);
  for (const k of CATEGORY_KEYS) {
    const s = strong[k].score;
    assert.ok(s == null || (s >= 0 && s <= 100), `${k} out of range: ${s}`);
  }
});

test('notation is reported as unmeasured, never invented', () => {
  const s = rubricScores(analyseGameForSide(syntheticGame(), 'w', { baseSeconds: 1800 }).raw);
  assert.equal(s.notation.measured, false);
  assert.equal(s.notation.score, null);
  assert.match(s.notation.note, /Not measurable from PGN/);
});

/* ───────────────────── shrinkage ───────────────────── */

test('a tiny sample is pulled toward the prior instead of shouting', () => {
  const tiny = rubricScores({ endgameWinLoss: 40, endgameMoves: 3 });
  const big = rubricScores({ endgameWinLoss: 40, endgameMoves: 300 });
  assert.ok(tiny.endgameTechnique.score > big.endgameTechnique.score + 20,
    `tiny ${tiny.endgameTechnique.score} vs big ${big.endgameTechnique.score}`);
  assert.equal(tiny.endgameTechnique.confidence, 'low');
  assert.equal(big.endgameTechnique.confidence, 'high');
  assert.ok(big.endgameTechnique.score < 20, 'a large sample of awful endgames should score low');
});

test('shrinkage uses the player prior when one exists', () => {
  const neutral = rubricScores({ quietWinLoss: 3, quietMoves: 5 });
  const withPrior = rubricScores({ quietWinLoss: 3, quietMoves: 5 }, { priors: { positionalUnderstanding: 85 } });
  assert.ok(withPrior.positionalUnderstanding.score > neutral.positionalUnderstanding.score);
});

test('no observations means no score, not a zero', () => {
  const s = rubricScores({});
  assert.equal(s.endgameTechnique.score, null);
  assert.equal(s.endgameTechnique.measured, false);
});

/* ───────────────────── aggregation and tracking ───────────────────── */

test('aggregate weights each game by how much it actually measured', () => {
  const a = analyseGameForSide(syntheticGame({ moves: 40, lossCp: 5 }), 'w', { baseSeconds: 1800, result: '1-0' });
  const b = analyseGameForSide(syntheticGame({ moves: 12, lossCp: 80 }), 'w', { baseSeconds: 1800, result: '0-1' });
  const agg = aggregateRaw([a, b]);
  // win-PERCENTAGE points, not centipawns: the aggregate must land strictly
  // between the two games and nearer the one with more measured moves.
  assert.ok(agg.quietWinLoss > a.raw.quietWinLoss && agg.quietWinLoss < b.raw.quietWinLoss,
    `aggregate ${agg.quietWinLoss} not between ${a.raw.quietWinLoss} and ${b.raw.quietWinLoss}`);
  assert.ok(agg.quietMoves === a.raw.quietMoves + b.raw.quietMoves);
});

test('tracked scores move toward new results and report a trend', () => {
  let tracked = null;
  // ten weak games, then ten strong ones
  const weak = rubricScores({ quietWinLoss: 14, quietMoves: 60 });
  const strong = rubricScores({ quietWinLoss: 2, quietMoves: 60 });
  for (let i = 0; i < 10; i++) tracked = updatePlayerScores(tracked, weak);
  const low = tracked.positionalUnderstanding.score;
  for (let i = 0; i < 10; i++) tracked = updatePlayerScores(tracked, strong);
  const high = tracked.positionalUnderstanding.score;
  assert.ok(high > low + 10, `expected improvement, ${low} -> ${high}`);
  assert.ok(tracked.positionalUnderstanding.trend > 0, 'trend should be positive after improving');
  assert.equal(tracked.positionalUnderstanding.games, 20);
});

test('an unmeasured category in one game does not wipe the tracked score', () => {
  let tracked = updatePlayerScores(null, rubricScores({ endgameWinLoss: 3, endgameMoves: 60 }));
  const before = tracked.endgameTechnique.score;
  tracked = updatePlayerScores(tracked, rubricScores({}));  // a game with no endgame
  assert.equal(tracked.endgameTechnique.score, before);
});

/* ───────────────────── the advice ───────────────────── */

test('improvement plan puts the weak, high-leverage category first', () => {
  const scores = rubricScores({
    quietWinLoss: 2, quietMoves: 120,              // positional: strong
    tacticErrorRate: 0.55, tacticOpportunities: 60, // tactics: weak
    oversightRate: 0.2, oversightDenominator: 120,  // board vision: strong
  });
  const plan = improvementPlan(scores, { hangingPiece: 9, fork: 2 });
  assert.equal(plan.priorities[0].category, 'tacticalVision');
  assert.ok(plan.priorities[0].why.length > 20);
});

test('a dominant motif produces concrete advice and a Training theme to filter on', () => {
  const scores = rubricScores({ tacticErrorRate: 0.6, tacticOpportunities: 60 });
  const plan = improvementPlan(scores, { fork: 11, pin: 1 });
  const top = plan.priorities[0];
  assert.equal(top.practice.trainingTheme, 'Fork');
  assert.equal(top.occurrences, 11);
  assert.match(top.why, /fork/i);
});

test('low-confidence categories are not promoted over well-measured ones', () => {
  const scores = rubricScores({
    endgameWinLoss: 40, endgameMoves: 2,            // terrible but barely seen
    tacticErrorRate: 0.4, tacticOpportunities: 80,  // bad and well measured
  });
  const plan = improvementPlan(scores);
  assert.equal(plan.priorities[0].category, 'tacticalVision');
});

test('curve interpolates and clamps at both ends', () => {
  assert.equal(curve(-5, LOSS_ANCHORS), 100);
  assert.equal(curve(999, LOSS_ANCHORS), 0);
  const mid = curve(2.25, LOSS_ANCHORS); // halfway between [1.5,92] and [3,82]
  approx(mid, 87, 0.01);
});

/* ── recalibration readiness ─────────────────────────────────────────────
 * Not used in anger until roughly 50 analysed club games exist. Asserted here
 * so that when that day comes it is known to be callable, rather than
 * discovered to be broken at the moment it is first needed.
 */
test('recalibrationReport is callable and reports percentiles per metric', () => {
  const FIELDS = ['openingWinLoss', 'quietWinLoss', 'endgameWinLoss', 'tacticErrorRate',
    'oversightRate', 'timeTroubleRate', 'resilienceDelta'];
  const sample = Array.from({ length: 50 }, (_, i) => ({
    openingWinLoss: i * 0.2, quietWinLoss: i * 0.3, endgameWinLoss: i * 0.25,
    tacticErrorRate: i / 100, oversightRate: i * 0.4, timeTroubleRate: i / 200,
    resilienceDelta: i * 0.1 - 2,
  }));
  const report = recalibrationReport(sample);
  for (const f of FIELDS) {
    assert.ok(report[f], `${f} missing from the report`);
    assert.equal(report[f].n, 50);
    for (const p of ['p10', 'p25', 'p50', 'p75', 'p90']) {
      assert.equal(typeof report[f][p], 'number', `${f}.${p} should be numeric`);
    }
    assert.ok(report[f].p10 <= report[f].p50 && report[f].p50 <= report[f].p90, `${f} percentiles out of order`);
  }
});

test('recalibrationReport survives missing metrics without inventing numbers', () => {
  const report = recalibrationReport([{ openingWinLoss: 5 }, {}, { openingWinLoss: null }]);
  assert.equal(report.openingWinLoss.n, 1);
  assert.equal(report.quietWinLoss.n, 0);
  assert.equal(report.quietWinLoss.p50, null, 'no data must yield null, not 0');
});
