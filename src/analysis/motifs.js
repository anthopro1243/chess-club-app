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

import {
  Chess,
  SQUARES,
  algebraic,
  PAWN,
  KNIGHT,
  BISHOP,
  ROOK,
  QUEEN,
  KING,
  WHITE,
  BLACK,
} from '../engine/chess.js';
import { see, seeCapture, PIECE_VALUES } from './see.js';

/** SEE at which a capture counts as winning real material. */
export const MATERIAL_THRESHOLD = 200;
/** SEE at which back-rank pressure counts as decisive rather than annoying. */
export const DECISIVE_THRESHOLD = 500;
/** "A piece worth >= 3" in the spec — a knight or better. */
export const VALUABLE_PIECE = 320;

const other = (color) => (color === WHITE ? BLACK : WHITE);

/* ── 0x88 geometry, mirroring src/engine/chess.js and see.js ──────────────── */

const DIAGONAL = [-17, -15, 15, 17];
const ORTHOGONAL = [-16, -1, 1, 16];
const ALL_RAYS = [...DIAGONAL, ...ORTHOGONAL];
const KNIGHT_DELTAS = [-18, -33, -31, -14, 18, 33, 31, 14];

// Where a pawn of `color` must stand to attack a given square: a white pawn on
// s attacks s-17 and s-15, so it attacks t from t+17 / t+15.
const PAWN_ATTACKER_ORIGINS = {
  [WHITE]: [17, 15],
  [BLACK]: [-17, -15],
};

const onBoard = (sq) => (sq & 0x88) === 0;
const isDiagonal = (delta) => DIAGONAL.includes(delta);

/** Does a piece of this type slide along this ray direction? */
const slidesAlong = (type, delta) =>
  type === QUEEN ||
  (type === BISHOP && isDiagonal(delta)) ||
  (type === ROOK && !isDiagonal(delta));

/** Ray directions a slider travels; empty for anything that is not a slider. */
function sliderRays(type) {
  if (type === QUEEN) return ALL_RAYS;
  if (type === BISHOP) return DIAGONAL;
  if (type === ROOK) return ORTHOGONAL;
  return [];
}

/** First occupied square walking from `from` (exclusive) along `delta`. */
function firstAlong(board, from, delta) {
  let sq = from + delta;
  while (onBoard(sq)) {
    const piece = board.get(sq);
    if (piece) return { index: sq, piece };
    sq += delta;
  }
  return null;
}

/** Every square of the board that holds a piece, as { index, piece }. */
function* occupied(board) {
  for (let sq = 0; sq <= 119; sq++) {
    if (sq & 0x88) {
      sq += 7;
      continue;
    }
    const piece = board.get(sq);
    if (piece) yield { index: sq, piece };
  }
}

/**
 * Every piece of `color` that attacks `target`, as { index, piece }.
 *
 * Radiates out from the target the way see.js does, so the occupant of the
 * target square never screens its own defenders — which is the whole point
 * when asking "what defends this piece?". Pinned defenders still count, as
 * they do in SEE.
 */
export function attackersOf(board, target, color) {
  const out = [];
  if (!onBoard(target)) return out;

  for (const offset of PAWN_ATTACKER_ORIGINS[color]) {
    const sq = target + offset;
    if (!onBoard(sq)) continue;
    const piece = board.get(sq);
    if (piece && piece.color === color && piece.type === PAWN) out.push({ index: sq, piece });
  }

  for (const offset of KNIGHT_DELTAS) {
    const sq = target + offset;
    if (!onBoard(sq)) continue;
    const piece = board.get(sq);
    if (piece && piece.color === color && piece.type === KNIGHT) out.push({ index: sq, piece });
  }

  for (const delta of ALL_RAYS) {
    const first = firstAlong(board, target, delta);
    if (!first || first.piece.color !== color) continue;
    if (slidesAlong(first.piece.type, delta)) out.push(first);
    else if (first.piece.type === KING && first.index === target + delta) out.push(first);
  }

  return out;
}

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
