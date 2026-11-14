import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  archivedName, isArchived, archivedPlayerPatch, scrubPgnName, archivedGameUpdates, archivePlan, confirmsArchive,
} from './graduateArchive.js';

const ANA = {
  playerId: 'CC-010',
  name: 'Ana Test',
  guardianEmail: 'parent@example.com',
  connections: { chesscom: { username: 'anaplays' }, uscf: { id: '30412345' } },
  goal: 'Reach 1200',
  style: 'Attacking',
  trainingFocus: 'Endgames',
  coachNotes: 'Works hard',
  ratings: { uscf: 1100 },
  clubRating: { rating: 1150, count: 20 },
  grade: '12',
};

const PGN = '[Event "Club"]\n[White "Ana Test"]\n[Black "Ben Test"]\n[Result "1-0"]\n\n1. e4 e5 1-0';

test('archivedPlayerPatch: removes the name, accounts, US Chess ID, guardian email, goal and notes', () => {
  const patch = archivedPlayerPatch(ANA);
  assert.equal(patch.name, 'Graduate CC-010');
  assert.deepEqual(patch.connections, {});
  for (const key of ['guardianEmail', 'goal', 'style', 'trainingFocus', 'coachNotes']) assert.equal(patch[key], '');
});

test('archivedPlayerPatch: keeps ratings and stats by not touching them (negative case)', () => {
  const patch = archivedPlayerPatch(ANA);
  for (const key of ['ratings', 'clubRating', 'grade', 'ratingHistory', 'puzzleStats', 'playerId']) {
    assert.ok(!(key in patch), `${key} must be kept`);
  }
});

test('scrubPgnName: replaces only the matching header, not the opponent or the moves', () => {
  const out = scrubPgnName(PGN, 'Ana Test', 'Graduate CC-010');
  assert.match(out, /\[White "Graduate CC-010"\]/);
  assert.match(out, /\[Black "Ben Test"\]/);
  assert.match(out, /1\. e4 e5 1-0/);
  assert.equal(scrubPgnName(PGN, 'Nobody', 'X'), PGN);
  assert.equal(scrubPgnName('', 'Ana Test', 'X'), '');
});

test('archivedGameUpdates: only this member\'s games, only their side', () => {
  const games = [
    { id: 'g1', whitePlayerId: 'CC-010', blackPlayerId: 'CC-011', whiteName: 'Ana Test', blackName: 'Ben Test', pgn: PGN },
    { id: 'g2', whitePlayerId: 'CC-011', blackPlayerId: 'CC-012', whiteName: 'Ben Test', blackName: 'Cal', pgn: '' },
  ];
  const updates = archivedGameUpdates(ANA, games);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].id, 'g1');
  assert.equal(updates[0].whiteName, 'Graduate CC-010');
  assert.ok(!('blackName' in updates[0]), 'the opponent keeps their name');
  assert.match(updates[0].pgn, /\[Black "Ben Test"\]/);
});

test('archivePlan / isArchived / confirmsArchive', () => {
  const plan = archivePlan(ANA, []);
  assert.equal(plan.label, archivedName('CC-010'));
  assert.equal(archivePlan(null), null);
  assert.equal(isArchived({ playerId: 'CC-010', name: 'Graduate CC-010' }), true);
  assert.equal(isArchived(ANA), false);
  assert.equal(confirmsArchive(ANA, '  ana test '), true);
  assert.equal(confirmsArchive(ANA, 'Ana'), false, 'a partial name does not confirm');
  assert.equal(confirmsArchive(ANA, ''), false);
});
