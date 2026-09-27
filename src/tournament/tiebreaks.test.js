import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeStandings,
  modifiedMedianOf,
  normaliseTiebreakOrder,
  DEFAULT_TIEBREAK_ORDER,
  formatPoints,
  tiebreakLabel,
} from './tiebreaks.js';

/*
 * THE HAND-CHECKED SAMPLE. Six players, three rounds, with a forfeit, a
 * requested half-point bye and a pairing bye, so every unplayed-game rule is
 * exercised. Worked by hand before the code was run:
 *
 *   R1  A–D 1-0     E–B 0-1     C–F ½-½
 *   R2  B–A ½-½     D–C 0-1     F–E forfeit, F wins (1F-0F)
 *   R3  A–C 1-0     F–B 0-1     D full-point bye     E half-point bye
 *
 *   Final:  A 2½  B 2½  C 1½  F 1½  D 1  E ½
 *
 * Adjusted scores (a player's own unplayed rounds count as draws):
 *   A 2½  B 2½  C 1½  D ½ (bye → ½)  E 1 (forfeit ½ + half-bye ½)  F 1 (forfeit ½)
 *
 * Opponent lists (own unplayed round → 0):
 *   A: D ½, B 2½, C 1½      plus score → drop lowest  → MM 4     Solkoff 4½
 *   B: E 1, A 2½, F 1       plus score → drop lowest  → MM 3½    Solkoff 4½
 *   C: F 1, D ½, A 2½       even score → drop both    → MM 1     Solkoff 4
 *   F: C 1½, (forfeit) 0, B 2½  even  → drop both     → MM 1½    Solkoff 4
 *   D: A 2½, C 1½, (bye) 0  minus score → drop highest → MM 1½   Solkoff 4
 *   E: B 2½, (forfeit) 0, (half bye) 0  minus → drop highest → MM 0  Solkoff 2½
 *
 * Cumulative (running totals, less unplayed points once):
 *   A 1+1½+2½ = 5     B 5     C ½+1½+1½ = 3½     F ½+1½+1½ − 1 = 2½
 *   D 0+0+1 − 1 = 0   E 0+0+½ − ½ = 0
 * Opposition cumulative (played opponents only):
 *   A: D 0 + B 5 + C 3½ = 8½     B: E 0 + A 5 + F 2½ = 7½     C: F 2½ + D 0 + A 5 = 7½
 *   F: C 3½ + B 5 = 8½           D: A 5 + C 3½ = 8½           E: B 5
 * Sonneborn-Berger (beaten: full adjusted score; drawn: half):
 *   A: D ½ + B 2½/2 + C 1½ = 3¼  B: E 1 + A 2½/2 + F 1 = 3¼   C: F 1/2 + D ½ = 1
 *   F: C 1½/2 = ¾                D 0                           E 0
 *
 * Standings by the default order: A (MM 4) over B (MM 3½); F (MM 1½) over
 * C (MM 1); then D, E.
 */
const entrants = [
  { playerId: 'A', name: 'Ana', rating: 1600 },
  { playerId: 'B', name: 'Ben', rating: 1500 },
  { playerId: 'C', name: 'Cal', rating: 1400 },
  { playerId: 'D', name: 'Dee', rating: 1300 },
  { playerId: 'E', name: 'Eli', rating: 1200 },
  { playerId: 'F', name: 'Fay', rating: 1100 },
];
const g = (round, board, white, black, result) => ({ round, board, white, black, result, byeType: null });
const bye = (round, player, byeType) => ({ round, board: null, white: player, black: null, result: null, byeType });
const rows = [
  g(1, 1, 'A', 'D', '1-0'),
  g(1, 2, 'E', 'B', '0-1'),
  g(1, 3, 'C', 'F', '1/2-1/2'),
  g(2, 1, 'B', 'A', '1/2-1/2'),
  g(2, 2, 'D', 'C', '0-1'),
  g(2, 3, 'F', 'E', '1F-0F'),
  g(3, 1, 'A', 'C', '1-0'),
  g(3, 2, 'F', 'B', '0-1'),
  bye(3, 'D', 'full'),
  bye(3, 'E', 'half'),
];

const byId = (standings) => Object.fromEntries(standings.rows.map((r) => [r.playerId, r]));

test('hand-checked crosstable: scores and adjusted scores', () => {
  const s = byId(computeStandings({ entrants, rows }));
  assert.deepEqual(
    Object.fromEntries(Object.entries(s).map(([id, r]) => [id, [r.score, r.adjusted]])),
    { A: [2.5, 2.5], B: [2.5, 2.5], C: [1.5, 1.5], D: [1, 0.5], E: [0.5, 1], F: [1.5, 1] },
  );
});

test('hand-checked crosstable: every tiebreak for every player', () => {
  const s = byId(computeStandings({ entrants, rows }));
  const expected = {
    A: { modifiedMedian: 4, solkoff: 4.5, cumulative: 5, oppCumulative: 8.5, sonnebornBerger: 3.25 },
    B: { modifiedMedian: 3.5, solkoff: 4.5, cumulative: 5, oppCumulative: 7.5, sonnebornBerger: 3.25 },
    C: { modifiedMedian: 1, solkoff: 4, cumulative: 3.5, oppCumulative: 7.5, sonnebornBerger: 1 },
    D: { modifiedMedian: 1.5, solkoff: 4, cumulative: 0, oppCumulative: 8.5, sonnebornBerger: 0 },
    E: { modifiedMedian: 0, solkoff: 2.5, cumulative: 0, oppCumulative: 5, sonnebornBerger: 0 },
    F: { modifiedMedian: 1.5, solkoff: 4, cumulative: 2.5, oppCumulative: 8.5, sonnebornBerger: 0.75 },
  };
  for (const [id, values] of Object.entries(expected)) assert.deepEqual(s[id].tiebreaks, values, id);
});

test('hand-checked crosstable: default order ranks A, B, F, C, D, E', () => {
  const st = computeStandings({ entrants, rows });
  assert.equal(st.throughRound, 3);
  assert.deepEqual(st.order, DEFAULT_TIEBREAK_ORDER);
  assert.deepEqual(st.rows.map((r) => r.playerId), ['A', 'B', 'F', 'C', 'D', 'E']);
  assert.deepEqual(st.rows.map((r) => r.rank), [1, 2, 3, 4, 5, 6]);
  assert.ok(st.rows.every((r) => r.tied === false));
});

test('the order is configurable and changes the result', () => {
  // Solkoff ties C and F at 4; cumulative then prefers C (3½ against 2½,
  // because F's forfeit win earns no cumulative credit).
  const st = computeStandings({ entrants, rows, order: ['solkoff', 'cumulative'] });
  assert.deepEqual(st.rows.map((r) => r.playerId).slice(2, 4), ['C', 'F']);
  // A and B are level on Solkoff and cumulative: same rank, flagged as tied.
  assert.equal(st.rows[0].rank, 1);
  assert.equal(st.rows[1].rank, 1);
  assert.equal(st.rows[0].tied, true);
});

test('standings through an earlier round ignore later rows', () => {
  const st = byId(computeStandings({ entrants, rows, throughRound: 1 }));
  assert.equal(st.A.score, 1);
  assert.equal(st.C.score, 0.5);
  assert.equal(st.A.outcomes.length, 1);
});

test('by default a half-entered round does not count yet', () => {
  const partial = [...rows, g(4, 1, 'A', 'B', '1-0'), g(4, 2, 'C', 'D', null)];
  const st = computeStandings({ entrants, rows: partial });
  assert.equal(st.throughRound, 3);
  assert.equal(byId(st).A.score, 2.5);
});

test('a withdrawn opponent counts as drawing the rounds they missed', () => {
  const ents = [
    { playerId: 'A', name: 'A', rating: 1500 },
    { playerId: 'B', name: 'B', rating: 1400 },
    { playerId: 'W', name: 'W', rating: 1300, withdrawnFromRound: 2 },
    { playerId: 'C', name: 'C', rating: 1200 },
  ];
  const rs = [g(1, 1, 'A', 'W', '1-0'), g(1, 2, 'B', 'C', '1-0'), g(2, 1, 'A', 'B', '1/2-1/2'), bye(2, 'C', 'full')];
  const st = byId(computeStandings({ entrants: ents, rows: rs, throughRound: 2 }));
  // W lost round 1 and never played round 2: adjusted 0 + ½.
  assert.equal(st.W.adjusted, 0.5);
  assert.equal(st.W.score, 0);
  // A beat W and drew B (adjusted 1½): Solkoff ½ + 1½ = 2.
  assert.equal(st.A.tiebreaks.solkoff, 2);
  assert.equal(st.W.withdrawnFromRound, 2);
});

test('modifiedMedianOf: plus, minus and even scores; two dropped from nine rounds', () => {
  assert.equal(modifiedMedianOf([1, 2, 3], 2, 3), 5);
  assert.equal(modifiedMedianOf([1, 2, 3], 1, 3), 3);
  assert.equal(modifiedMedianOf([1, 2, 3, 4], 2, 4), 5);
  const nine = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  assert.equal(modifiedMedianOf(nine, 6, 9), 45 - 1 - 2);
  assert.equal(modifiedMedianOf(nine, 4.5, 9), 45 - 1 - 2 - 8 - 9);
  // Nothing left to sum is 0, not a negative slice.
  assert.equal(modifiedMedianOf([2], 0.5, 1), 0);
  assert.equal(modifiedMedianOf([], 0, 0), 0);
});

test('normaliseTiebreakOrder drops unknown and repeated ids; an empty order falls back', () => {
  assert.deepEqual(normaliseTiebreakOrder(['solkoff', 'coinFlip', 'solkoff', 'cumulative']), ['solkoff', 'cumulative']);
  assert.deepEqual(normaliseTiebreakOrder([]), DEFAULT_TIEBREAK_ORDER);
  assert.deepEqual(normaliseTiebreakOrder(null), DEFAULT_TIEBREAK_ORDER);
  assert.deepEqual(normaliseTiebreakOrder('solkoff'), DEFAULT_TIEBREAK_ORDER);
  assert.equal(tiebreakLabel('modifiedMedian'), 'Modified median');
});

test('no rows: everyone on zero, all tied, nothing throws', () => {
  const st = computeStandings({ entrants, rows: [] });
  assert.equal(st.throughRound, 0);
  assert.ok(st.rows.every((r) => r.score === 0 && r.rank === 1));
  assert.deepEqual(computeStandings().rows, []);
});

test('rows mentioning a non-entrant do not break the table', () => {
  const st = byId(computeStandings({ entrants: entrants.slice(0, 2), rows: [g(1, 1, 'A', 'Z', '1-0'), g(1, 2, 'B', 'Y', '0-1')] }));
  assert.equal(st.A.score, 1);
  // Z is unknown, so it contributes nothing rather than a guessed score.
  assert.equal(st.A.tiebreaks.solkoff, 0);
});

test('formatPoints prints halves the wall-chart way', () => {
  assert.equal(formatPoints(2.5), '2½');
  assert.equal(formatPoints(0.5), '½');
  assert.equal(formatPoints(3), '3');
  assert.equal(formatPoints(3.25), '3.25');
  assert.equal(formatPoints(null), '');
});
