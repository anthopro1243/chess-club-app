import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trackedScoresByDate, inPlayedOrder } from './trackedScores.js';
import { aggregateRaw, rubricScores, updatePlayerScores } from './scoring.js';

// A player who improves steadily: the oldest game is weak, the newest strong.
const N = 120;
const games = Array.from({ length: N }, (_, i) => ({
  gameId: `g${String(i).padStart(3, '0')}`,
  playedAt: new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString(),
  raw: { quietWinLoss: 14 - (12 * i) / (N - 1), quietMoves: 40, endgameWinLoss: 7 - (6 * i) / (N - 1), endgameMoves: 20 },
  movesPlayed: 60,
  movesCounted: 60,
  motifCounts: {},
}));

const shuffled = (list, seed) => {
  const out = [...list];
  let s = seed;
  for (let i = out.length - 1; i > 0; i -= 1) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

const strip = (t) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, { score: v.score, games: v.games, trend: v.trend }]));

test('tracked scores do not depend on the order games were analysed in', () => {
  const oldestFirst = strip(trackedScoresByDate(games).tracked);
  const newestFirst = strip(trackedScoresByDate([...games].reverse()).tracked);
  const random = strip(trackedScoresByDate(shuffled(games, 7)).tracked);
  assert.deepEqual(newestFirst, oldestFirst);
  assert.deepEqual(random, oldestFirst);
});

test('they are exactly what analysing the games in played order, one at a time, has always given', () => {
  let tracked = null;
  const seen = [];
  for (const g of games) {
    seen.push({ raw: g.raw, movesPlayed: g.movesPlayed, movesCounted: g.movesCounted, motifCounts: g.motifCounts });
    tracked = updatePlayerScores(tracked, rubricScores(aggregateRaw(seen)));
  }
  assert.deepEqual(strip(trackedScoresByDate(shuffled(games, 3)).tracked), strip(tracked));
});

test('why it is needed: feeding the running average newest-first lands somewhere else', () => {
  const reports = [...games].reverse().map((g) => ({ raw: g.raw, movesPlayed: 60, movesCounted: 60, motifCounts: {} }));
  let tracked = null;
  const seen = [];
  for (const r of reports) {
    seen.push(r);
    tracked = updatePlayerScores(tracked, rubricScores(aggregateRaw(seen)));
  }
  const byDate = trackedScoresByDate(games).tracked.positionalUnderstanding.score;
  assert.notEqual(tracked.positionalUnderstanding.score, byDate);
});

test('a game missing its date does not make the order unstable', () => {
  const undated = games.map((g, i) => (i % 10 === 0 ? { ...g, playedAt: null } : g));
  const a = strip(trackedScoresByDate(undated).tracked);
  const b = strip(trackedScoresByDate(shuffled(undated, 11)).tracked);
  assert.deepEqual(a, b);
});

test('inPlayedOrder: oldest first, ties broken by game id', () => {
  const order = inPlayedOrder([
    { gameId: 'b', playedAt: '2026-02-01' }, { gameId: 'z', playedAt: '2026-01-01' }, { gameId: 'a', playedAt: '2026-02-01' },
  ]).map((g) => g.gameId);
  assert.deepEqual(order, ['z', 'a', 'b']);
});
