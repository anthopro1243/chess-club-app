import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess, START_FEN } from '../engine/chess.js';
import {
  cleanMoveText,
  parseMoveText,
  matchMove,
  suggestMoves,
  splitMoveText,
  replayMoves,
  plyLabel,
} from './sanMatch.js';

// Morphy's Opera Game, 1858: 33 plies, as a scoresheet would give them.
const OPERA = [
  'e4', 'e5', 'Nf3', 'd6', 'd4', 'Bg4', 'dxe5', 'Bxf3', 'Qxf3', 'dxe5', 'Bc4', 'Nf6', 'Qb3', 'Qe7',
  'Nc3', 'c6', 'Bg5', 'b5', 'Nxb5', 'cxb5', 'Bxb5+', 'Nbd7', 'O-O-O', 'Rd8', 'Rxd7', 'Rxd7', 'Rd1',
  'Qe6', 'Bxd7+', 'Nxd7', 'Qb8+', 'Nxb8', 'Rd8#',
];

const after = (tokens, fen = START_FEN) => {
  const chess = new Chess(fen);
  for (const t of tokens) assert.ok(chess.move(t), `setup move ${t}`);
  return chess;
};

// -- reading the text --------------------------------------------------------

test('cleanMoveText: numbers, marks, glyphs and figurines go', () => {
  assert.equal(cleanMoveText('12. Nf3+'), 'Nf3');
  assert.equal(cleanMoveText('12...Qxe1#'), 'Qxe1');
  assert.equal(cleanMoveText('  e4!? '), 'e4');
  assert.equal(cleanMoveText('♘f3'), 'Nf3');
  assert.equal(cleanMoveText('exd6 e.p.'), 'exd6');
  assert.equal(cleanMoveText('0–0'), '0-0');
});

test('parseMoveText: the shapes a sheet uses', () => {
  assert.deepEqual(parseMoveText('Nbd7'), { kind: 'piece', piece: 'n', fromFile: 'b', fromRank: null, capture: false, to: 'd7' });
  assert.equal(parseMoveText('exd5').kind, 'pawn');
  assert.equal(parseMoveText('ed5').fromFile, 'e');
  assert.equal(parseMoveText('e8Q').promotion, 'q');
  assert.equal(parseMoveText('e8(N)').promotion, 'n');
  assert.equal(parseMoveText('g1-f3').kind, 'coord');
  assert.equal(parseMoveText('0-0-0').side, 'q');
  assert.equal(parseMoveText('OO').side, 'k');
  assert.equal(parseMoveText('').kind, 'empty');
  assert.equal(parseMoveText('Pe4').reason, 'pawn-letter');
  assert.equal(parseMoveText('E4').reason, 'uppercase-square');
  assert.equal(parseMoveText('e8=K').reason, 'bad-promotion');
  assert.equal(parseMoveText('hello').reason, 'unreadable');
});

// -- matching one move -------------------------------------------------------

test('matchMove: tolerant spellings resolve when they name exactly one move', () => {
  const start = new Chess();
  for (const [typed, san] of [['nf3', 'Nf3'], ['Ng1f3', 'Nf3'], ['g1f3', 'Nf3'], ['♘f3', 'Nf3'], ['1. e4', 'e4'], ['e2-e4', 'e4']]) {
    const found = matchMove(start, typed);
    assert.equal(found.ok, true, `${typed}: ${found.message}`);
    assert.equal(found.san, san, typed);
  }
  const center = after(['e4', 'd5']);
  assert.equal(matchMove(center, 'ed5').san, 'exd5', 'x left out of a pawn capture');
  assert.equal(matchMove(center, 'exd5').san, 'exd5');
  const castle = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  assert.equal(matchMove(castle, '0-0').san, 'O-O');
  assert.equal(matchMove(castle, 'o-o-o').san, 'O-O-O');
});

test('matchMove: "x" left out of a piece capture is accepted', () => {
  const chess = after(['e4', 'd5', 'Nc3', 'd4', 'Nb5', 'e5']);
  assert.equal(matchMove(chess, 'Nd4').san, 'Nxd4');
});

test('matchMove NEGATIVE: an ambiguous Nd7 is refused, with both fixes offered', () => {
  // 1. d4 d5 2. c4 Nf6 3. Nc3: both black knights (b8, f6) can reach d7.
  const chess = after(['d4', 'd5', 'c4', 'Nf6', 'Nc3']);
  const found = matchMove(chess, 'Nd7');
  assert.equal(found.ok, false);
  assert.equal(found.code, 'ambiguous');
  assert.deepEqual(found.options.sort(), ['Nbd7', 'Nfd7']);
  assert.match(found.message, /Nbd7 or Nfd7/);
  assert.equal(matchMove(chess, 'nd7').code, 'ambiguous', 'lowercase does not make it less ambiguous');
  assert.equal(matchMove(chess, 'Nbd7').san, 'Nbd7');
  assert.equal(matchMove(chess, 'N8d7').san, 'Nbd7');
});

test('matchMove NEGATIVE: a promotion without a piece is refused', () => {
  const chess = new Chess('7k/P7/8/8/8/8/8/K7 w - - 0 1');
  const bare = matchMove(chess, 'a8');
  assert.equal(bare.ok, false);
  assert.equal(bare.code, 'promotion-needed');
  assert.match(bare.message, /a8=Q/);
  assert.equal(bare.options.length, 4);
  assert.equal(matchMove(chess, 'a7a8').code, 'promotion-needed', 'coordinates too');
  assert.equal(matchMove(chess, 'a8=Q').san, 'a8=Q+');
  assert.equal(matchMove(chess, 'a8Q').san, 'a8=Q+');
  assert.equal(matchMove(chess, 'a8=n').san, 'a8=N');
  assert.equal(matchMove(new Chess(), 'e4=Q').code, 'not-a-promotion');
});

test('matchMove NEGATIVE: lowercase b never becomes a bishop move', () => {
  const chess = after(['e4', 'e5']);
  const found = matchMove(chess, 'bc4');
  assert.equal(found.ok, false);
  assert.equal(found.code, 'lowercase-bishop');
  assert.deepEqual(found.options, ['Bc4']);
  // Where the b-pawn CAN take on c3, "bxc3" and "bc3" are the pawn, as in SAN.
  const both = new Chess('4k3/8/8/8/8/2n5/1P1B4/4K3 w - - 0 1');
  assert.equal(matchMove(both, 'bxc3').san, 'bxc3');
  assert.equal(matchMove(both, 'bc3').san, 'bxc3');
  assert.equal(matchMove(both, 'Bxc3').san, 'Bxc3');
});

test('matchMove NEGATIVE: a capture of nothing, castling as a king step, stray P and capitals', () => {
  const start = new Chess();
  const ghost = matchMove(start, 'Nxf3');
  assert.equal(ghost.code, 'not-a-capture');
  assert.deepEqual(ghost.options, ['Nf3']);
  const castle = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  assert.equal(matchMove(castle, 'Kg1').code, 'castle-notation');
  assert.equal(matchMove(start, 'Pe4').code, 'pawn-letter');
  assert.equal(matchMove(start, 'E4').code, 'uppercase-square');
  assert.equal(matchMove(start, 'O-O').code, 'illegal');
  assert.equal(matchMove(start, 'Ke2').code, 'illegal');
  assert.equal(matchMove(start, 'e2e5').code, 'illegal');
  assert.match(matchMove(start, 'e7e5').message, /black pawn; it is White's move/);
  assert.equal(matchMove(start, '').code, 'empty');
  assert.equal(matchMove(start, 'zz9').code, 'unreadable');
});

test('matchMove: en passant with or without the x and the e.p.', () => {
  const chess = new Chess('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
  for (const typed of ['exd6', 'ed6', 'exd6 e.p.', 'e5d6']) assert.equal(matchMove(chess, typed).san, 'exd6', typed);
});

test('matchMove: never changes the position it is asked about', () => {
  const chess = new Chess();
  const before = chess.fen();
  matchMove(chess, 'Nf3');
  matchMove(chess, 'Nxf3');
  assert.equal(chess.fen(), before);
});

// -- autocomplete ------------------------------------------------------------

test('suggestMoves: legal SAN that starts with what was typed, best first', () => {
  const start = new Chess();
  assert.deepEqual(suggestMoves(start, 'N'), ['Na3', 'Nc3', 'Nf3', 'Nh3']);
  assert.deepEqual(suggestMoves(start, 'nf'), ['Nf3']);
  assert.deepEqual(suggestMoves(start, 'e'), ['e3', 'e4']);
  assert.deepEqual(suggestMoves(start, 'g1'), ['Nf3', 'Nh3'], 'coordinates suggest the SAN');
  assert.deepEqual(suggestMoves(start, ''), []);
  assert.deepEqual(suggestMoves(start, 'Qh5'), [], 'nothing illegal is ever suggested');
  const center = after(['e4', 'd5']);
  assert.ok(suggestMoves(center, 'ed').includes('exd5'), 'x left out still finds the capture');
  const chess = after(['d4', 'd5', 'c4', 'Nf6', 'Nc3']);
  assert.deepEqual(suggestMoves(chess, 'Nd'), ['Nbd7', 'Nfd7']);
  assert.equal(suggestMoves(start, 'N', { limit: 2 }).length, 2);
});

// -- whole sheets ------------------------------------------------------------

test('splitMoveText: numbers, comments, variations and NAGs dropped; result kept apart', () => {
  const { tokens, result } = splitMoveText('1. e4 e5 2.Nf3 {good} Nc6 (2...d6 3. d4) 3 Bb5 $1 a6 1-0');
  assert.deepEqual(tokens, ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
  assert.equal(result, '1-0');
  assert.deepEqual(splitMoveText('17... Qe7 18. Rd1 ½-½'), { tokens: ['Qe7', 'Rd1'], result: '1/2-1/2' });
  assert.deepEqual(splitMoveText(''), { tokens: [], result: null });
});

test('replayMoves: the Opera Game replays to mate', () => {
  const r = replayMoves(START_FEN, OPERA);
  assert.equal(r.error, null);
  assert.equal(r.moves.length, 33);
  assert.equal(r.moves[21].san, 'Nbd7');
  assert.deepEqual(r.over, { result: '1-0', reason: 'checkmate' });
  assert.equal(plyLabel(r.moves[32].moveNumber, r.moves[32].color, r.moves[32].san), '17. Rd8#');
});

test('replayMoves NEGATIVE: an illegal move at ply 17 is flagged at exactly that ply', () => {
  const sheet = [...OPERA];
  sheet[16] = 'Ke3'; // 9. Bg5 misread as a king walk
  const r = replayMoves(START_FEN, sheet);
  assert.equal(r.moves.length, 16, 'everything before it is kept');
  assert.equal(r.error.index, 16);
  assert.equal(r.error.moveNumber, 9);
  assert.equal(r.error.color, 'w');
  assert.equal(r.error.code, 'illegal');
  assert.match(r.error.message, /^9\. Ke3 is not a legal move/);
  assert.equal(r.fen, after(OPERA.slice(0, 16)).fen(), 'the board shows the position the bad move was played in');
});

test('replayMoves NEGATIVE: "Nd7" where the sheet should say Nbd7 is flagged at ply 22', () => {
  const sheet = [...OPERA];
  sheet[21] = 'Nd7';
  const r = replayMoves(START_FEN, sheet);
  assert.equal(r.error.index, 21);
  assert.equal(r.error.code, 'ambiguous');
  assert.match(r.error.message, /^11\.\.\. Nd7 is ambiguous/);
  assert.deepEqual(r.error.options.sort(), ['Nbd7', 'Nfd7']);
});

test('replayMoves NEGATIVE: moves after mate are refused; moves after a claimable draw are not', () => {
  const r = replayMoves(START_FEN, ['f3', 'e5', 'g4', 'Qh4#', 'a3']);
  assert.equal(r.error.code, 'after-end');
  assert.equal(r.error.index, 4);
  assert.deepEqual(r.over, { result: '0-1', reason: 'checkmate' });

  // Threefold repetition must be claimed, so the game may go on.
  const shuffle = ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8', 'e4'];
  assert.equal(replayMoves(START_FEN, shuffle).error, null);
});

test('replayMoves: from a set-up position, numbering follows the FEN', () => {
  const r = replayMoves('4k3/8/8/8/8/8/4P3/4K3 b - - 0 20', ['Kd7', 'e4']);
  assert.equal(r.error, null);
  assert.equal(plyLabel(r.moves[0].moveNumber, r.moves[0].color), '20...');
  assert.equal(plyLabel(r.moves[1].moveNumber, r.moves[1].color), '21.');
  assert.equal(replayMoves('not a fen', ['e4']).error.code, 'bad-fen');
});

test('replayMoves: a 40-move sheet checks in well under a second', () => {
  // A deterministic 80-ply game: always the first legal move that does not end it.
  const chess = new Chess();
  const tokens = [];
  let seed = 7;
  while (tokens.length < 80) {
    const legal = chess.moves({ verbose: true });
    seed = (seed * 1103515245 + 12345) % 2147483648;
    let pick = null;
    for (let i = 0; i < legal.length && !pick; i += 1) {
      const mv = legal[(seed + i) % legal.length];
      const probe = chess.clone();
      probe.move(mv);
      if (!probe.isGameOver()) pick = mv;
    }
    chess.move(pick);
    tokens.push(pick.san);
  }
  const started = Date.now();
  const r = replayMoves(START_FEN, tokens);
  const ms = Date.now() - started;
  assert.equal(r.error, null);
  assert.equal(r.moves.length, 80);
  assert.ok(ms < 1000, `took ${ms}ms`);
});
