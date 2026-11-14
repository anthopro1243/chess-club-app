/*
 * Correctness tests for the chess engine.
 *
 * The perft cases are the standard published node counts from the Chess
 * Programming Wiki. If move generation has any bug at all — a missed en
 * passant, a castle through check, a wrong pin — these numbers will not match.
 *
 * Run with:  node src/engine/chess.test.mjs
 */

import { Chess, perft, START_FEN } from './chess.js';

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  const ok = actual === expected;
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}\n        expected ${expected}\n        got      ${actual}`);
  }
}

// ---------------------------------------------------------------------------
// Perft: move-generation node counts
// ---------------------------------------------------------------------------

const PERFT_CASES = [
  {
    name: 'Start position',
    fen: START_FEN,
    counts: [20, 400, 8902, 197281],
  },
  {
    name: 'Kiwipete (castling, pins, en passant)',
    fen: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    counts: [48, 2039, 97862],
  },
  {
    name: 'Position 3 (en passant edge cases)',
    fen: '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
    counts: [14, 191, 2812, 43238],
  },
  {
    name: 'Position 4 (promotions under check)',
    fen: 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1',
    counts: [6, 264, 9467],
  },
  {
    name: 'Position 5',
    fen: 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8',
    counts: [44, 1486, 62379],
  },
  {
    name: 'Position 6',
    fen: 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10',
    counts: [46, 2079, 89890],
  },
];

console.log('\nPerft (move generation node counts)');
for (const testCase of PERFT_CASES) {
  console.log(`\n  ${testCase.name}`);
  const chess = new Chess(testCase.fen);
  testCase.counts.forEach((expected, index) => {
    const depth = index + 1;
    const started = Date.now();
    const nodes = perft(chess, depth);
    const ms = Date.now() - started;
    check(`depth ${depth} (${ms}ms)`, nodes, expected);
    // The board must be exactly as it started after perft unwinds.
    check(`depth ${depth} restores position`, chess.fen(), testCase.fen);
  });
}

// ---------------------------------------------------------------------------
// Rules and notation
// ---------------------------------------------------------------------------

console.log('\nRules and notation');

// Scholar's mate — checkmate detection and the '#' suffix.
{
  const chess = new Chess();
  ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#'].forEach((san) => chess.move(san));
  check("Scholar's mate is checkmate", chess.isCheckmate(), true);
  check("Scholar's mate result", chess.status().result, '1-0');
  check('final move SAN carries #', chess.moveHistory().at(-1), 'Qxf7#');
}

// Fool's mate — black delivers mate.
{
  const chess = new Chess();
  ['f3', 'e5', 'g4', 'Qh4#'].forEach((san) => chess.move(san));
  check("Fool's mate is checkmate", chess.isCheckmate(), true);
  check("Fool's mate result", chess.status().result, '0-1');
}

// Stalemate position.
{
  const chess = new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  check('stalemate detected', chess.isStalemate(), true);
  check('stalemate is not checkmate', chess.isCheckmate(), false);
  check('stalemate result', chess.status().result, '1/2-1/2');
}

// Castling both sides.
{
  const chess = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  const sans = chess.moves();
  check('white can castle kingside', sans.includes('O-O'), true);
  check('white can castle queenside', sans.includes('O-O-O'), true);
  chess.move('O-O');
  check('king landed on g1', chess.get('g1').type, 'k');
  check('rook landed on f1', chess.get('f1').type, 'r');
  check('h1 is now empty', chess.get('h1'), null);
  chess.undo();
  check('undo restores castle', chess.fen(), 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
}

// Cannot castle through check.
{
  const chess = new Chess('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  const blocked = new Chess('4k3/8/8/8/8/8/5r2/R3K2R w KQ - 0 1');
  check('castling legal when f1 is safe', chess.moves().includes('O-O'), true);
  check('castling illegal through an attacked f1', blocked.moves().includes('O-O'), false);
}

// En passant.
{
  const chess = new Chess();
  ['e4', 'a6', 'e5', 'd5'].forEach((san) => chess.move(san));
  check('en passant square is set', chess.fen().split(' ')[3], 'd6');
  check('exd6 e.p. is available', chess.moves().includes('exd6'), true);
  chess.move('exd6');
  check('captured pawn removed from d5', chess.get('d5'), null);
  check('capturing pawn on d6', chess.get('d6').color, 'w');
  chess.undo();
  check('undo restores the en passant capture', chess.get('d5').color, 'b');
}

// Promotion, including underpromotion.
{
  const chess = new Chess('8/P6k/8/8/8/8/8/7K w - - 0 1');
  const sans = chess.moves();
  check('all four promotions offered', ['a8=Q', 'a8=R', 'a8=B', 'a8=N'].every((s) => sans.includes(s)), true);
  chess.move({ from: 'a7', to: 'a8', promotion: 'n' });
  check('underpromoted to a knight', chess.get('a8').type, 'n');
  chess.undo();
  check('undo restores the pawn', chess.get('a7').type, 'p');
}

// A pinned piece cannot move.
{
  const chess = new Chess('4k3/8/8/8/8/8/4R3/4K3 b - - 0 1');
  const pinned = new Chess('4k3/4r3/8/8/8/8/4R3/4K3 b - - 0 1');
  check('rook free when not pinned', chess.moves({ square: 'e8' }).length > 0, true);
  const pinnedMoves = pinned.moves({ square: 'e7' }).map((s) => s.replace(/[+#]$/, ''));
  // The only legal rook moves are up and down the e-file, ending in Rxe2.
  check(
    'pinned rook may only move along the pin',
    JSON.stringify(pinnedMoves),
    JSON.stringify(['Re6', 'Re5', 'Re4', 'Re3', 'Rxe2']),
  );
}

// SAN disambiguation.
{
  // Two rooks on the back rank, both able to reach d8: disambiguate by file.
  const chess = new Chess('R6R/8/8/8/8/8/8/4K1k1 w - - 0 1');
  const sans = chess.moves().map((s) => s.replace(/[+#]$/, ''));
  check('rooks disambiguate by file (a-rook)', sans.includes('Rad8'), true);
  check('rooks disambiguate by file (h-rook)', sans.includes('Rhd8'), true);

  // A rook blocked by its own king needs no disambiguation at all.
  const blocked = new Chess('8/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  check('no disambiguation when only one rook can get there', blocked.moves().includes('Rb1'), true);
}
{
  // Two knights on the same file both reaching f4: disambiguate by rank.
  const knights = new Chess('8/8/8/3N4/8/3N4/8/K5k1 w - - 0 1');
  const sans = knights.moves().map((s) => s.replace(/[+#]$/, ''));
  check('knights on one file disambiguate by rank', sans.includes('N5f4'), true);
  check('knights on one file disambiguate by rank (2)', sans.includes('N3f4'), true);
}
{
  // Queens on a1 and h1 both reaching d1.
  const queens = new Chess('7k/8/8/8/8/8/8/Q6Q w - - 0 1');
  const sans = queens.moves().map((s) => s.replace(/[+#]$/, ''));
  check('queens disambiguate by file', sans.includes('Qad1'), true);
  check('queens disambiguate by file (2)', sans.includes('Qhd1'), true);
}

// Draw by insufficient material.
{
  check('K vs K is a draw', new Chess('4k3/8/8/8/8/8/8/4K3 w - - 0 1').isInsufficientMaterial(), true);
  check('K+N vs K is a draw', new Chess('4k3/8/8/8/8/8/8/3NK3 w - - 0 1').isInsufficientMaterial(), true);
  check('K+R vs K is not', new Chess('4k3/8/8/8/8/8/8/3RK3 w - - 0 1').isInsufficientMaterial(), false);
}

// Threefold repetition.
{
  const chess = new Chess();
  for (let i = 0; i < 2; i++) {
    ['Nf3', 'Nf6', 'Ng1', 'Ng8'].forEach((san) => chess.move(san));
  }
  check('threefold repetition detected', chess.isThreefoldRepetition(), true);
  chess.undo();
  check('undo clears the repetition claim', chess.isThreefoldRepetition(), false);
}

// FEN round-trips.
{
  const fens = [
    START_FEN,
    'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
    'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8',
  ];
  fens.forEach((fen, i) => check(`FEN round-trip ${i + 1}`, new Chess(fen).fen(), fen));
}

// Move counters.
{
  const chess = new Chess();
  chess.move('e4');
  check('halfmove clock resets on a pawn move', chess.fen().split(' ')[4], '0');
  chess.move('Nf6');
  check('fullmove number advances after black', chess.fen().split(' ')[5], '2');
  check('halfmove clock counts both piece moves', chess.fen().split(' ')[4], '1');
  chess.move('Nc3');
  check('halfmove clock keeps incrementing', chess.fen().split(' ')[4], '2');
}

// Illegal input is rejected rather than corrupting the board.
{
  const chess = new Chess();
  check('illegal SAN returns null', chess.move('Qh5'), null);
  check('illegal object move returns null', chess.move({ from: 'e1', to: 'e5' }), null);
  check('board untouched after illegal moves', chess.fen(), START_FEN);
}

// PGN export.
{
  const chess = new Chess();
  ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'].forEach((san) => chess.move(san));
  const pgn = chess.pgn({ White: 'CC-001', Black: 'CC-002', Event: 'Club Ladder' });
  check('PGN has the White tag', pgn.includes('[White "CC-001"]'), true);
  check('PGN movetext is numbered', pgn.includes('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6'), true);
  check('PGN carries the ongoing result', pgn.trim().endsWith('*'), true);
}

// A full replay: play every legal move at random for a while and make sure
// the engine never lands in an inconsistent state.
{
  let ok = true;
  for (let game = 0; game < 20; game++) {
    const chess = new Chess();
    for (let ply = 0; ply < 120 && !chess.isGameOver(); ply++) {
      const options = chess.moves({ verbose: true });
      if (!options.length) break;
      const pick = options[Math.floor(Math.random() * options.length)];
      const before = chess.fen();
      const played = chess.move({ from: pick.from, to: pick.to, promotion: pick.promotion });
      if (!played) {
        ok = false;
        console.log(`        random game broke at ${before} playing ${pick.san}`);
        break;
      }
      // FEN must survive a round-trip through the parser at every ply.
      if (new Chess(chess.fen()).fen() !== chess.fen()) {
        ok = false;
        break;
      }
    }
  }
  check('20 random games play out cleanly', ok, true);
}

// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
