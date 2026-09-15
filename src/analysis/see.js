/*
 * see.js — static exchange evaluation (SEE).
 *
 * Answers "if the capture sequence on this square plays itself out, with each
 * side always recapturing with its least valuable attacker, what is the net
 * material swing in centipawns?" — from the point of view of the side that
 * initiates the sequence.
 *
 * This is what `hangs` and the `hangingPiece` motif need: "is it defended?"
 * is not enough, because a defended knight taken by a bishop is still a loss
 * for the taker.
 *
 * Board handling: this module reads the position through the public `Chess`
 * API (`get()` / `turn`) into its own 0x88 scratch array and then mutates that
 * copy. The `Chess` instance passed in is never modified.
 *
 * X-ray / battery discovery IS handled: attackers are recomputed from the
 * target square outward after every capture, against an occupancy that has the
 * capturing piece removed. So a rook behind a queen on the same file joins the
 * exchange the moment the queen captures.
 *
 * Known, deliberate limitations (standard for SEE, documented so callers do
 * not read more into the number than is there):
 *   - Pins and absolute-pin legality are ignored. A defender that is pinned to
 *     its own king is still counted as a defender. Real engines do the same.
 *   - Promotion during the exchange is not scored: a pawn capturing onto the
 *     last rank is counted as a pawn.
 *   - En passant is not modelled. `see()` on an empty en-passant target square
 *     reports a captured value of 0.
 *   - King captures ARE checked for legality: the king may only take when the
 *     square is left undefended.
 */

import { SQUARES, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, WHITE, BLACK } from '../engine/chess.js';

/** Centipawn values used by SEE. Exported so callers agree with this module. */
export const PIECE_VALUES = Object.freeze({
  [PAWN]: 100,
  [KNIGHT]: 320,
  [BISHOP]: 330,
  [ROOK]: 500,
  [QUEEN]: 900,
  [KING]: 20000,
});

// 0x88 geometry, mirroring src/engine/chess.js.
const OFFSETS = {
  [KNIGHT]: [-18, -33, -31, -14, 18, 33, 31, 14],
  [BISHOP]: [-17, -15, 17, 15],
  [ROOK]: [-16, 1, 16, -1],
  [QUEEN]: [-17, -16, -15, 1, 17, 16, 15, -1],
  [KING]: [-17, -16, -15, 1, 17, 16, 15, -1],
};

// Where a pawn of `color` must stand to attack a given square.
// A white pawn on s attacks s-17 and s-15, so it attacks `t` from t+17 / t+15.
const PAWN_ATTACKER_ORIGINS = {
  [WHITE]: [17, 15],
  [BLACK]: [-17, -15],
};

const onBoard = (sq) => (sq & 0x88) === 0;
const other = (color) => (color === WHITE ? BLACK : WHITE);

/** Accepts 'e4' or a numeric 0x88 index; returns the index, or -1. */
export function toIndex(square) {
  if (typeof square === 'number') return onBoard(square) ? square : -1;
  const sq = SQUARES[square];
  return sq === undefined ? -1 : sq;
}

/**
 * Snapshot the position into a mutable 128-cell scratch board of
 * { type, color } | null. Uses only the public `get()` accessor.
 */
function snapshot(chess) {
  const cells = new Array(128).fill(null);
  for (let sq = 0; sq <= 119; sq++) {
    if (sq & 0x88) {
      sq += 7;
      continue;
    }
    const piece = chess.get(sq);
    if (piece) cells[sq] = { type: piece.type, color: piece.color };
  }
  return cells;
}

/**
 * The cheapest piece of `color` that attacks `target` on the current
 * occupancy, as a square index, or -1. Sliders are found by radiating out from
 * the target, so removing a capturer automatically reveals anything behind it.
 *
 * The occupant of `target` itself never blocks these rays (scanning starts one
 * step away), which is exactly right: it is the piece being captured.
 */
function leastValuableAttacker(cells, target, color) {
  for (const offset of PAWN_ATTACKER_ORIGINS[color]) {
    const sq = target + offset;
    if (!onBoard(sq)) continue;
    const p = cells[sq];
    if (p && p.color === color && p.type === PAWN) return sq;
  }

  for (const offset of OFFSETS[KNIGHT]) {
    const sq = target + offset;
    if (!onBoard(sq)) continue;
    const p = cells[sq];
    if (p && p.color === color && p.type === KNIGHT) return sq;
  }

  // Bishop, then rook, then queen — cheapest first.
  for (const [type, rays] of [
    [BISHOP, OFFSETS[BISHOP]],
    [ROOK, OFFSETS[ROOK]],
    [QUEEN, OFFSETS[QUEEN]],
  ]) {
    for (const offset of rays) {
      let sq = target + offset;
      while (onBoard(sq)) {
        const p = cells[sq];
        if (p) {
          if (p.color === color && p.type === type) return sq;
          break; // first blocker on this ray; anything further is screened
        }
        sq += offset;
      }
    }
  }

  for (const offset of OFFSETS[KING]) {
    const sq = target + offset;
    if (!onBoard(sq)) continue;
    const p = cells[sq];
    if (p && p.color === color && p.type === KING) return sq;
  }

  return -1;
}

/** Is `target` attacked by `color` at all, on the current occupancy? */
function isDefended(cells, target, color) {
  return leastValuableAttacker(cells, target, color) !== -1;
}

/**
 * Value of the best continuation for `stm` on `target`, never negative —
 * a side is never forced to recapture, so a losing recapture is simply
 * declined and the sequence ends.
 */
function continuation(cells, target, stm) {
  const from = leastValuableAttacker(cells, target, stm);
  if (from === -1) return 0;

  const attacker = cells[from];
  const victim = cells[target];
  const victimValue = victim ? PIECE_VALUES[victim.type] : 0;

  if (attacker.type === KING) {
    // A king may only capture into an undefended square.
    cells[from] = null;
    const stillDefended = isDefended(cells, target, other(stm));
    cells[from] = attacker;
    if (stillDefended) return 0;
  }

  cells[target] = attacker;
  cells[from] = null;

  const score = victimValue - continuation(cells, target, other(stm));

  cells[from] = attacker;
  cells[target] = victim;

  return score > 0 ? score : 0;
}

/**
 * Static exchange evaluation of the capture sequence on `toSquare`.
 *
 * @param {import('../engine/chess.js').Chess} chess
 * @param {string|number} toSquare        target square, 'e5' or a 0x88 index
 * @param {{side?: 'w'|'b', from?: string|number}} [opts]
 *        side — who initiates the sequence (default: the side to move)
 *        from — force a specific first capturer (same as `seeCapture`)
 * @returns {number} net centipawns for `side`. The sequence is *initiated*,
 *          not optimised: a losing first capture reports its loss rather than
 *          0, because callers ask this about a move that was actually played.
 *          Every later recapture is optional, so those clamp at 0.
 */
export function see(chess, toSquare, opts = {}) {
  const target = toIndex(toSquare);
  if (target === -1) return 0;

  const side = opts.side || chess.turn;
  const cells = snapshot(chess);

  const victim = cells[target];
  if (victim && victim.color === side) return 0; // own piece: nothing to capture

  let from = opts.from === undefined ? leastValuableAttacker(cells, target, side) : toIndex(opts.from);
  if (from === -1) return 0;

  const attacker = cells[from];
  if (!attacker || attacker.color !== side) return 0;

  const victimValue = victim ? PIECE_VALUES[victim.type] : 0;

  if (attacker.type === KING) {
    cells[from] = null;
    const stillDefended = isDefended(cells, target, other(side));
    cells[from] = attacker;
    if (stillDefended) return 0;
  }

  cells[target] = attacker;
  cells[from] = null;

  return victimValue - continuation(cells, target, other(side));
}

/**
 * SEE of one specific capture: the piece on `fromSquare` takes on `toSquare`.
 *
 * @param {import('../engine/chess.js').Chess} chess
 * @param {string|number} fromSquare
 * @param {string|number} toSquare
 * @returns {number} net centipawns for the owner of the piece on `fromSquare`.
 *          0 if that square is empty.
 */
export function seeCapture(chess, fromSquare, toSquare) {
  const from = toIndex(fromSquare);
  if (from === -1) return 0;
  const piece = chess.get(from);
  if (!piece) return 0;
  return see(chess, toSquare, { side: piece.color, from });
}

export default see;
