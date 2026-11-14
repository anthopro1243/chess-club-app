import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activePlayerIdSet,
  onlyActiveRows,
  clubPlayerIdsOf,
  isRetiredOnlyGame,
  partitionQueueCandidates,
} from './retiredPlayers.js';

const retired = new Set(['CC-003']);

test('activePlayerIdSet: leaves out a player carrying deletedAt', () => {
  const ids = activePlayerIdSet([
    { playerId: 'CC-002' },
    { playerId: 'CC-003', deletedAt: '2026-09-25T00:00:00Z' },
  ]);
  assert.deepEqual([...ids], ['CC-002']);
});

test('activePlayerIdSet: tolerates junk input', () => {
  assert.equal(activePlayerIdSet(null).size, 0);
  assert.equal(activePlayerIdSet([null, {}, { playerId: '' }]).size, 0);
});

test('onlyActiveRows: drops a retired player\'s skill rows', () => {
  const rows = [
    { playerId: 'CC-002', category: 'tacticalVision', score: 60 },
    { playerId: 'CC-003', category: 'tacticalVision', score: 90 },
  ];
  const kept = onlyActiveRows(rows, new Set(['CC-002']));
  assert.deepEqual(kept.map((r) => r.playerId), ['CC-002']);
});

test('onlyActiveRows: NOT a filter at all without an id set (fails open to the old behaviour)', () => {
  const rows = [{ playerId: 'CC-003' }];
  assert.deepEqual(onlyActiveRows(rows, undefined), rows);
});

test('onlyActiveRows: a custom key works for table-shaped rows', () => {
  const rows = [{ player_id: 'CC-002' }, { player_id: 'CC-003' }];
  assert.equal(onlyActiveRows(rows, new Set(['CC-002']), 'player_id').length, 1);
});

test('clubPlayerIdsOf: reads both the store shape and the table shape', () => {
  assert.deepEqual(clubPlayerIdsOf({ whitePlayerId: 'CC-002', blackPlayerId: null }), ['CC-002']);
  assert.deepEqual(clubPlayerIdsOf({ white_player_id: 'CC-002', black_player_id: 'CC-003' }), ['CC-002', 'CC-003']);
  assert.deepEqual(clubPlayerIdsOf(null), []);
});

test('isRetiredOnlyGame: a retired player vs an online opponent is skipped', () => {
  assert.equal(isRetiredOnlyGame({ white_player_id: 'CC-003', black_player_id: null }, retired), true);
});

test('isRetiredOnlyGame: NOT skipped when an active member also played', () => {
  assert.equal(isRetiredOnlyGame({ white_player_id: 'CC-003', black_player_id: 'CC-002' }, retired), false);
});

test('isRetiredOnlyGame: NOT skipped when no club player is on the game', () => {
  assert.equal(isRetiredOnlyGame({ white_player_id: null, black_player_id: null }, retired), false);
});

test('isRetiredOnlyGame: NOT skipped when nobody is retired', () => {
  assert.equal(isRetiredOnlyGame({ white_player_id: 'CC-003' }, new Set()), false);
  assert.equal(isRetiredOnlyGame({ white_player_id: 'CC-003' }, undefined), false);
});

test('partitionQueueCandidates: keeps order and splits correctly', () => {
  const games = [
    { id: 'a', white_player_id: 'CC-003', black_player_id: null },
    { id: 'b', white_player_id: 'CC-002', black_player_id: null },
    { id: 'c', white_player_id: null, black_player_id: 'CC-003' },
    { id: 'd', white_player_id: 'CC-003', black_player_id: 'CC-002' },
  ];
  const { analyse, skip } = partitionQueueCandidates(games, retired);
  assert.deepEqual(analyse.map((g) => g.id), ['b', 'd']);
  assert.deepEqual(skip.map((g) => g.id), ['a', 'c']);
});
