import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HISTORY_DEPTH, needsHistoryTopUp, topUpIsComplete, newHistoryGames,
} from './historyTopUp.js';

const linked = { username: 'kid' };

test('the depth is one number: about 200 recent games', () => {
  assert.equal(HISTORY_DEPTH, 200);
});

test('needsHistoryTopUp: a member linked before this change, with ~50 games, needs it', () => {
  assert.equal(needsHistoryTopUp({ connection: { ...linked, lastGameAt: '2026-09-01' }, storedCount: 50 }), true);
});

test('needsHistoryTopUp: a brand-new link (nothing stored yet) needs it', () => {
  assert.equal(needsHistoryTopUp({ connection: linked, storedCount: 0 }), true);
});

test('needsHistoryTopUp: an account that is already deep enough does not', () => {
  assert.equal(needsHistoryTopUp({ connection: linked, storedCount: HISTORY_DEPTH }), false);
  assert.equal(needsHistoryTopUp({ connection: linked, storedCount: 480 }), false);
});

test('needsHistoryTopUp: a short account is not asked again once the job was finished', () => {
  // 120 games in total: the count stays below 200 forever, the note is what stops the loop.
  const done = { ...linked, historyToppedUpAt: '2026-11-14T10:00:00Z' };
  assert.equal(needsHistoryTopUp({ connection: done, storedCount: 120 }), false);
});

test('needsHistoryTopUp: nothing linked, nothing to do', () => {
  assert.equal(needsHistoryTopUp({ connection: { username: '' }, storedCount: 0 }), false);
  assert.equal(needsHistoryTopUp({ connection: null, storedCount: 0 }), false);
});

test('topUpIsComplete: full depth, or the site ran out; a cut-short walk is not complete', () => {
  assert.equal(topUpIsComplete({ fetchedCount: 200, reachedEnd: false }), true);
  assert.equal(topUpIsComplete({ fetchedCount: 120, reachedEnd: true }), true);
  assert.equal(topUpIsComplete({ fetchedCount: 90, reachedEnd: false }), false);
});

test('newHistoryGames: leaves out what the archive has, newest first (safe to run twice)', () => {
  const fetched = [
    { externalId: 'a', playedAt: '2026-01-01T00:00:00Z' },
    { externalId: 'b', playedAt: '2026-03-01T00:00:00Z' },
    { externalId: 'c', playedAt: '2026-02-01T00:00:00Z' },
  ];
  assert.deepEqual(newHistoryGames(fetched, new Set(['c'])).map((g) => g.externalId), ['b', 'a']);
  assert.deepEqual(newHistoryGames(fetched, new Set(['a', 'b', 'c'])), []);
});
