import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timeUse, timeUseHeadline, baseSecondsFromPgn, RUSHED_MIN_CLOCK_SECONDS } from './timeUse.js';

// Evaluations from White's point of view, as stored. A "good" move keeps the
// eval; a "blunder" drops it from +50 to -500.
const good = (ply, seconds, clockBefore, extra = {}) => ({
  ply, fullmove: Math.ceil(ply / 2), side: 'w', san: `m${ply}`, uci: 'e2e4', bestUci: 'e2e4',
  cpBefore: 30, cpAfter: 30, moveSeconds: seconds, clockBefore, phase: 'middlegame', ...extra,
});
const blunder = (ply, seconds, clockBefore) => ({
  ply, fullmove: Math.ceil(ply / 2), side: 'w', san: `b${ply}`, uci: 'a2a3', bestUci: 'e2e4',
  cpBefore: 50, cpAfter: -500, moveSeconds: seconds, clockBefore, phase: 'middlegame',
});

test('timeUse: a fast blunder with plenty of clock is flagged as rushed', () => {
  const r = timeUse([good(3, 20, 1700), blunder(5, 2, 1680), good(7, 30, 1678)], { baseSeconds: 1800 });
  assert.equal(r.available, true);
  assert.deepEqual(r.rushed.map((m) => m.ply), [5]);
  assert.match(timeUseHeadline(r), /under 5 seconds/);
});

test('timeUse: NOT rushed when the blunder took time, or the clock was low', () => {
  const slow = timeUse([blunder(5, 40, 1680)], { baseSeconds: 1800 });
  assert.equal(slow.rushed.length, 0);
  const low = timeUse([blunder(5, 2, RUSHED_MIN_CLOCK_SECONDS - 1)], { baseSeconds: 1800 });
  assert.equal(low.rushed.length, 0);
});

test('timeUse: a fast GOOD move is never flagged', () => {
  assert.equal(timeUse([good(3, 1, 1700)], { baseSeconds: 1800 }).rushed.length, 0);
});

test('timeUse: time trouble starts where the clock drops under 10% of the base', () => {
  const r = timeUse([good(3, 60, 900), good(5, 60, 200), good(7, 60, 150)], { baseSeconds: 1800 });
  // Trouble line = max(30, 10% of 1800) = 180 s. 200 is still above it; 150 at ply 7 (move 4) is the first below.
  assert.equal(r.troubleFromMove, 4);
});

test('timeUse: without clock data it says nothing', () => {
  const r = timeUse([{ ...good(3, null, null), moveSeconds: null }]);
  assert.equal(r.available, false);
  assert.equal(timeUseHeadline(r), null);
  assert.equal(timeUse(null).available, false);
});

test('timeUse: averages by phase and the longest think', () => {
  const r = timeUse([good(3, 10, 1700, { phase: 'opening' }), good(5, 50, 1690), good(7, 90, 1640)], { baseSeconds: 1800 });
  assert.equal(r.byPhase.opening.average, 10);
  assert.equal(r.byPhase.middlegame.average, 70);
  assert.equal(r.longest.seconds, 90);
  assert.equal(r.averageSeconds, 50);
});

test('baseSecondsFromPgn: reads the base, ignores daily and missing controls', () => {
  assert.equal(baseSecondsFromPgn('[TimeControl "600+5"]'), 600);
  assert.equal(baseSecondsFromPgn('[TimeControl "1800"]'), 1800);
  assert.equal(baseSecondsFromPgn('[TimeControl "1/259200"]'), null);
  assert.equal(baseSecondsFromPgn('[TimeControl "-"]'), null);
  assert.equal(baseSecondsFromPgn(''), null);
});
