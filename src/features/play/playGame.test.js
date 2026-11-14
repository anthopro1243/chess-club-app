import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGame, replay, materialSummary } from './playGame.js';

test('buildGame replays saved moves and stops at the first bad one', () => {
  const game = buildGame([
    { from: 'e2', to: 'e4' },
    { from: 'e7', to: 'e5' },
    { from: 'e1', to: 'e8' }, // corrupt storage
    { from: 'g1', to: 'f3' },
  ]);
  assert.equal(game.moveHistory().length, 2);
  assert.equal(buildGame('nonsense').moveHistory().length, 0);
});

test('replay rebuilds the position after a given ply', () => {
  const full = buildGame([
    { from: 'e2', to: 'e4' },
    { from: 'd7', to: 'd5' },
    { from: 'e4', to: 'd5' },
  ]);
  const moves = full.moveHistory({ verbose: true });
  assert.equal(replay(moves, 2).moveHistory().length, 2);
  assert.equal(replay(moves, 3).fen(), full.fen());
});

test('materialSummary: who captured what and the balance', () => {
  const game = buildGame([
    { from: 'e2', to: 'e4' },
    { from: 'd7', to: 'd5' },
    { from: 'e4', to: 'd5' },
  ]);
  const { captured, score } = materialSummary(game);
  assert.deepEqual(captured.w, ['p']);
  assert.deepEqual(captured.b, []);
  assert.equal(score, 1);
});
