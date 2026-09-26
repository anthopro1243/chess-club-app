import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explainMoment, explainTurningPoints, chancesBand, formatLine, lineToSan } from './explain.js';
import { Chess } from '../engine/chess.js';

/*
 * Every fixture is a real position, and every claim is checked against it.
 * Evaluations are in the MOVER's point of view, as buildPlyRecords stores them.
 */

// 1.e4 e5 2.Nf3 Nc6, White to play 3.Nxe5?, leaving the knight to Nxe5.
const HANG = {
  ply: 5, fullmove: 3, side: 'w', san: 'Nxe5', uci: 'f3e5',
  fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
  cpBefore: 30, cpAfter: -250, bestUci: 'f1b5', bestPv: ['f1b5', 'a7a6', 'b5a4'],
  replyPv: ['c6e5', 'd2d4'], hangs: true, motifs: ['hangingPiece'], moveSeconds: 3,
};

// Scholar's position: White to play has Qxf7#, plays 4.d3 instead.
const MISSED_MATE = {
  ply: 7, fullmove: 4, side: 'w', san: 'd3', uci: 'd2d3',
  fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
  mateBefore: 1, cpAfter: -400, bestUci: 'h5f7', bestPv: ['h5f7'], motifs: [],
};

// Black to play after 3.Qh5; 3...Nf6?? allows Qxf7#.
const ALLOWED_MATE = {
  ply: 6, fullmove: 3, side: 'b', san: 'Nf6', uci: 'g8f6',
  fen: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3',
  cpBefore: -40, mateAfter: -1, bestUci: 'g7g6', bestPv: ['g7g6', 'h5f3'], replyPv: ['h5f7'], motifs: [],
};

// Black to play; ...h6?? allows Nc7+ forking king and rook.
const FORK = {
  ply: 40, fullmove: 20, side: 'b', san: 'h6', uci: 'h7h6',
  fen: 'r3k3/7p/8/1N6/8/8/8/4K3 b - - 0 20',
  cpBefore: 180, cpAfter: -150, bestUci: 'e8d7', bestPv: ['e8d7'], replyPv: ['b5c7', 'e8d7', 'c7a8'],
  motifs: ['fork'],
};

const words = (e) => `${e.headline} ${e.detail}`.toLowerCase();

test('chancesBand: symmetric around an even game', () => {
  assert.equal(chancesBand(50).key, 'even');
  assert.equal(chancesBand(75).key, 'clearlyBetter');
  assert.equal(chancesBand(25).key, 'clearlyWorse');
  assert.equal(chancesBand(null), null);
  assert.equal(chancesBand(50, 3).key, 'forcedWin');
});

test('formatLine / lineToSan: numbered from the right side, stops at an illegal move', () => {
  const board = new Chess(HANG.fen);
  assert.deepEqual(lineToSan(board, ['f1b5', 'a7a6', 'zzzz', 'b5a4']), ['Bb5', 'a6']);
  assert.equal(formatLine(board, ['Bb5', 'a6']), '3. Bb5 a6');
  const black = new Chess(FORK.fen);
  assert.equal(formatLine(black, ['Kd7', 'Nc7']), '20... Kd7 21. Nc7');
});

test('hanging piece: names the piece, the square and the capture, and the better move', () => {
  const e = explainMoment(HANG);
  assert.equal(e.kind, 'hangingPiece');
  assert.equal(e.headline, 'Left the knight on e5 hanging');
  assert.match(e.detail, /Black can win the knight on e5 for free with Nxe5/);
  assert.match(e.detail, /Better was Bb5/);
  assert.match(e.detail, /played in 3 seconds/);
  assert.equal(e.confidence, 'high');
  assert.ok(e.basis.includes('see'));
});

test('missed mate: says the mating move once, not twice', () => {
  const e = explainMoment(MISSED_MATE);
  assert.equal(e.headline, 'Missed mate in 1');
  assert.match(e.detail, /Qxf7# was checkmate/);
  assert.doesNotMatch(e.detail, /Better was/);
});

test('allowed mate: shows the opponent\'s mating move', () => {
  const e = explainMoment(ALLOWED_MATE);
  assert.equal(e.headline, 'Allowed mate in 1');
  assert.match(e.detail, /White can checkmate at once with Qxf7#/);
});

test('fork: names the forking move and both targets', () => {
  const e = explainMoment(FORK);
  assert.equal(e.kind, 'fork');
  assert.equal(e.headline, 'Allowed a knight fork');
  assert.match(e.detail, /White can answer with Nc7\+, attacking the king and the rook on a8 at once/);
});

test('NO motif tag → no tactical claim, only the swing', () => {
  const e = explainMoment({ ...FORK, motifs: [], replyPv: [] });
  assert.equal(e.kind, 'swing');
  assert.doesNotMatch(words(e), /fork|hanging|back rank|tactic/);
  assert.match(e.detail, /winning chances|This turned/);
});

test('NO best move → no "better was"', () => {
  const e = explainMoment({ ...HANG, bestUci: null, bestPv: [] });
  assert.doesNotMatch(e.detail, /Better was/);
  assert.equal(e.line, null);
});

test('a tiny swing gets no explanation at all', () => {
  assert.equal(explainMoment({ ...HANG, cpBefore: 30, cpAfter: 20, hangs: false, motifs: [] }), null);
});

test('a flagged sacrifice is never called a mistake', () => {
  const e = explainMoment({ ...HANG, sacrifice: true, uci: 'f1b5', san: 'Bb5' });
  assert.equal(e.kind, 'sacrifice');
  assert.doesNotMatch(words(e), /hanging|you should/);
  assert.match(e.headline, /not a mistake/);
});

test('the engine\'s own choice is never called a mistake', () => {
  const e = explainMoment({ ...HANG, uci: 'f1b5', san: 'Bb5', hangs: false, motifs: [] });
  assert.equal(e.kind, 'engineChoice');
});

test('"hangs" with a reply that does not capture → no piece named', () => {
  const e = explainMoment({ ...HANG, replyPv: ['d7d6'] });
  assert.equal(e.headline, 'Left material hanging');
  assert.doesNotMatch(e.detail, /knight on e5/);
});

test('facts from the wrong ply are refused, not borrowed', () => {
  const moment = { ply: 9, san: 'Nxe5', played: 'f3e5', winPercentLost: 30, motifs: [], label: 'blunder' };
  const e = explainMoment(moment, { ply: HANG }); // HANG is ply 5
  assert.doesNotMatch(e.detail, /knight on e5|Better was/);
});

test('book moves and junk input are skipped', () => {
  assert.equal(explainMoment({ ...HANG, label: 'book' }), null);
  assert.equal(explainMoment(null), null);
  assert.equal(explainMoment('x'), null);
});

test('explainTurningPoints: looks each moment up by ply', () => {
  const out = explainTurningPoints(
    [{ ply: 5, san: 'Nxe5', played: 'f3e5', motifs: ['hangingPiece'] }],
    new Map([[5, HANG]]),
  );
  assert.equal(out[0].explanation.kind, 'hangingPiece');
});
