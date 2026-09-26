import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from '../engine/chess.js';
import {
  POSITIONS, BANDS, bandForRating, positionsForBand, positionById, judge, passedDrills, bandProgress, attemptIdFor,
} from './endgames.js';

test('every drill is a legal, unfinished position with the player to move', () => {
  for (const p of POSITIONS) {
    const chess = new Chess(p.fen);
    assert.ok(chess.moves().length > 0, `${p.id} has moves`);
    assert.equal(chess.isGameOver(), false, `${p.id} is not over`);
    assert.ok(['win', 'draw'].includes(p.goal));
    assert.ok(BANDS.some((b) => b.key === p.band));
  }
});

test('every band has at least two drills and ids are unique', () => {
  for (const b of BANDS) assert.ok(positionsForBand(b.key).length >= 2, b.key);
  assert.equal(new Set(POSITIONS.map((p) => p.id)).size, POSITIONS.length);
});

test('bandForRating: Silman order, unknown starts at the beginning', () => {
  assert.equal(bandForRating(650), 'basic');
  assert.equal(bandForRating(999), 'basic');
  assert.equal(bandForRating(1000), 'opposition');
  assert.equal(bandForRating(1250), 'kingpawn');
  assert.equal(bandForRating(1500), 'rook');
  assert.equal(bandForRating(2100), 'rook');
  assert.equal(bandForRating(null), 'basic');
});

test('judge: delivering mate passes a mate drill', () => {
  const position = positionById('kqk-stalemate');
  const chess = new Chess(position.fen);
  const move = chess.move('Qg7'); // not mate yet, and the king still has b8
  assert.equal(judge({ chess, position, playerColor: 'w', playerMoves: 1, lastMove: move }).status, 'playing');
  const mated = new Chess('k7/7Q/1K6/8/8/8/8/8 w - - 0 1');
  const m = mated.move('Qb7'); // protected by the king on b6
  assert.equal(mated.isCheckmate(), true);
  assert.equal(judge({ chess: mated, position, playerColor: 'w', playerMoves: 1, lastMove: m }).status, 'success');
});

test('judge: stalemating in a win drill FAILS, with the reason', () => {
  const position = positionById('kqk-stalemate');
  const chess = new Chess(position.fen);
  const move = chess.move('Qb6'); // k on a8, K c6, Q b6 → black to move, no moves, no check
  assert.equal(chess.isStalemate(), true);
  const r = judge({ chess, position, playerColor: 'w', playerMoves: 1, lastMove: move });
  assert.equal(r.status, 'fail');
  assert.match(r.reason, /Stalemate/);
});

test('judge: a draw by rule PASSES a draw drill', () => {
  const position = positionById('rook-pawn');
  const chess = new Chess('7k/7P/6K1/8/8/8/8/8 b - - 0 1'); // black to move, stalemated
  assert.equal(judge({ chess, position, playerColor: 'b', playerMoves: 3 }).status, 'success');
});

test('judge: being mated fails any drill', () => {
  const position = positionById('philidor');
  const chess = new Chess('3k4/8/8/8/8/8/8/8 b - - 0 1');
  chess.isCheckmate = () => true; // the rule, not the position, is under test
  assert.equal(judge({ chess, position, playerColor: 'b' }).status, 'fail');
});

test('judge: promotion needs the engine to confirm the win', () => {
  const position = positionById('king-in-front');
  // A queen on the board, as there would be just after promoting.
  const chess = new Chess('4k3/8/8/8/8/8/8/Q3K3 b - - 0 1');
  const lastMove = { color: 'w', promotion: 'q' };
  assert.equal(judge({ chess, position, playerColor: 'w', lastMove }).needsEval, true);
  assert.equal(judge({ chess, position, playerColor: 'w', lastMove, evalForPlayer: { cp: 900 } }).status, 'success');
  assert.equal(judge({ chess, position, playerColor: 'w', lastMove, evalForPlayer: { cp: 40 } }).status, 'fail');
  assert.equal(judge({ chess, position, playerColor: 'w', lastMove: { color: 'w', promotion: 'n' } }).status, 'playing');
});

test('judge: running out of moves fails a win drill; holding long enough passes a draw drill', () => {
  const win = positionById('krk');
  assert.equal(judge({ chess: new Chess(win.fen), position: win, playerColor: 'w', playerMoves: win.maxMoves }).status, 'fail');
  const hold = positionById('philidor');
  const chess = new Chess(hold.fen); // black (the player) to move
  assert.equal(judge({ chess, position: hold, playerColor: 'b', playerMoves: hold.holdMoves }).needsEval, true);
  assert.equal(judge({ chess, position: hold, playerColor: 'b', playerMoves: hold.holdMoves, evalForPlayer: { cp: -20 } }).status, 'success');
  assert.equal(judge({ chess, position: hold, playerColor: 'b', playerMoves: hold.holdMoves, evalForPlayer: { cp: -600 } }).status, 'fail');
});

test('passedDrills / bandProgress: read from puzzle attempts, only correct ones, only this player', () => {
  const attempts = [
    { playerId: 'CC-004', puzzleId: attemptIdFor(positionById('kqk')), correct: true },
    { playerId: 'CC-004', puzzleId: 'endgame:krk', correct: false },
    { playerId: 'CC-005', puzzleId: 'endgame:krrk', correct: true },
    { playerId: 'CC-004', puzzleId: 'abc12', correct: true },
  ];
  assert.deepEqual([...passedDrills(attempts, 'CC-004')], ['kqk']);
  assert.deepEqual(bandProgress(attempts, 'CC-004', 'basic'), { passed: 1, total: 4, done: false });
});
