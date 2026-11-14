import test from 'node:test';
import assert from 'node:assert/strict';

import { Chess } from '../engine/chess.js';
import { parseSanInput, matchSanInput } from './sanInput.js';

const START = new Chess().fen();
const AFTER_E4_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
// White knights on b1 and f3 can both reach d2.
const TWO_KNIGHTS = '4k3/8/8/8/8/5N2/8/1N2K3 w - - 0 1';
// Three knights (b1, f1, f3) can reach d2.
const THREE_KNIGHTS = '4k3/8/8/8/8/5N2/8/1N2KN2 w - - 0 1';
// Rooks on a1 and a5 can both reach a3: disambiguated by rank.
const TWO_ROOKS = '4k3/8/8/R7/8/8/8/R3K3 w - - 0 1';
const CASTLING = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
const PROMOTE = '4k3/P7/8/8/8/8/8/4K3 w - - 0 1';
const PROMOTE_CAPTURE = '1r2k3/P7/8/8/8/8/8/4K3 w - - 0 1';
const EN_PASSANT = '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1';
const PAWN_TAKES = '4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1';
// b2 pawn and e1 bishop can both take on c3; "bxc3" must be the pawn.
const B_PAWN_OR_BISHOP = '4k3/8/8/8/8/2n5/1P6/4B1K1 w - - 0 1';
// White is in check from the rook on e8.
const IN_CHECK = '4r1k1/8/8/8/8/8/8/4K1N1 w - - 0 1';

const play = (fen, text) => matchSanInput(new Chess(fen), text);

const expectMove = (fen, text, from, to, promotion) => {
  const result = play(fen, text);
  assert.equal(result.ok, true, `${text}: ${result.message}`);
  assert.equal(result.move.from, from, text);
  assert.equal(result.move.to, to, text);
  assert.equal(result.move.promotion, promotion, text);
  return result;
};

const expectError = (fen, text, code) => {
  const result = play(fen, text);
  assert.equal(result.ok, false, `${text} should have been refused`);
  assert.equal(result.code, code, `${text}: ${result.message}`);
  assert.equal(typeof result.message, 'string');
  assert.ok(result.message.length > 0);
  return result;
};

// --- accepted forms --------------------------------------------------------

test('standard SAN plays the one legal move it names', () => {
  const result = expectMove(START, 'Nf3', 'g1', 'f3', undefined);
  assert.equal(result.san, 'Nf3');
  expectMove(START, 'e4', 'e2', 'e4', undefined);
  expectMove(START, 'e3', 'e2', 'e3', undefined);
});

test('check, mate and annotation marks are ignored either way', () => {
  expectMove(START, 'Nf3+', 'g1', 'f3', undefined);
  expectMove(START, 'Nf3#', 'g1', 'f3', undefined);
  expectMove(START, 'Nf3!?', 'g1', 'f3', undefined);
  expectMove(START, '  Nf3  ', 'g1', 'f3', undefined);
});

test('a capture is accepted with or without the x', () => {
  expectMove(PAWN_TAKES, 'exd5', 'e4', 'd5', undefined);
  expectMove(PAWN_TAKES, 'ed5', 'e4', 'd5', undefined);
  const knight = '4k3/8/8/4p3/8/5N2/8/4K3 w - - 0 1';
  expectMove(knight, 'Nxe5', 'f3', 'e5', undefined);
  expectMove(knight, 'Ne5', 'f3', 'e5', undefined);
});

test('castling in letter O, digit zero and lowercase o', () => {
  expectMove(CASTLING, 'O-O', 'e1', 'g1', undefined);
  expectMove(CASTLING, '0-0', 'e1', 'g1', undefined);
  expectMove(CASTLING, 'o-o', 'e1', 'g1', undefined);
  expectMove(CASTLING, 'O-O-O', 'e1', 'c1', undefined);
  expectMove(CASTLING, '0-0-0+', 'e1', 'c1', undefined);
});

test('castling can also be typed as king coordinates, the UCI way', () => {
  const result = expectMove(CASTLING, 'e1g1', 'e1', 'g1', undefined);
  assert.equal(result.san, 'O-O');
});

test('disambiguation by file, by rank and by full square', () => {
  expectMove(TWO_KNIGHTS, 'Nbd2', 'b1', 'd2', undefined);
  expectMove(TWO_KNIGHTS, 'Nfd2', 'f3', 'd2', undefined);
  expectMove(TWO_KNIGHTS, 'N1d2', 'b1', 'd2', undefined);
  expectMove(TWO_KNIGHTS, 'Nf3d2', 'f3', 'd2', undefined);
  expectMove(TWO_ROOKS, 'R1a3', 'a1', 'a3', undefined);
  expectMove(TWO_ROOKS, 'R5a3', 'a5', 'a3', undefined);
});

test('over-disambiguated SAN is still accepted when it names one move', () => {
  expectMove(START, 'Ngf3', 'g1', 'f3', undefined);
  expectMove(START, 'Ng1f3', 'g1', 'f3', undefined);
  expectMove(START, 'Ng1-f3', 'g1', 'f3', undefined);
});

test('lowercase n, r, q and k are read as pieces: no file has those names', () => {
  expectMove(START, 'nf3', 'g1', 'f3', undefined);
  expectMove(TWO_KNIGHTS, 'nbd2', 'b1', 'd2', undefined);
  expectMove(TWO_ROOKS, 'r1a3', 'a1', 'a3', undefined);
  expectMove(AFTER_E4_E5, 'qh5', 'd1', 'h5', undefined);
  expectMove(AFTER_E4_E5, 'ke2', 'e1', 'e2', undefined);
});

test('coordinates, with or without a separator', () => {
  expectMove(START, 'e2e4', 'e2', 'e4', undefined);
  expectMove(START, 'g1f3', 'g1', 'f3', undefined);
  expectMove(START, 'e2-e4', 'e2', 'e4', undefined);
  expectMove(PAWN_TAKES, 'e4xd5', 'e4', 'd5', undefined);
});

test('a leading move number copied from a book is ignored', () => {
  expectMove(START, '1. e4', 'e2', 'e4', undefined);
  expectMove(START, '1.Nf3', 'g1', 'f3', undefined);
  const black = new Chess();
  black.move('e4');
  const result = matchSanInput(black, '1...e5');
  assert.equal(result.ok, true);
  assert.equal(result.move.to, 'e5');
});

test('promotion with =, without =, and with a lowercase piece', () => {
  expectMove(PROMOTE, 'a8=Q', 'a7', 'a8', 'q');
  expectMove(PROMOTE, 'a8Q', 'a7', 'a8', 'q');
  expectMove(PROMOTE, 'a8=q', 'a7', 'a8', 'q');
  expectMove(PROMOTE, 'a8=N', 'a7', 'a8', 'n');
  expectMove(PROMOTE, 'a8=R+', 'a7', 'a8', 'r');
  expectMove(PROMOTE, 'a7a8n', 'a7', 'a8', 'n');
  expectMove(PROMOTE_CAPTURE, 'axb8=R', 'a7', 'b8', 'r');
  expectMove(PROMOTE_CAPTURE, 'ab8=B', 'a7', 'b8', 'b');
});

test('en passant is a capture onto an empty square', () => {
  const result = expectMove(EN_PASSANT, 'exd6', 'e5', 'd6', undefined);
  assert.equal(result.san, 'exd6');
  expectMove(EN_PASSANT, 'e5d6', 'e5', 'd6', undefined);
  expectMove(EN_PASSANT, 'exd6 e.p.', 'e5', 'd6', undefined);
});

test('lowercase b is always the b-pawn, even when a bishop could take too', () => {
  expectMove(B_PAWN_OR_BISHOP, 'bxc3', 'b2', 'c3', undefined);
  expectMove(B_PAWN_OR_BISHOP, 'Bxc3', 'e1', 'c3', undefined);
});

test('the SAN returned is the engine spelling, with its check mark', () => {
  const result = expectMove(PROMOTE, 'a8=Q', 'a7', 'a8', 'q');
  assert.equal(result.san, 'a8=Q+');
});

test('matching never changes the position it is asked about', () => {
  const game = new Chess(TWO_KNIGHTS);
  const before = game.fen();
  matchSanInput(game, 'Nd2');
  matchSanInput(game, 'Nbd2');
  matchSanInput(game, 'nonsense');
  assert.equal(game.fen(), before);
  assert.equal(game.moveHistory().length, 0);
});

// --- refusals --------------------------------------------------------------

test('illegal SAN: no legal move matches', () => {
  const result = expectError(START, 'Nf4', 'no-match');
  assert.equal(result.message, 'No legal move matches Nf4.');
  expectError(START, 'e5', 'no-match'); // Black's move, White to play
  expectError(START, 'Qh5', 'no-match');
  expectError(START, 'Ke2', 'no-match');
  expectError(TWO_KNIGHTS, 'Ncd2', 'no-match'); // no knight on the c-file
  expectError(START, 'ee4', 'no-match'); // a pawn cannot capture along its file
});

test('illegal SAN while in check says so', () => {
  const result = expectError(IN_CHECK, 'Nf3', 'no-match');
  assert.match(result.message, /White is in check/);
});

test('ambiguous SAN lists every reading in engine SAN', () => {
  const result = expectError(TWO_KNIGHTS, 'Nd2', 'ambiguous');
  assert.match(result.message, /^Ambiguous: /);
  assert.match(result.message, /Nbd2/);
  assert.match(result.message, /Nfd2/);
  assert.match(result.message, / or /);
  assert.equal(result.message, 'Ambiguous: Nfd2 or Nbd2.');

  const rooks = expectError(TWO_ROOKS, 'Ra3', 'ambiguous');
  assert.match(rooks.message, /R5a3/);
  assert.match(rooks.message, /R1a3/);
});

test('three-way ambiguity reads as a list', () => {
  const result = expectError(THREE_KNIGHTS, 'Nd2', 'ambiguous');
  assert.equal(result.message, 'Ambiguous: N3d2, Nbd2 or Nf1d2.');
  // A file that two of them share still leaves it ambiguous.
  const byFile = expectError(THREE_KNIGHTS, 'Nfd2', 'ambiguous');
  assert.match(byFile.message, /N3d2/);
  assert.match(byFile.message, /Nf1d2/);
  expectMove(THREE_KNIGHTS, 'Nf1d2', 'f1', 'd2', undefined);
});

test('promotion without a piece is refused, not defaulted to a queen', () => {
  const push = expectError(PROMOTE, 'a8', 'promotion-needed');
  assert.match(push.message, /a8=Q/);
  assert.match(push.message, /a8=N/);
  const capture = expectError(PROMOTE_CAPTURE, 'axb8', 'promotion-needed');
  assert.match(capture.message, /axb8=Q/);
  const coord = expectError(PROMOTE, 'a7a8', 'promotion-needed');
  assert.match(coord.message, /a7a8q/);
});

test('a promotion piece on a move that does not promote is refused', () => {
  expectError(START, 'e4=Q', 'not-a-promotion');
  expectError(START, 'e2e4q', 'not-a-promotion');
});

test('promoting to a king or a pawn is refused', () => {
  expectError(PROMOTE, 'a8=K', 'bad-promotion');
  expectError(PROMOTE, 'a8=P', 'bad-promotion');
});

test('an x on a quiet move is refused with the quiet spelling offered', () => {
  const result = expectError(START, 'Nxf3', 'not-a-capture');
  assert.match(result.message, /f3 is empty/);
  assert.match(result.message, /Did you mean Nf3\?/);
  expectError(START, 'e2xe4', 'not-a-capture');
});

test('lowercase b as a bishop is refused and the bishop move suggested', () => {
  const result = expectError(AFTER_E4_E5, 'bc4', 'lowercase-bishop');
  assert.match(result.message, /Bc4/);
  expectError(AFTER_E4_E5, 'bxc4', 'lowercase-bishop');
});

test('castling that is not available is explained', () => {
  const result = expectError(START, 'O-O', 'castle-illegal');
  assert.match(result.message, /kingside/);
  expectError(START, 'O-O-O', 'castle-illegal');
  const inCheck = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  inCheck.load('4r3/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  const blocked = matchSanInput(inCheck, 'O-O');
  assert.equal(blocked.code, 'castle-illegal');
  assert.match(blocked.message, /White is in check/);
});

test('Kg1 is a king step, so castling written that way is corrected', () => {
  const result = expectError(CASTLING, 'Kg1', 'castle-notation');
  assert.match(result.message, /O-O/);
  const queenside = expectError(CASTLING, 'Kc1', 'castle-notation');
  assert.match(queenside.message, /O-O-O/);
});

test('coordinates explain an empty origin, the wrong side, or an unreachable square', () => {
  assert.match(expectError(START, 'e3e4', 'no-piece').message, /no piece on e3/);
  assert.match(expectError(START, 'e7e5', 'wrong-side').message, /black pawn.*White's move/);
  assert.match(expectError(START, 'e2e5', 'no-match').message, /white pawn on e2 can't move to e5/);
});

test('near misses get the correct spelling suggested, not played', () => {
  assert.match(expectError(START, 'Pe4', 'pawn-letter').message, /try e4/);
  assert.match(expectError(START, 'E4', 'uppercase-square').message, /try e4/);
  assert.match(expectError(START, 'E2E4', 'uppercase-square').message, /try e2e4/);
  assert.match(expectError(START, 'NF3', 'uppercase-square').message, /try Nf3/);
});

test('empty and unreadable input', () => {
  expectError(START, '', 'empty');
  expectError(START, '   ', 'empty');
  expectError(START, undefined, 'empty');
  const result = expectError(START, 'knight to f3', 'unreadable');
  assert.match(result.message, /Couldn't read/);
  expectError(START, 'xd5', 'unreadable');
  expectError(START, 'Nf3=Q', 'unreadable');
  expectError(START, 'e9', 'unreadable');
  expectError(START, 'Zf3', 'unreadable');
  expectError(START, 'e8=X', 'unreadable');
});

// --- the grammar on its own -----------------------------------------------

test('parseSanInput reads the shape without a position', () => {
  assert.deepEqual(parseSanInput('Nbd2'), {
    kind: 'piece',
    piece: 'n',
    fromFile: 'b',
    fromRank: null,
    capture: false,
    to: 'd2',
  });
  assert.deepEqual(parseSanInput('exd8=N+'), {
    kind: 'pawn',
    fromFile: 'e',
    to: 'd8',
    capture: true,
    promotion: 'n',
  });
  assert.deepEqual(parseSanInput('0-0-0'), { kind: 'castle', side: 'q' });
  assert.deepEqual(parseSanInput('g1f3'), {
    kind: 'coord',
    from: 'g1',
    to: 'f3',
    capture: false,
    promotion: null,
  });
  assert.equal(parseSanInput('bc4').kind, 'pawn'); // never a bishop
  assert.equal(parseSanInput('O-O-O-O').kind, 'invalid');
});
