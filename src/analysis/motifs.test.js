/*
 * motifs.js v1 — one positive and one negative case per motif.
 *
 * The negatives matter as much as the positives: a fork test whose position
 * also contains a hanging piece passes for the wrong reason and would keep
 * passing if the fork detector were deleted.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from '../engine/chess.js';
import { detectMotifs, attackedSquares } from './motifs.js';

/** Position AFTER the blunder, plus the engine's refutation in UCI. */
const at = (fen, ...pv) => ({ chess: new Chess(fen), refutationPv: pv });

/* ── attack enumeration, which the fork detector rests on ────────────────── */

test('attackedSquares: a knight hits all eight squares from the centre', () => {
  const board = new Chess('4k3/8/8/8/4N3/8/8/4K3 w - - 0 1');
  const hit = attackedSquares(board, 'e4').sort();
  assert.deepEqual(hit, ['c3', 'c5', 'd2', 'd6', 'f2', 'f6', 'g3', 'g5'].sort());
});

test('attackedSquares: a pawn attacks diagonally, not forwards', () => {
  const board = new Chess('4k3/8/8/8/8/4P3/8/4K3 w - - 0 1');
  const hit = attackedSquares(board, 'e3').sort();
  assert.deepEqual(hit, ['d4', 'f4']);
  assert.ok(!hit.includes('e4'), 'a forward push is not an attack');
});

/* ── hangingPiece ────────────────────────────────────────────────────────── */

test('hangingPiece: an undefended rook simply gets taken', () => {
  // Black rook a5 is undefended; White queen on a1 takes it for free.
  const motifs = detectMotifs(at('4k3/8/8/r7/8/8/8/Q3K3 w - - 0 1', 'a1a5'));
  assert.ok(motifs.includes('hangingPiece'));
});

test('hangingPiece: NOT reported when the capture loses material', () => {
  // Black pawn b6 is defended by the a7 pawn; QxB is a disaster, not a win.
  const motifs = detectMotifs(at('4k3/p7/1p6/8/8/8/8/Q3K3 w - - 0 1', 'a1b6'));
  assert.ok(!motifs.includes('hangingPiece'), 'a losing capture is not a hanging piece');
});

/* ── fork ────────────────────────────────────────────────────────────────── */

test('fork: a knight check that also hits the rook', () => {
  // Black Ke8 and Ra8 (undefended). Nc7+ is a royal fork from d5... use c7:
  // knight landing on c7 attacks e8 (king) and a8 (rook).
  const motifs = detectMotifs(at('r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1', 'd5c7'));
  assert.ok(motifs.includes('fork'), `expected a fork, got ${JSON.stringify(motifs)}`);
});

test('fork: NOT reported for a check that hits only the king', () => {
  // Nc7+ forks nothing here — there is no second target worth anything.
  const motifs = detectMotifs(at('4k3/8/8/3N4/8/8/8/4K3 w - - 0 1', 'd5c7'));
  assert.ok(!motifs.includes('fork'), 'a bare check is not a fork');
});

/* ── backRank ────────────────────────────────────────────────────────────── */

test('backRank: mate on the eighth against a king walled in by its own pawns', () => {
  // Black Kg8 with f7/g7/h7 pawns; White rook swings to e8 and mates.
  const motifs = detectMotifs(at('6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1', 'e1e8'));
  assert.ok(motifs.includes('backRank'), `expected backRank, got ${JSON.stringify(motifs)}`);
});

test('backRank: NOT reported when the king has luft', () => {
  // Same idea, but h7 has been pushed to h6 — the king can step out, so a check
  // on the eighth is just a check.
  const motifs = detectMotifs(at('6k1/5pp1/7p/8/8/8/8/4R1K1 w - - 0 1', 'e1e8'));
  assert.ok(!motifs.includes('backRank'), 'with an escape square this is not a back-rank motif');
});

/* ── general behaviour ───────────────────────────────────────────────────── */

test('a quiet refutation carries no motif at all', () => {
  const motifs = detectMotifs(at('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', 'e2e3'));
  assert.deepEqual(motifs, []);
});

test('bad input is tolerated rather than thrown', () => {
  assert.deepEqual(detectMotifs({}), []);
  assert.deepEqual(detectMotifs({ chess: new Chess(), refutationPv: [] }), []);
  assert.deepEqual(detectMotifs({ chess: new Chess(), refutationPv: ['zz'] }), []);
});

/* ── pin ─────────────────────────────────────────────────────────────────── */

test('pin: Bb5 pins the c6 knight to the king', () => {
  const motifs = detectMotifs(at('4k3/8/2n5/8/8/8/8/4KB2 w - - 0 1', 'f1b5'));
  assert.ok(motifs.includes('pin'), `expected a pin, got ${JSON.stringify(motifs)}`);
});

test('pin: NOT reported for a pawn in front of the king, or with nothing behind', () => {
  assert.ok(!detectMotifs(at('4k3/8/2p5/8/8/8/8/4KB2 w - - 0 1', 'f1b5')).includes('pin'), 'a pinned pawn is not the lesson');
  assert.ok(!detectMotifs(at('6k1/8/2n5/8/8/8/8/4KB2 w - - 0 1', 'f1b5')).includes('pin'), 'nothing behind the knight');
});

test('pin: NOT reported when the "pinned" piece can take the pinner along the line', () => {
  // A bishop on c6 simply captures on b5.
  assert.ok(!detectMotifs(at('4k3/8/2b5/8/8/8/8/4KB2 w - - 0 1', 'f1b5')).includes('pin'));
});

/* ── skewer ──────────────────────────────────────────────────────────────── */

test('skewer: Bb3+ skewers the king to the rook behind it', () => {
  const motifs = detectMotifs(at('8/5r2/8/3k4/8/8/8/3BK3 w - - 0 1', 'd1b3'));
  assert.ok(motifs.includes('skewer'), `expected a skewer, got ${JSON.stringify(motifs)}`);
  assert.ok(!motifs.includes('pin'), 'a king in front is a skewer, not a pin');
});

test('skewer: NOT reported when only a pawn stands behind the king', () => {
  assert.ok(!detectMotifs(at('8/5p2/8/3k4/8/8/8/3BK3 w - - 0 1', 'd1b3')).includes('skewer'));
});

/* ── discoveredAttack ────────────────────────────────────────────────────── */

test('discoveredAttack: Nc5 uncovers check from the e1 rook and hits the queen', () => {
  const motifs = detectMotifs(at('4k3/1q6/8/8/4N3/8/8/4R1K1 w - - 0 1', 'e4c5'));
  assert.ok(motifs.includes('discoveredAttack'), `expected a discovered attack, got ${JSON.stringify(motifs)}`);
});

test('discoveredAttack: NOT reported when no piece stands behind the one that moves', () => {
  assert.ok(!detectMotifs(at('4k3/1q6/8/8/4N3/8/8/R5K1 w - - 0 1', 'e4c5')).includes('discoveredAttack'));
});

/* ── trappedPiece ────────────────────────────────────────────────────────── */

test('trappedPiece: Ra5 attacks the cornered a1 knight; both its squares are covered', () => {
  const motifs = detectMotifs(at('7k/8/8/7R/8/2K5/8/n7 w - - 0 1', 'h5a5'));
  assert.ok(motifs.includes('trappedPiece'), `expected a trapped piece, got ${JSON.stringify(motifs)}`);
});

test('trappedPiece: NOT reported when the knight has a safe square', () => {
  // With the king on e3 the knight escapes (Nc2+ even gains a tempo).
  assert.ok(!detectMotifs(at('7k/8/8/7R/8/4K3/8/n7 w - - 0 1', 'h5a5')).includes('trappedPiece'));
});

/* ── deflection ──────────────────────────────────────────────────────────── */

test('deflection: Re8+ drags the d8 rook off the d-file, then Qxd5 wins the queen', () => {
  const motifs = detectMotifs(at('3r2k1/5ppp/8/3q4/8/8/5PPP/3QR1K1 w - - 0 1', 'e1e8', 'd8e8', 'd1d5'));
  assert.ok(motifs.includes('deflection'), `expected a deflection, got ${JSON.stringify(motifs)}`);
});

test('deflection: NOT reported when the follow-up wins less than the bait cost', () => {
  // Same idea, but only a knight on d5: giving a rook to win a knight is not a win.
  assert.ok(!detectMotifs(at('3r2k1/5ppp/8/3n4/8/8/5PPP/3QR1K1 w - - 0 1', 'e1e8', 'd8e8', 'd1d5')).includes('deflection'));
});

test('deflection: NOT reported from a one-move line', () => {
  assert.ok(!detectMotifs(at('3r2k1/5ppp/8/3q4/8/8/5PPP/3QR1K1 w - - 0 1', 'e1e8')).includes('deflection'));
});
