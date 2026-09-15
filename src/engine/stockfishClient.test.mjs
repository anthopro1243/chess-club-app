/*
 * Gate 1 — the sign convention, plus info-line parsing.
 *
 * This is the one error that produces confident, fluent, completely inverted
 * coaching that nothing downstream reveals: if the sign is wrong, a blunder
 * reads as a brilliancy and the engine cheerfully tells a 12-year-old to keep
 * doing it. Everything else in the analyzer is built on top of these numbers,
 * so they get pinned against positions whose truth is not a matter of opinion.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine, parseInfo } from './stockfishClient.js';
import { createNodeTransport } from './nodeTransport.js';
import { Chess } from './chess.js';
import { normaliseAfter } from '../analysis/scoring.js';

/* ── pure parsing: no engine needed ──────────────────────────────────────── */

test('parseInfo: reads depth, multipv, score and pv', () => {
  const info = parseInfo('info depth 12 seldepth 18 multipv 2 score cp -45 nodes 123456 nps 900000 pv e2e4 e7e5 g1f3');
  assert.equal(info.depth, 12);
  assert.equal(info.multipv, 2);
  assert.equal(info.cp, -45);
  assert.equal(info.mate, null);
  assert.equal(info.nodes, 123456);
  assert.deepEqual(info.pv, ['e2e4', 'e7e5', 'g1f3']);
});

test('parseInfo: mate scores are kept as mate, not centipawns', () => {
  const info = parseInfo('info depth 5 multipv 1 score mate -3 nodes 900 pv d8h4');
  assert.equal(info.mate, -3);
  assert.equal(info.cp, null);
});

test('parseInfo: fail-high/fail-low reports are ignored, not read as scores', () => {
  // These are aspiration-window bounds, not evaluations. Treating one as a
  // score is a classic source of a single wildly wrong move classification.
  assert.equal(parseInfo('info depth 12 multipv 1 score cp 900 upperbound nodes 5 pv e2e4'), null);
  assert.equal(parseInfo('info depth 12 multipv 1 score cp -900 lowerbound nodes 5 pv e2e4'), null);
});

test('parseInfo: lines carrying no score are ignored', () => {
  assert.equal(parseInfo('info depth 1 currmove e2e4 currmovenumber 1'), null);
  assert.equal(parseInfo('bestmove e2e4 ponder e7e5'), null);
});

/* ── the real engine ─────────────────────────────────────────────────────── */

let engine;
test('engine boots under Node', async () => {
  engine = createEngine({ transport: await createNodeTransport() });
  const name = await engine.engineName();
  assert.match(name, /Stockfish/i);
});

test('Gate 1a — fool\'s mate: sign and best-move extraction', async () => {
  // 1.f3 e5 2.g4 — Black to move and mate in one with Qd8-h4.
  const foolsMate = 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2';
  const r = await engine.evaluate(foolsMate, { depth: 12, multiPV: 2 });

  assert.ok(r.lines.length >= 1, 'expected at least one line');
  // Mate is reported for the side to move, which here is Black. A positive
  // mate distance means "the side to move mates", so +1, never -1.
  assert.equal(r.lines[0].mate, 1);
  assert.equal(r.lines[0].pv[0], 'd8h4');
});

test('Gate 1b — queen vs bare king stays winning for White after normaliseAfter', async () => {
  const qvk = '4k3/8/8/8/8/8/8/3QK3 w - - 0 1';
  const before = await engine.evaluate(qvk, { depth: 12 });
  assert.ok(
    before.lines[0].cp > 500 || before.lines[0].mate > 0,
    `White to move should be winning, got cp=${before.lines[0].cp} mate=${before.lines[0].mate}`,
  );

  // Play a quiet queen move and evaluate the resulting position. Stockfish now
  // reports from BLACK's point of view, so the raw number is strongly negative.
  const board = new Chess(qvk);
  const played = board.move({ from: 'd1', to: 'a1' });
  assert.ok(played, 'Qd1-a1 should be legal');

  const rawAfter = await engine.evaluate(board.fen(), { depth: 12 });
  assert.ok(
    rawAfter.lines[0].cp < 0 || rawAfter.lines[0].mate < 0,
    'raw score after White moves is from Black\'s point of view and must read as losing',
  );

  // Flipped back into the mover's (White's) point of view, it must still be won.
  // If the convention were inverted this assertion is what catches it.
  const after = normaliseAfter(rawAfter.lines[0]);
  assert.ok(
    after.cp > 500 || after.mate > 0,
    `after normaliseAfter White should still be winning, got cp=${after.cp} mate=${after.mate}`,
  );
});

test('Gate 1c — multiPV returns distinct ranked alternatives', async () => {
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const r = await engine.evaluate(start, { depth: 10, multiPV: 3 });
  assert.equal(r.lines.length, 3);
  assert.deepEqual(r.lines.map((l) => l.multipv), [1, 2, 3]);
  const firstMoves = new Set(r.lines.map((l) => l.pv[0]));
  assert.equal(firstMoves.size, 3, 'each MultiPV line should start with a different move');
  // Ordered best first, from the side to move's point of view.
  assert.ok(r.lines[0].cp >= r.lines[1].cp);
  assert.ok(r.lines[1].cp >= r.lines[2].cp);
});

test('Gate 1d — a losing position reads as negative for the side to move', async () => {
  // Black is a queen down with White to move: score must be strongly positive
  // for White. The mirror of this is what a sign error would break.
  const whiteUp = '4k3/8/8/8/8/8/8/3QK3 w - - 0 1';
  const mirrored = '3qk3/8/8/8/8/8/8/4K3 w - - 0 1'; // now White is the one down
  const good = await engine.evaluate(whiteUp, { depth: 10 });
  const bad = await engine.evaluate(mirrored, { depth: 10 });
  const goodScore = good.lines[0].mate != null ? good.lines[0].mate * 10000 : good.lines[0].cp;
  const badScore = bad.lines[0].mate != null ? bad.lines[0].mate * 10000 : bad.lines[0].cp;
  assert.ok(goodScore > 0, 'up a queen must be positive for the side to move');
  assert.ok(badScore < 0, 'down a queen must be negative for the side to move');
});

test('engine shuts down', () => {
  engine.terminate();
});
