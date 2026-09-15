import test from 'node:test';
import assert from 'node:assert/strict';

import { Chess, SQUARES } from '../engine/chess.js';
import { see, seeCapture, PIECE_VALUES } from './see.js';

test('piece values are the agreed centipawn table', () => {
  assert.equal(PIECE_VALUES.p, 100);
  assert.equal(PIECE_VALUES.n, 320);
  assert.equal(PIECE_VALUES.b, 330);
  assert.equal(PIECE_VALUES.r, 500);
  assert.equal(PIECE_VALUES.q, 900);
  assert.equal(PIECE_VALUES.k, 20000);
});

test('an undefended piece gives its full value', () => {
  // Black knight on c5, nothing defends it. White bishop e3 attacks it.
  const chess = new Chess('4k3/8/8/2n5/8/4B3/8/4K3 w - - 0 1');
  assert.equal(seeCapture(chess, 'e3', 'c5'), 320);
  // Same answer through see(), which picks the least valuable attacker.
  assert.equal(see(chess, 'c5'), 320);
});

test('a defended knight taken by a bishop is still a material loss', () => {
  // Black knight c5 is defended by the b6 pawn; the bishop is worth more.
  const chess = new Chess('4k3/8/1p6/2n5/8/4B3/8/4K3 w - - 0 1');
  const value = seeCapture(chess, 'e3', 'c5');
  assert.ok(value < 0, `expected a loss, got ${value}`);
  assert.equal(value, PIECE_VALUES.n - PIECE_VALUES.b); // 320 - 330 = -10
});

test('a protected pawn taken by a queen is strongly negative', () => {
  // a6 pawn is protected by b7. Qa1xa6 wins 100 and loses 900.
  const chess = new Chess('4k3/1p6/p7/8/8/8/8/Q3K3 w - - 0 1');
  const value = seeCapture(chess, 'a1', 'a6');
  assert.equal(value, -800);
  assert.ok(value <= -500, 'a queen for a protected pawn must read as a disaster');
});

test('an equal trade comes out at zero', () => {
  // Rd1xd5, Rd8xd5 — rook for rook, nothing left over.
  const chess = new Chess('3r3k/8/8/3r4/8/8/8/3R2K1 w - - 0 1');
  assert.equal(seeCapture(chess, 'd1', 'd5'), 0);
});

test('an extra attacker wins the exchange outright', () => {
  // Two white rooks on the d-file against one defender: Rxd5 Rxd5 Rxd5.
  const chess = new Chess('3r3k/8/8/3r4/8/8/3R4/3R2K1 w - - 0 1');
  assert.equal(seeCapture(chess, 'd2', 'd5'), 500);
});

test('see() chooses the least valuable attacker', () => {
  // Black knight d5, defended by the e6 pawn, attacked by the c4 pawn and the
  // d1 rook. see() must start with the pawn, not the rook.
  //
  //   cxd5  +320 (knight)      white pawn now on d5
  //   exd5  -100 (that pawn)   => 220, black pawn now on d5
  //   Rxd5  +100 (that pawn)   => 320, and black has no attacker left
  //
  // 220 is the tempting wrong answer: it stops one ply early and forgets the
  // d1 rook is still bearing down the file.
  const chess = new Chess('4k3/8/4p3/3n4/2P5/8/8/3RK3 w - - 0 1');
  assert.equal(see(chess, 'd5'), 320);

  // Leading with the rook instead: Rxd5 +320, exd5 -500 => -180, cxd5 +100
  // => -80. Black would decline at -80 rather than allow +320, so -80 stands.
  assert.equal(seeCapture(chess, 'd1', 'd5'), -80);
});

test('x-ray batteries join the exchange', () => {
  // White Qe2 with Re1 behind it; black pawn e5 defended by Re8.
  // Qxe5 Rxe5 Rxe5 => 100 - 900 + 500 = -300, not the -800 a naive
  // "is it defended" reading would give.
  const chess = new Chess('4r2k/8/8/4p3/8/8/4Q3/4R1K1 w - - 0 1');
  assert.equal(seeCapture(chess, 'e2', 'e5'), -300);
});

test('an empty square and an unattacked square are both zero', () => {
  const chess = new Chess('4k3/8/8/8/8/8/8/4K2R w K - 0 1');
  assert.equal(see(chess, 'd4'), 0); // nothing there, nothing attacking it
  assert.equal(see(chess, 'h1'), 0); // white's own rook: not a capture
});

test('the king may not capture into a defended square', () => {
  // Black pawn d5 is defended by the c6 pawn; the white king on c4 is the
  // only attacker, so the capture is illegal and the exchange is worth 0.
  const chess = new Chess('4k3/8/2p5/3p4/2K5/8/8/8 w - - 0 1');
  assert.equal(see(chess, 'd5'), 0);
  // Remove the defender and the same king capture is worth a clean pawn.
  const loose = new Chess('4k3/8/8/3p4/2K5/8/8/8 w - - 0 1');
  assert.equal(see(loose, 'd5'), 100);
});

test('square indices and names are interchangeable', () => {
  const chess = new Chess('4k3/8/8/2n5/8/4B3/8/4K3 w - - 0 1');
  assert.equal(seeCapture(chess, SQUARES.e3, SQUARES.c5), 320);
});

test('see() does not mutate the position it is handed', () => {
  const chess = new Chess('4k3/1p6/p7/8/8/8/8/Q3K3 w - - 0 1');
  const before = chess.fen();
  seeCapture(chess, 'a1', 'a6');
  see(chess, 'a6');
  assert.equal(chess.fen(), before);
});
