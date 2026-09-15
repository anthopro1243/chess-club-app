/*
 * motifs.js — why a blunder was a blunder.
 *
 * "You blundered six times" is a report. "You keep losing pieces to knight
 * forks" is coaching, and it is the difference between a player knowing they
 * are bad at tactics and knowing what to practise on Tuesday.
 *
 * v1 ships three motifs only — hangingPiece, fork, backRank. Between them they
 * cover the large majority of club-level blunders. The other five in the spec
 * (pin, skewer, discoveredAttack, trappedPiece, deflection) are each a geometry
 * function with its own edge cases and get added one at a time, with a test per
 * motif, rather than five half-right detectors at once.
 */

import { Chess, SQUARES, algebraic, PAWN, KING, WHITE, BLACK } from '../engine/chess.js';
import { see, PIECE_VALUES } from './see.js';

/** SEE at which a capture counts as winning real material. */
export const MATERIAL_THRESHOLD = 200;
/** SEE at which back-rank pressure counts as decisive rather than annoying. */
export const DECISIVE_THRESHOLD = 500;
/** "A piece worth >= 3" in the spec — a knight or better. */
export const VALUABLE_PIECE = 320;

const other = (color) => (color === WHITE ? BLACK : WHITE);

/** A copy of the position with `color` to move. Used to enumerate attacks. */
function withTurn(board, color) {
  const parts = board.fen().split(' ');
  if (parts[1] === color) return board.clone();
  parts[1] = color;
  parts[3] = '-'; // an en-passant square is meaningless once the turn is flipped
  return new Chess(parts.join(' '));
}

/**
 * Squares the piece on `fromAlg` attacks, irrespective of whose turn it is and
 * whether the move would be legal (a pinned piece still defends).
 */
export function attackedSquares(board, fromAlg) {
  const piece = board.get(fromAlg);
  if (!piece) return [];
  const from = SQUARES[fromAlg];
  if (from === undefined) return [];

  // Pawns need their own geometry. Move generation only emits a pawn's
  // diagonal when an enemy piece is already standing there, so asking it what
  // a pawn attacks returns the forward push and nothing else — which would
  // make every pawn fork invisible. The board is 0x88 with a8 = 0, so White
  // attacks up the board via -17/-15 and Black down via +15/+17.
  if (piece.type === PAWN) {
    const deltas = piece.color === WHITE ? [-17, -15] : [15, 17];
    const out = [];
    for (const d of deltas) {
      const target = from + d;
      if ((target & 0x88) === 0) out.push(algebraic(target));
    }
    return out;
  }

  const flipped = withTurn(board, piece.color);
  const moves = flipped._generateMoves({ from, legalOnly: false });
  return moves.map((mv) => algebraic(mv.to));
}

const uciParts = (uci) =>
  typeof uci === 'string' && uci.length >= 4
    ? { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }
    : null;

/** Apply a UCI move to a clone, or null if it will not go. */
function applyUci(board, uci) {
  const p = uciParts(uci);
  if (!p) return null;
  const next = board.clone();
  const played = next.move({ from: p.from, to: p.to, promotion: p.promotion || undefined });
  return played ? { board: next, played, ...p } : null;
}

/** The refutation simply takes something and keeps it. */
function detectHangingPiece(board, uci) {
  const p = uciParts(uci);
  if (!p) return false;
  const victim = board.get(p.to);
  if (!victim) return false;
  return see(board, p.to) >= MATERIAL_THRESHOLD;
}

/** After the refutation, the arriving piece hits two things worth having. */
function detectFork(board, uci) {
  const applied = applyUci(board, uci);
  if (!applied) return false;
  const mover = applied.played.color;
  const victimColor = other(mover);

  const targets = attackedSquares(applied.board, applied.to)
    .map((sq) => applied.board.get(sq))
    .filter((piece) => piece && piece.color === victimColor);

  const valuable = targets.filter((piece) => (PIECE_VALUES[piece.type] || 0) >= VALUABLE_PIECE);
  const hitsKing = targets.some((piece) => piece.type === KING);

  // Two real pieces, or the king plus anything else worth taking.
  return valuable.length >= 2 || (hitsKing && targets.length >= 2);
}

/**
 * The refutation lands on the back rank against a king walled in by its own
 * pawns. Checking the pawns is what stops every rook check on rank 8 being
 * called a back-rank motif.
 */
function detectBackRank(board, uci) {
  const applied = applyUci(board, uci);
  if (!applied) return false;
  const rank = applied.to[1];
  if (rank !== '1' && rank !== '8') return false;

  const victimColor = other(applied.played.color);
  const kingSq = applied.board.kingSquare(victimColor);
  if (kingSq === -1) return false;
  const kingAlg = algebraic(kingSq);
  if (kingAlg[1] !== rank) return false;

  // Every escape square directly in front of the king must be blocked by one
  // of its own pawns — that is what makes it a back-rank problem rather than
  // an ordinary check.
  const forward = victimColor === WHITE ? 1 : -1;
  const kingFile = kingAlg.charCodeAt(0);
  let escapes = 0;
  let blocked = 0;
  for (const df of [-1, 0, 1]) {
    const file = String.fromCharCode(kingFile + df);
    if (file < 'a' || file > 'h') continue;
    const square = `${file}${Number(rank) + forward}`;
    if (SQUARES[square] === undefined) continue;
    escapes += 1;
    const piece = applied.board.get(square);
    if (piece && piece.color === victimColor && piece.type === PAWN) blocked += 1;
  }
  if (escapes === 0 || blocked < escapes) return false;

  return applied.board.isCheckmate() || see(board, applied.to) >= DECISIVE_THRESHOLD;
}

/**
 * Tag one blunder.
 *
 * @param {{chess: Chess, refutationPv: string[]}} args
 *        `chess` is the position AFTER the played move; `refutationPv` is the
 *        engine's best reply line in UCI.
 * @returns {string[]} motif names, deduplicated
 */
export function detectMotifs({ chess, refutationPv } = {}) {
  if (!chess || !Array.isArray(refutationPv) || refutationPv.length === 0) return [];
  const refutation = refutationPv[0];
  if (!uciParts(refutation)) return [];

  const found = [];
  if (detectHangingPiece(chess, refutation)) found.push('hangingPiece');
  if (detectFork(chess, refutation)) found.push('fork');
  if (detectBackRank(chess, refutation)) found.push('backRank');
  return found;
}

export default detectMotifs;
