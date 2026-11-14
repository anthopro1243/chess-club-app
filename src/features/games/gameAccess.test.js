import test from 'node:test';
import assert from 'node:assert/strict';
import { gameEntryProblem } from './gameAccess.js';

test('gameEntryProblem: coach, own game, guest game and local mode are fine', () => {
  assert.equal(gameEntryProblem({ isCoach: true, whitePlayerId: 'CC-1', blackPlayerId: 'CC-2' }), null);
  assert.equal(gameEntryProblem({ myPlayerId: 'CC-1', whitePlayerId: 'CC-2', blackPlayerId: 'CC-1' }), null);
  assert.equal(gameEntryProblem({ myPlayerId: 'CC-1' }), null);
  assert.equal(gameEntryProblem({ cloud: false, whitePlayerId: 'CC-2', blackPlayerId: 'CC-3' }), null);
});

test('gameEntryProblem: a member logging two classmates is told why (negative case)', () => {
  assert.match(gameEntryProblem({ myPlayerId: 'CC-1', whitePlayerId: 'CC-2', blackPlayerId: 'CC-3' }), /games you played in/);
  assert.match(gameEntryProblem({ myPlayerId: null, whitePlayerId: 'CC-2' }), /games you played in/);
});
