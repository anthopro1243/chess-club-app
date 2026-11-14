import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planClubSync, backoffAfter429, clearBackoff, BACKOFF_BASE_MS, CLUB_SYNC_EVERY_MS } from './clubSync.js';

const NOW = Date.parse('2026-09-26T22:00:00Z');
const ago = (ms) => new Date(NOW - ms).toISOString();
const member = (id, connections) => ({ playerId: id, connections });

test('planClubSync: never-synced first, then oldest; fresh ones skipped', () => {
  const players = [
    member('CC-010', { chesscom: { username: 'a', lastSyncedAt: ago(CLUB_SYNC_EVERY_MS + 5) } }),
    member('CC-011', { lichess: { username: 'b', lastSyncedAt: null } }),
    member('CC-012', { chesscom: { username: 'c', lastSyncedAt: ago(60 * 1000) } }),
    member('CC-013', { chesscom: { username: 'd', lastSyncedAt: ago(CLUB_SYNC_EVERY_MS * 3) } }),
  ];
  assert.deepEqual(planClubSync(players, { now: NOW }), [
    { playerId: 'CC-011', platform: 'lichess' },
    { playerId: 'CC-013', platform: 'chesscom' },
    { playerId: 'CC-010', platform: 'chesscom' },
  ]);
});

test('planClubSync: NOT retired members, unlinked accounts, other platforms, or the coach\'s own row', () => {
  const players = [
    { ...member('CC-003', { chesscom: { username: 'x' } }), deletedAt: '2026-09-25' },
    member('CC-014', { chesscom: { username: '' } }),
    member('CC-015', { uscf: { id: '12345678' } }),
    member('CC-002', { lichess: { username: 'coach' } }),
  ];
  assert.deepEqual(planClubSync(players, { now: NOW, skipPlayerId: 'CC-002' }), []);
});

test('planClubSync: a platform backing off is skipped, the other still syncs', () => {
  const players = [member('CC-020', { chesscom: { username: 'a' }, lichess: { username: 'a' } })];
  const plan = planClubSync(players, { now: NOW, pausedUntil: { chesscom: NOW + 1000 } });
  assert.deepEqual(plan, [{ playerId: 'CC-020', platform: 'lichess' }]);
});

test('planClubSync: capped at the batch size', () => {
  const players = Array.from({ length: 30 }, (_, i) => member(`CC-${100 + i}`, { chesscom: { username: `u${i}` } }));
  assert.equal(planClubSync(players, { now: NOW, batch: 8 }).length, 8);
});

test('backoffAfter429: one minute, then two, then four; per platform', () => {
  let s = backoffAfter429({}, 'chesscom', NOW);
  assert.equal(s.pausedUntil.chesscom, NOW + BACKOFF_BASE_MS);
  s = backoffAfter429(s, 'chesscom', NOW);
  assert.equal(s.pausedUntil.chesscom, NOW + 2 * BACKOFF_BASE_MS);
  s = backoffAfter429(s, 'lichess', NOW);
  assert.equal(s.pausedUntil.lichess, NOW + BACKOFF_BASE_MS);
  s = clearBackoff(s, 'chesscom');
  assert.equal(s.strikes.chesscom, undefined);
  assert.equal(s.strikes.lichess, 1);
});
