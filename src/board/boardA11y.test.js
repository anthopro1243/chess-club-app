import test from 'node:test';
import assert from 'node:assert/strict';

import { Chess } from '../engine/chess.js';
import {
  pieceName,
  sideName,
  describeSquare,
  stepSquare,
  defaultFocusSquare,
  describeMove,
  describeSelection,
  describeCannotSelect,
  describeIllegalTarget,
  joinOr,
  isSquare,
} from './boardA11y.js';

/** Play `san` in `fen` and describe it the way the pages do. */
const say = (fen, san) => {
  const game = new Chess(fen);
  const move = game.move(san);
  assert.ok(move, `${san} should be legal in ${fen}`);
  return describeMove(move, game.status());
};

// --- square names ----------------------------------------------------------

test('a square is named, then its piece', () => {
  assert.equal(describeSquare('e4', { type: 'n', color: 'w' }), 'e4, white knight');
  assert.equal(describeSquare('d8', { type: 'q', color: 'b' }), 'd8, black queen');
});

test('an empty square says so instead of trailing off', () => {
  assert.equal(describeSquare('e4', null), 'e4, empty');
});

test('board cues are spoken after the piece', () => {
  const knight = { type: 'n', color: 'w' };
  assert.equal(describeSquare('g1', knight, { selected: true }), 'g1, white knight, selected');
  assert.equal(describeSquare('f3', null, { target: 'move' }), 'f3, empty, legal move');
  assert.equal(
    describeSquare('d5', { type: 'p', color: 'b' }, { target: 'capture' }),
    'd5, black pawn, legal capture',
  );
  // En passant: a capture onto an empty square.
  assert.equal(describeSquare('d6', null, { target: 'capture' }), 'd6, empty, legal capture');
  assert.equal(
    describeSquare('e1', { type: 'k', color: 'w' }, { check: true }),
    'e1, white king, in check',
  );
  assert.equal(describeSquare('e4', { type: 'p', color: 'w' }, { lastMoveTo: true }), 'e4, white pawn, last move ended here');
  assert.equal(describeSquare('e2', null, { lastMoveFrom: true }), 'e2, empty, last move started here');
});

test('pieceName and sideName', () => {
  assert.equal(pieceName({ type: 'b', color: 'b' }), 'black bishop');
  assert.equal(pieceName(null), '');
  assert.equal(pieceName({ type: 'x', color: 'w' }), '');
  assert.equal(sideName('w'), 'White');
  assert.equal(sideName('b'), 'Black');
});

// --- arrow-key navigation --------------------------------------------------

test('arrows follow the screen with White at the bottom', () => {
  assert.equal(stepSquare('e4', 'ArrowUp', 'w'), 'e5');
  assert.equal(stepSquare('e4', 'ArrowDown', 'w'), 'e3');
  assert.equal(stepSquare('e4', 'ArrowLeft', 'w'), 'd4');
  assert.equal(stepSquare('e4', 'ArrowRight', 'w'), 'f4');
  assert.equal(stepSquare('e4', 'Home', 'w'), 'a4');
  assert.equal(stepSquare('e4', 'End', 'w'), 'h4');
});

test('arrows follow the screen, not the rank numbers, with Black at the bottom', () => {
  assert.equal(stepSquare('e4', 'ArrowUp', 'b'), 'e3');
  assert.equal(stepSquare('e4', 'ArrowDown', 'b'), 'e5');
  assert.equal(stepSquare('e4', 'ArrowLeft', 'b'), 'f4');
  assert.equal(stepSquare('e4', 'ArrowRight', 'b'), 'd4');
  assert.equal(stepSquare('e4', 'Home', 'b'), 'h4');
  assert.equal(stepSquare('e4', 'End', 'b'), 'a4');
});

test('focus stops at the edge of the board rather than wrapping', () => {
  assert.equal(stepSquare('a8', 'ArrowUp', 'w'), 'a8');
  assert.equal(stepSquare('a8', 'ArrowLeft', 'w'), 'a8');
  assert.equal(stepSquare('h1', 'ArrowDown', 'w'), 'h1');
  assert.equal(stepSquare('h1', 'ArrowRight', 'w'), 'h1');
  assert.equal(stepSquare('a1', 'ArrowDown', 'b'), 'a2');
  assert.equal(stepSquare('a1', 'ArrowUp', 'b'), 'a1');
});

test('keys that are not navigation return null so they are not swallowed', () => {
  assert.equal(stepSquare('e4', 'Enter', 'w'), null);
  assert.equal(stepSquare('e4', 'Tab', 'w'), null);
  assert.equal(stepSquare('e4', 'a', 'w'), null);
  assert.equal(stepSquare('z9', 'ArrowUp', 'w'), null);
  assert.equal(stepSquare(null, 'ArrowUp', 'w'), null);
});

test('the default tab stop is the last move, else the bottom-left corner', () => {
  assert.equal(defaultFocusSquare('w', null), 'a1');
  assert.equal(defaultFocusSquare('b', null), 'h8');
  assert.equal(defaultFocusSquare('w', { from: 'g8', to: 'f6' }), 'f6');
  assert.equal(defaultFocusSquare('w', { from: 'g8', to: 'zz' }), 'a1');
});

test('isSquare', () => {
  assert.equal(isSquare('a1'), true);
  assert.equal(isSquare('h8'), true);
  assert.equal(isSquare('i1'), false);
  assert.equal(isSquare('a0'), false);
  assert.equal(isSquare(''), false);
  assert.equal(isSquare(undefined), false);
});

// --- move announcements ----------------------------------------------------

const START = new Chess().fen();

test('a quiet move: side, piece, destination', () => {
  assert.equal(say(START, 'Nf3'), 'White knight to f3.');
  assert.equal(say(START, 'e4'), 'White pawn to e4.');
  assert.equal(
    say('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', 'Nf6'),
    'Black knight to f6.',
  );
});

test('a capture names the piece taken', () => {
  assert.equal(say('4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1', 'exd5'), 'White pawn captures pawn on d5.');
  assert.equal(say('4k3/8/2n5/4P3/8/8/7P/3K4 b - - 0 1', 'Nxe5'), 'Black knight captures pawn on e5.');
});

test('the task example: black captures on e5, check', () => {
  // The knight lands on e5 attacking the white king on d3.
  assert.equal(
    say('4k3/8/2n5/4P3/8/3K4/7P/8 b - - 0 1', 'Nxe5+'),
    'Black knight captures pawn on e5, check.',
  );
});

test('a quiet check', () => {
  assert.equal(say('4k3/8/8/8/7p/5n2/8/5K2 b - - 0 1', 'Nd2+'), 'Black knight to d2, check.');
});

test('capture with check', () => {
  // Black queen takes the e5 pawn and checks the king on e1 down the file.
  assert.equal(
    say('4k3/8/8/4P3/8/8/8/q3K3 b - - 0 1', 'Qxe5+'),
    'Black queen captures pawn on e5, check.',
  );
});

test('en passant is said out loud', () => {
  assert.equal(
    say('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', 'exd6'),
    'White pawn captures pawn on d6 en passant.',
  );
});

test('castling is named as castling, not as a king move', () => {
  const fen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
  assert.equal(say(fen, 'O-O'), 'White castles kingside.');
  assert.equal(say(fen, 'O-O-O'), 'White castles queenside.');
  assert.equal(say('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1', 'O-O'), 'Black castles kingside.');
});

test('promotion says the piece chosen, including an underpromotion', () => {
  assert.equal(say('4k3/P7/8/8/8/8/7P/4K3 w - - 0 1', 'a8=Q+'), 'White pawn to a8, promotes to queen, check.');
  assert.equal(say('4k3/P7/8/8/8/8/7P/4K3 w - - 0 1', 'a8=N'), 'White pawn to a8, promotes to knight.');
  assert.equal(
    say('1r2k3/P7/8/8/8/8/8/4K3 w - - 0 1', 'axb8=R+'),
    'White pawn captures rook on b8, promotes to rook, check.',
  );
});

test('checkmate names the winner and is not followed by a second status line', () => {
  // Fool's mate.
  const game = new Chess();
  for (const san of ['f3', 'e5', 'g4']) game.move(san);
  const mate = game.move('Qh4#');
  assert.equal(describeMove(mate, game.status()), 'Black queen to h4, checkmate. Black wins.');
});

test('insufficient material after a move is announced too', () => {
  // K+N v K: the knight's check is the last thing that can happen.
  assert.equal(
    say('4k3/8/8/8/8/5n2/8/5K2 b - - 0 1', 'Nd2+'),
    'Black knight to d2, check. Draw by insufficient material.',
  );
});

test('a draw with no mark in the SAN is still announced', () => {
  // Qb6 stalemates the black king on a8.
  const text = say('k7/8/2Q5/8/8/8/8/4K3 w - - 0 1', 'Qb6');
  assert.equal(text, 'White queen to b6. Draw by stalemate.');
});

test('describeMove without a status reads check from the SAN alone', () => {
  const move = { color: 'w', piece: 'q', to: 'h5', captured: null, promotion: null, flags: 'n', san: 'Qh5+' };
  assert.equal(describeMove(move), 'White queen to h5, check.');
});

test('describeMove refuses what is not a move', () => {
  assert.equal(describeMove(null), '');
  assert.equal(describeMove(undefined), '');
  assert.equal(describeMove({ color: 'w', piece: 'x', to: 'e4' }), '');
});

// --- selection feedback ----------------------------------------------------

test('picking up a piece lists where it can go', () => {
  const game = new Chess();
  const moves = game.moves({ square: 'g1', verbose: true });
  assert.equal(
    describeSelection('g1', { type: 'n', color: 'w' }, moves),
    'White knight on g1 selected. 2 legal moves: f3, h3.',
  );
});

test('a piece with no moves is still reported, and says it cannot move', () => {
  assert.equal(
    describeSelection('a1', { type: 'r', color: 'w' }, []),
    'White rook on a1 selected. It has no legal moves.',
  );
});

test('selection lists a promotion square once and marks captures and castling', () => {
  const promo = new Chess('1r2k3/P7/8/8/8/8/8/4K3 w - - 0 1');
  assert.equal(
    describeSelection('a7', { type: 'p', color: 'w' }, promo.moves({ square: 'a7', verbose: true })),
    'White pawn on a7 selected. 2 legal moves: a8, takes b8.',
  );
  const castle = new Chess('4k3/8/8/8/8/8/8/4K2R w K - 0 1');
  const text = describeSelection('e1', { type: 'k', color: 'w' }, castle.moves({ square: 'e1', verbose: true }));
  assert.match(text, /g1 \(castles\)/);
  assert.match(text, /^White king on e1 selected\. 6 legal moves: /);
});

test('why nothing was picked up', () => {
  assert.equal(describeCannotSelect('e4', null, 'w'), "e4 is empty. Pick one of White's pieces.");
  assert.equal(
    describeCannotSelect('e7', { type: 'p', color: 'b' }, 'w'),
    "e7 has a black pawn. It is White's move.",
  );
});

test('why a destination was refused', () => {
  assert.equal(
    describeIllegalTarget('g1', { type: 'n', color: 'w' }, 'e5'),
    "White knight on g1 can't move to e5. Selection cleared.",
  );
});

test('joinOr reads a list the way people say it', () => {
  assert.equal(joinOr([]), '');
  assert.equal(joinOr(['Nbd2']), 'Nbd2');
  assert.equal(joinOr(['Nbd2', 'Nfd2']), 'Nbd2 or Nfd2');
  assert.equal(joinOr(['a', 'b', 'c']), 'a, b or c');
});
