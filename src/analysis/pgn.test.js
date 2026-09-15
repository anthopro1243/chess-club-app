/*
 * Gates 2 and 3 — the PGN importer.
 *
 * A parser that silently drops a move produces an analysis that is wrong in a
 * way nobody will ever catch: the numbers still look plausible, they are just
 * about a different game. So every fixture here is replayed through the real
 * rules engine, and the move counts are asserted explicitly.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from '../engine/chess.js';
import {
  parsePgn,
  parseAndValidate,
  parseClockToSeconds,
  parseEvalToCp,
  parseIncrement,
} from './pgn.js';

/* ── fixtures ────────────────────────────────────────────────────────────── */

// A Chess.com-shaped export: clock comment after every ply, 10+5 time control.
const CHESSCOM = `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2026.09.01"]
[White "alice"]
[Black "bob"]
[Result "1-0"]
[TimeControl "600+5"]

1. e4 {[%clk 0:09:58]} 1... e5 {[%clk 0:09:57]} 2. Nf3 {[%clk 0:09:55]} 2... Nc6 {[%clk 0:09:50]}
3. Bb5 {[%clk 0:09:52]} 3... a6 {[%clk 0:09:44]} 4. Ba4 {[%clk 0:09:49]} 4... Nf6 {[%clk 0:09:40]} 1-0
`;

// Mainline is e4 e5 Nf3 Nc6 — everything in parentheses must be ignored,
// including a variation that itself contains a variation and a comment.
const WITH_VARIATIONS = `[Event "Variations"]
[Result "*"]

1. e4 (1. d4 d5 (1... Nf6 2. c4 {a nested comment with { braces } inside}) 2. c4) 1... e5
2. Nf3 (2. Bc4 Nf6 (2... Bc5 3. Qh5)) 2... Nc6 *
`;

const MULTI_GAME = `${CHESSCOM}
[Event "Second Game"]
[White "carol"]
[Black "dave"]
[Result "0-1"]
[TimeControl "300"]

1. d4 d5 2. c4 e6 0-1
`;

/* ── Gate 2: parse, then replay every move through the engine ────────────── */

test('Gate 2a — a Chess.com export parses and every SAN is legal', () => {
  const [game] = parseAndValidate(CHESSCOM);
  assert.equal(game.tags.White, 'alice');
  assert.equal(game.tags.Site, 'Chess.com');
  assert.equal(game.tags.TimeControl, '600+5');
  assert.equal(game.result, '1-0');
  assert.equal(game.moves.length, 8);
  assert.deepEqual(
    game.moves.map((m) => m.san),
    ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6'],
  );
  // parseAndValidate attaches the position each move was played from.
  assert.ok(game.moves[0].fenBefore.startsWith('rnbqkbnr/pppppppp'));
  assert.equal(typeof game.moves[7].fenBefore, 'string');
});

test('Gate 2a — replaying the mainline independently reaches the same move count', () => {
  const [game] = parsePgn(CHESSCOM);
  const board = new Chess();
  let played = 0;
  for (const m of game.moves) {
    assert.ok(board.move(m.san), `move ${m.san} should be legal`);
    played += 1;
  }
  assert.equal(played, game.moves.length);
});

test('Gate 2b — nested recursive variations do not touch the mainline', () => {
  const [game] = parseAndValidate(WITH_VARIATIONS);
  assert.equal(game.moves.length, 4);
  assert.deepEqual(game.moves.map((m) => m.san), ['e4', 'e5', 'Nf3', 'Nc6']);
  // d4/d5/c4/Bc4/Qh5 live only inside variations and must not appear.
  const sans = game.moves.map((m) => m.san);
  for (const ghost of ['d4', 'd5', 'c4', 'Bc4', 'Qh5', 'Bc5']) {
    assert.ok(!sans.includes(ghost), `${ghost} came from a variation and must be skipped`);
  }
  // The comment inside the variation must not leak onto a mainline move.
  assert.equal(game.moves[0].comment, null);
});

test('Gate 2c — a multi-game file splits correctly and each game validates', () => {
  const games = parseAndValidate(MULTI_GAME);
  assert.equal(games.length, 2);
  assert.equal(games[0].tags.White, 'alice');
  assert.equal(games[0].moves.length, 8);
  assert.equal(games[1].tags.White, 'carol');
  assert.equal(games[1].result, '0-1');
  assert.deepEqual(games[1].moves.map((m) => m.san), ['d4', 'd5', 'c4', 'e6']);
});

/* ── Gate 3: clock arithmetic ────────────────────────────────────────────── */

test('Gate 3 — the first move of each side is null, never zero', () => {
  const [game] = parsePgn(CHESSCOM);
  // This is the whole point of the gate: a 0 here reads as "played instantly"
  // and silently wrecks the time-management score.
  assert.equal(game.moves[0].moveSeconds, null);
  assert.equal(game.moves[1].moveSeconds, null);
  assert.notEqual(game.moves[0].moveSeconds, 0);
  assert.notEqual(game.moves[1].moveSeconds, 0);
});

test('Gate 3 — seconds spent = clk[n-2] - clk[n] + increment, same player', () => {
  const [game] = parsePgn(CHESSCOM);
  // White: 598 -> 595 with a 5s increment = 8 seconds spent on 2. Nf3.
  assert.equal(game.moves[2].moveSeconds, 8);
  // Black: 597 -> 590 + 5 = 12 seconds on 2... Nc6.
  assert.equal(game.moves[3].moveSeconds, 12);
  assert.equal(game.moves[4].moveSeconds, 8);
  assert.equal(game.moves[5].moveSeconds, 11);
  assert.equal(game.moves[6].moveSeconds, 8);
  assert.equal(game.moves[7].moveSeconds, 9);
});

test('Gate 3 — clocks are read off every ply', () => {
  const [game] = parsePgn(CHESSCOM);
  assert.equal(game.moves[0].clockSeconds, 598);
  assert.equal(game.moves[1].clockSeconds, 597);
  assert.equal(game.moves[7].clockSeconds, 580);
});

test('Gate 3 — with no increment the arithmetic is a plain difference', () => {
  const noInc = `[TimeControl "300"]

1. e4 {[%clk 0:04:58]} 1... e5 {[%clk 0:04:57]} 2. Nf3 {[%clk 0:04:50]} 2... Nc6 {[%clk 0:04:40]} *
`;
  const [game] = parsePgn(noInc);
  assert.equal(game.moves[2].moveSeconds, 8); // 298 -> 290
  assert.equal(game.moves[3].moveSeconds, 17); // 297 -> 280
});

test('Gate 3 — a missing clock yields null rather than a fabricated number', () => {
  const partial = `[TimeControl "600+0"]

1. e4 {[%clk 0:09:58]} 1... e5 2. Nf3 {[%clk 0:09:50]} 2... Nc6 {[%clk 0:09:30]} *
`;
  const [game] = parsePgn(partial);
  assert.equal(game.moves[1].clockSeconds, null);
  assert.equal(game.moves[2].moveSeconds, 8); // white still measurable
  assert.equal(game.moves[3].moveSeconds, null); // black's prior reading missing
});

test('clock, eval and increment helpers', () => {
  assert.equal(parseClockToSeconds('0:09:58'), 598);
  assert.equal(parseClockToSeconds('1:00:00'), 3600);
  assert.equal(parseClockToSeconds('2:30'), 150);
  assert.equal(parseClockToSeconds('0:00:05.3'), 5.3);
  assert.equal(parseClockToSeconds('nonsense'), null);

  assert.equal(parseEvalToCp('-1.24'), -124);
  assert.equal(parseEvalToCp('0.31'), 31);
  assert.equal(parseEvalToCp('#3'), null); // mate is not a centipawn value
  assert.equal(parseEvalToCp('-#2'), null);

  assert.equal(parseIncrement('600+5'), 5);
  assert.equal(parseIncrement('300'), 0);
  assert.equal(parseIncrement('-'), 0);
  assert.equal(parseIncrement('40/7200:1800+30'), 30);
  assert.equal(parseIncrement(undefined), 0);
});

/* ── SAN coverage: the forms real exports actually contain ───────────────── */

test('promotion with check replays legally', () => {
  const pgn = `[FEN "7k/P7/8/8/8/8/8/K7 w - - 0 1"]
[SetUp "1"]

1. a8=Q+ Kh7 *
`;
  const [game] = parseAndValidate(pgn);
  assert.equal(game.moves.length, 2);
  assert.equal(game.moves[0].san, 'a8=Q+');
});

test('castling parses in both the letter-O and digit-zero spellings', () => {
  const pgn = `[FEN "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"]
[SetUp "1"]

1. 0-0 0-0-0 *
`;
  const [game] = parseAndValidate(pgn);
  assert.equal(game.moves.length, 2);
  // Normalised to the form the engine itself generates.
  assert.equal(game.moves[0].san, 'O-O');
  assert.equal(game.moves[1].san, 'O-O-O');
});

test('digit-zero castling is not mistaken for the 0-1 result token', () => {
  const [game] = parsePgn(`[FEN "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"]

1. 0-0-0 0-1
`);
  assert.equal(game.moves.length, 1);
  assert.equal(game.moves[0].san, 'O-O-O');
  assert.equal(game.result, '0-1');
});

test('file disambiguation (Nbd7) replays legally', () => {
  const pgn = `[Event "Disambiguation"]

1. d4 Nf6 2. c4 e6 3. Nc3 d5 4. Bg5 Nbd7 *
`;
  const [game] = parseAndValidate(pgn);
  assert.equal(game.moves.length, 8);
  assert.equal(game.moves[7].san, 'Nbd7');
});

test('rank disambiguation (R1a4) replays legally', () => {
  const pgn = `[FEN "R7/8/7k/8/8/8/8/R3K3 w - - 0 1"]
[SetUp "1"]

1. R1a4 Kh5 *
`;
  const [game] = parseAndValidate(pgn);
  assert.equal(game.moves[0].san, 'R1a4');
});

test('over-disambiguated SAN (Qh4xe1) is tolerated', () => {
  // Some exporters write the long form; the engine renders it as Qxe1.
  const pgn = `[FEN "4k3/8/8/8/7q/8/8/4K3 b - - 0 1"]
[SetUp "1"]

1... Qh4xe1 *
`;
  const [game] = parseAndValidate(pgn);
  assert.equal(game.moves.length, 1);
});

/* ── annotations ─────────────────────────────────────────────────────────── */

test('NAGs, inline glyphs, prose comments and %eval are all captured', () => {
  const pgn = `[Event "Annotated"]

1. e4 $1 {[%eval 0.31] a solid start} 1... e5?! {[%clk 0:05:00]} 2. Nf3!! $10 ; trailing comment
2... Nc6 *
`;
  const [game] = parsePgn(pgn);
  assert.ok(game.moves[0].nags.includes(1));
  assert.equal(game.moves[0].evalCp, 31);
  assert.equal(game.moves[0].comment, 'a solid start');
  assert.ok(game.moves[1].nags.includes(6)); // ?! => $6
  assert.equal(game.moves[1].san, 'e5'); // glyph stripped off the SAN
  assert.ok(game.moves[2].nags.includes(3)); // !! => $3
  assert.ok(game.moves[2].nags.includes(10));
});

test('a semicolon comment does not swallow the following move', () => {
  const [game] = parsePgn(`1. e4 ; a remark
1... e5 2. Nf3 *
`);
  assert.deepEqual(game.moves.map((m) => m.san), ['e4', 'e5', 'Nf3']);
});

/* ── refusing to guess ───────────────────────────────────────────────────── */

test('a null move abandons that game rather than mis-parsing it', () => {
  const [game] = parsePgn(`[Event "Null"]

1. e4 -- 2. d4 *
`);
  assert.equal(game.invalid, true);
  assert.match(game.error, /null move/i);
  assert.throws(() => parseAndValidate('[Event "Null"]\n\n1. e4 -- 2. d4 *\n'), /null move/i);
});

test('an illegal move throws, naming the move and the position', () => {
  assert.throws(
    () => parseAndValidate('[Event "Bad"]\n\n1. e4 e5 2. Qxf7 *\n'),
    (err) => {
      assert.match(err.message, /illegal move/i);
      assert.match(err.message, /Qxf7/);
      return true;
    },
  );
});

test('the Result tag is used when no result token closes the movetext', () => {
  const [game] = parsePgn(`[Result "1-0"]

1. e4 e5
`);
  assert.equal(game.result, '1-0');
});
