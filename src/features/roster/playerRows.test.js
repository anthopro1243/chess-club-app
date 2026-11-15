import test from 'node:test';
import assert from 'node:assert/strict';
import { toRowPatch, applyRealtimeChange, applyPuzzleOutcome, fromRow, mistakesSolvedCount } from './playerRows.js';

const row = (id, extra = {}) => ({ player_id: id, name: `Player ${id}`, ...extra });

test('toRowPatch: only the named fields go to the database', () => {
  const player = fromRow(row('CC-001', { rubric: { tactics: 7 }, goal: 'Win', coach_notes: 'x' }));
  assert.deepEqual(toRowPatch(player, ['rubric']), { rubric: { tactics: 7 } });
  assert.deepEqual(toRowPatch(player, ['puzzleStats']), { puzzle_stats: player.puzzleStats });
  // The primary key and unknown fields are never part of a patch.
  assert.deepEqual(toRowPatch(player, ['playerId', 'nonsense']), {});
});

test('applyRealtimeChange: an update replaces just that row', () => {
  const players = [fromRow(row('CC-001')), fromRow(row('CC-002'))];
  const next = applyRealtimeChange(players, { eventType: 'UPDATE', new: row('CC-002', { name: 'Renamed' }) });
  assert.equal(next.length, 2);
  assert.equal(next[1].name, 'Renamed');
  assert.equal(next[0], players[0]);
});

test('applyRealtimeChange: inserts sort in, soft-deletes and deletes leave', () => {
  let players = [fromRow(row('CC-003'))];
  players = applyRealtimeChange(players, { eventType: 'INSERT', new: row('CC-001') });
  assert.deepEqual(players.map((p) => p.playerId), ['CC-001', 'CC-003']);
  players = applyRealtimeChange(players, { eventType: 'UPDATE', new: row('CC-001', { deleted_at: '2026-01-01' }) });
  assert.deepEqual(players.map((p) => p.playerId), ['CC-003']);
  players = applyRealtimeChange(players, { eventType: 'DELETE', new: {}, old: { player_id: 'CC-003' } });
  assert.deepEqual(players, []);
});

test('applyPuzzleOutcome: solved adds the id once, rating moves only when rated', () => {
  const at = '2026-11-13T00:00:00.000Z';
  let stats = applyPuzzleOutcome(null, { puzzleId: 'a', solved: true, at });
  assert.deepEqual(stats.solvedIds, ['a']);
  assert.equal(stats.rating, undefined);
  stats = applyPuzzleOutcome(stats, { puzzleId: 'a', solved: true, at });
  assert.deepEqual(stats.solvedIds, ['a']);
  assert.equal(stats.attempts, 2);
  stats = applyPuzzleOutcome(stats, {
    puzzleId: 'b',
    solved: false,
    rated: { opponentRating: 1200, opponentRd: 60, score: 0 },
    at,
  });
  assert.equal(stats.rating.count, 1);
  assert.ok(stats.rating.rating < 1500);
  assert.deepEqual(stats.solvedIds, ['a']);
});

test('mistakesSolvedCount counts only own-game positions, not retired library puzzle ids', () => {
  assert.equal(mistakesSolvedCount({ puzzleStats: { solvedIds: ['00abc', 'own:12', 'own:r8/8/8 w - -'] } }), 2);
  assert.equal(mistakesSolvedCount({ puzzleStats: { solvedIds: [] } }), 0);
  assert.equal(mistakesSolvedCount({}), 0);
  assert.equal(mistakesSolvedCount(null), 0);
});
