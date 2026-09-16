import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPuzzleState, review, dueNow, reviewSummary,
  LADDER_DAYS, MIN_EASE, MAX_EASE, START_EASE, MAX_INTERVAL_DAYS,
} from './spacedRepetition.js';

const T0 = Date.parse('2026-09-15T12:00:00Z');
const DAY = 86400000;
const daysBetween = (iso, from = T0) => Math.round((Date.parse(iso) - from) / DAY);

test('a new puzzle is due immediately', () => {
  const s = newPuzzleState(T0);
  assert.equal(Date.parse(s.dueAt), T0);
  assert.equal(s.reps, 0);
  assert.equal(s.ease, START_EASE);
  assert.equal(s.retired, false);
});

test("the audit's ladder: two days, then a week, then a month", () => {
  let s = null;
  s = review(s, 'good', T0);
  assert.equal(daysBetween(s.dueAt), LADDER_DAYS[0], 'first correct answer -> 2 days');
  assert.equal(s.intervalDays, 2);

  s = review(s, 'good', T0);
  assert.equal(daysBetween(s.dueAt), LADDER_DAYS[1], 'second -> a week');

  s = review(s, 'good', T0);
  assert.equal(daysBetween(s.dueAt), LADDER_DAYS[2], 'third -> a month');
  assert.equal(s.reps, 3);
});

test('past the ladder the interval grows by the ease factor', () => {
  let s = null;
  for (let i = 0; i < 3; i += 1) s = review(s, 'good', T0);
  const before = s.intervalDays;
  s = review(s, 'good', T0);
  assert.equal(s.intervalDays, Math.round(before * s.ease));
  assert.ok(s.intervalDays > before);
});

test('getting it wrong sends it back to tomorrow, not to a week', () => {
  // The whole point of an own-game puzzle is the position you keep failing.
  // Pushing a failure further away would be exactly backwards.
  let s = null;
  for (let i = 0; i < 3; i += 1) s = review(s, 'good', T0);
  assert.equal(s.intervalDays, 30);

  s = review(s, 'again', T0);
  assert.equal(s.intervalDays, 1, 'a lapse returns tomorrow');
  assert.equal(s.reps, 0, 'the ladder restarts');
  assert.equal(s.lapses, 1);
  assert.ok(s.ease < START_EASE, 'a lapse makes the position harder, so it recurs sooner');
});

test('ease is clamped at both ends', () => {
  let s = newPuzzleState(T0);
  for (let i = 0; i < 20; i += 1) s = review(s, 'again', T0);
  assert.equal(s.ease, MIN_EASE);

  let e = newPuzzleState(T0);
  for (let i = 0; i < 20; i += 1) e = review(e, 'easy', T0);
  assert.ok(e.ease <= MAX_EASE);
});

test('intervals never exceed the cap', () => {
  let s = null;
  for (let i = 0; i < 30; i += 1) s = review(s, 'easy', T0);
  assert.ok(s.intervalDays <= MAX_INTERVAL_DAYS);
});

test('hard stretches the interval only slightly', () => {
  let s = null;
  s = review(s, 'good', T0);          // 2 days
  const before = s.intervalDays;
  s = review(s, 'hard', T0);
  assert.ok(s.intervalDays >= before, 'hard should not shorten the interval');
  assert.ok(s.intervalDays < before * 2, 'nor double it');
  assert.ok(s.ease < START_EASE);
});

test('an unknown grade is refused rather than silently treated as good', () => {
  assert.throws(() => review(null, 'brilliant', T0), /unknown grade/);
});

test('dueNow returns only live, due puzzles, soonest first', () => {
  const puzzles = [
    { id: 1, dueAt: new Date(T0 - 5 * DAY).toISOString(), retired: false },
    { id: 2, dueAt: new Date(T0 + 5 * DAY).toISOString(), retired: false },
    { id: 3, dueAt: new Date(T0 - 1 * DAY).toISOString(), retired: false },
    { id: 4, dueAt: new Date(T0 - 9 * DAY).toISOString(), retired: true },
  ];
  const due = dueNow(puzzles, T0);
  assert.deepEqual(due.map((p) => p.id), [1, 3]);
});

test('reviewSummary counts honestly and reports the next due date', () => {
  const puzzles = [
    { dueAt: new Date(T0 - DAY).toISOString(), retired: false },
    { dueAt: new Date(T0 + 3 * DAY).toISOString(), retired: false },
    { dueAt: new Date(T0 + 9 * DAY).toISOString(), retired: false },
    { dueAt: new Date(T0).toISOString(), retired: true },
  ];
  const s = reviewSummary(puzzles, T0);
  assert.equal(s.total, 4);
  assert.equal(s.active, 3);
  assert.equal(s.due, 1);
  assert.equal(s.retired, 1);
  assert.equal(daysBetween(s.nextDueAt), 3);
});

test('a review is a pure function of its inputs', () => {
  const s = newPuzzleState(T0);
  const copy = { ...s };
  review(s, 'good', T0);
  assert.deepEqual(s, copy, 'review must not mutate the state it is handed');
});
