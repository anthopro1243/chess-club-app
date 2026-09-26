import { test } from 'node:test';
import assert from 'node:assert/strict';
import { teamScore, countingPlayers, projectTeam, whatIf, rankAmong } from './teamScore.js';

const squad = [
  { id: 'a', score: 3 },
  { id: 'b', score: 2.5 },
  { id: 'c', score: 2 },
  { id: 'd', score: 2 },
  { id: 'e', score: 1.5 },
  { id: 'f', score: 0 },
];

test('teamScore: top 4 of 6 count', () => {
  assert.equal(teamScore(squad.map((p) => p.score), 4), 9.5);
  assert.equal(teamScore(squad.map((p) => p.score), 3), 7.5);
});

test('teamScore: fewer players than N just sums what there is', () => {
  assert.equal(teamScore([2, 1], 4), 3);
  assert.equal(teamScore([], 4), 0);
});

test('teamScore: NOT fooled by junk scores, and rejects a bad N', () => {
  assert.equal(teamScore([2, 'x', null, undefined], 4), 2);
  assert.throws(() => teamScore([1], 0));
  assert.throws(() => teamScore([1], 2.5));
});

test('countingPlayers: the top N, ties kept in input order', () => {
  assert.deepEqual(countingPlayers(squad, 4), ['a', 'b', 'c', 'd']);
});

test('projectTeam: floor, ceiling and what is still needed', () => {
  const p = projectTeam(squad, { n: 4, roundsPlayed: 3, totalRounds: 5, target: 12 });
  assert.equal(p.now, 9.5);
  assert.equal(p.remaining, 2);
  assert.equal(p.ceiling, 17.5); // 5 + 4.5 + 4 + 4
  assert.equal(p.needed, 2.5);
  assert.equal(p.reachable, true);
});

test('projectTeam: a withdrawn player cannot add points', () => {
  const p = projectTeam([{ id: 'a', score: 3, withdrawn: true }], { n: 1, roundsPlayed: 3, totalRounds: 5 });
  assert.equal(p.ceiling, 3);
});

test('projectTeam: an unreachable target is reported, not hidden', () => {
  const p = projectTeam([{ id: 'a', score: 0 }], { n: 1, roundsPlayed: 4, totalRounds: 5, target: 3 });
  assert.equal(p.reachable, false);
});

test('whatIf: a win for the 5th player can push them into the counting four', () => {
  const r = whatIf(squad, { e: 1, d: 0, c: 0 }, 4);
  assert.deepEqual(r.counting, ['a', 'b', 'e', 'c']);
  assert.equal(r.score, 10);
});

test('rankAmong: ties share a rank', () => {
  assert.deepEqual(rankAmong(9.5, [11, 9.5, 8]), { rank: 2, ahead: 1, tied: 1 });
  assert.deepEqual(rankAmong(12, []), { rank: 1, ahead: 0, tied: 0 });
});
