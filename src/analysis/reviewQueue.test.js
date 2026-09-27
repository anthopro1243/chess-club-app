import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewQueueFor, clubReviewQueue, isOverTheBoard } from './reviewQueue.js';

const NOW = Date.parse('2026-10-26T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const at = (daysAgo) => new Date(NOW - daysAgo * DAY).toISOString();
const game = (id, daysAgo, extra = {}) => ({
  id, playedAt: at(daysAgo), whitePlayerId: 'CC-010', blackPlayerId: '', whiteName: 'Ana', blackName: 'Opponent', mode: 'online', ...extra,
});
const analysis = (gameId, blunder, mistake = 0, playerId = 'CC-010') => ({ gameId, playerId, counts: { blunder, mistake } });

test('reviewQueueFor: games played in person first, then the online games with the most big mistakes', () => {
  const games = [
    game('online-1', 3),
    game('online-3', 5),
    game('otb', 2, { event: 'DISD Fall', round: '2', mode: 'otb' }),
    game('clean', 1),
  ];
  const analyses = [analysis('online-1', 1), analysis('online-3', 3), analysis('clean', 0, 0)];
  const queue = reviewQueueFor('CC-010', { games, analyses, now: NOW });
  assert.deepEqual(queue.map((q) => q.gameId), ['otb', 'online-3', 'online-1']);
  assert.equal(queue[0].reason, 'Played in person at DISD Fall, round 2');
  assert.equal(queue[1].reason, '3 big mistakes');
});

test('reviewQueueFor: reviewed, deleted, old and other players\' games stay out (negative case)', () => {
  const games = [
    game('reviewed', 2, { mode: 'otb', reviewedAt: at(1) }),
    game('deleted', 2, { mode: 'otb', deletedAt: at(1) }),
    game('old', 90, { mode: 'otb' }),
    game('theirs', 2, { mode: 'otb', whitePlayerId: 'CC-011' }),
  ];
  assert.deepEqual(reviewQueueFor('CC-010', { games, now: NOW }), []);
  assert.deepEqual(reviewQueueFor('', { games, now: NOW }), []);
});

test('isOverTheBoard: scoresheet tags (event, round, board) mark a game played in person', () => {
  assert.equal(isOverTheBoard({ event: 'X' }), true);
  assert.equal(isOverTheBoard({ round: '3' }), true);
  assert.equal(isOverTheBoard({ board: 4 }), true);
  assert.equal(isOverTheBoard({ mode: 'human', board: null }), false);
  assert.equal(isOverTheBoard({ mode: 'otb' }), true);
  assert.equal(isOverTheBoard({ mode: 'online' }), false);
});

test('clubReviewQueue: players with most waiting first; players with nothing left out', () => {
  const games = [
    game('a', 1, { mode: 'otb' }),
    game('b', 1, { mode: 'otb', whitePlayerId: 'CC-011' }),
    game('c', 2, { mode: 'otb', whitePlayerId: 'CC-011' }),
  ];
  const players = [{ playerId: 'CC-010', name: 'Ana' }, { playerId: 'CC-011', name: 'Ben' }, { playerId: 'CC-012', name: 'Cal' }];
  const rows = clubReviewQueue(players, { games, now: NOW });
  assert.deepEqual(rows.map((r) => [r.name, r.items.length]), [['Ben', 2], ['Ana', 1]]);
});
