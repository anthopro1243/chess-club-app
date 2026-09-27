/*
 * motifs.js — why a blunder was a blunder.
 *
 * "You blundered six times" is a report. "You keep losing pieces to knight
 * forks" is coaching, and it is the difference between a player knowing they
 * are bad at tactics and knowing what to practise on Tuesday.
 *
 * Eight motifs: hangingPiece, fork and backRank (v1), then pin, skewer,
 * discoveredAttack, trappedPiece and deflection, each a geometry function
 * with its own tests. Every detector is deliberately strict: a false positive
 * teaches a teenager the wrong lesson about their own game, so when in doubt
 * a detector says nothing and the blunder is explained by the eval alone.
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

const valueOf = (piece) => (piece ? PIECE_VALUES[piece.type] || 0 : 0);

/**
 * The refuting move puts a slider on a line through an enemy piece to
 * something bigger behind it. Shared by pin (small piece in front) and skewer
 * (big piece in front). Yields { front, back, delta } per line.
 */
function* linesThroughTwo(board, fromIndex, slider) {
  for (const delta of sliderRays(slider.type)) {
    const front = firstAlong(board, fromIndex, delta);
    if (!front || front.piece.color === slider.color) continue;
    const back = firstAlong(board, front.index, delta);
    if (!back || back.piece.color === slider.color) continue;
    yield { front, back, delta };
  }
}

/** After the refutation the piece that moved can simply be taken for profit. */
const refuterHangs = (applied) => see(applied.board, applied.to) >= MATERIAL_THRESHOLD;

/**
 * Pin: the refutation lands a bishop, rook or queen on a line where an enemy
 * piece stands in front of its king (or of a more valuable piece) and cannot
 * take the pinner along that line. Not reported when the pinner itself just
 * hangs, or when the pinned piece is a pawn.
 */
function detectPin(board, uci) {
  const applied = applyUci(board, uci);
  if (!applied) return false;
  const slider = applied.board.get(applied.to);
  if (!slider || !sliderRays(slider.type).length) return false;
  if (refuterHangs(applied)) return false;
  const from = SQUARES[applied.to];
  for (const { front, back, delta } of linesThroughTwo(applied.board, from, slider)) {
    if (front.piece.type === KING || front.piece.type === PAWN) continue;
    // A pinned piece that moves along the pin line can capture the pinner.
    if (slidesAlong(front.piece.type, -delta)) continue;
    const behindIsKing = back.piece.type === KING;
    const behindIsBigger = valueOf(back.piece) > valueOf(front.piece) && valueOf(back.piece) >= PIECE_VALUES[ROOK];
    if (behindIsKing || behindIsBigger) return true;
  }
  return false;
}

/**
 * Skewer: the refutation attacks the king (or a queen or rook worth more than
 * the attacker) along a line, with another real piece behind it that is lost
 * once the front piece steps aside.
 */
function detectSkewer(board, uci) {
  const applied = applyUci(board, uci);
  if (!applied) return false;
  const slider = applied.board.get(applied.to);
  if (!slider || !sliderRays(slider.type).length) return false;
  if (refuterHangs(applied)) return false;
  const from = SQUARES[applied.to];
  for (const { front, back } of linesThroughTwo(applied.board, from, slider)) {
    const frontMustMove = front.piece.type === KING || valueOf(front.piece) > valueOf(slider);
    if (!frontMustMove) continue;
    if (front.piece.type !== KING && valueOf(front.piece) <= valueOf(back.piece)) continue;
    if (back.piece.type === PAWN || back.piece.type === KING) continue;
    // The piece behind must be worth the attacker's while: undefended, or
    // worth more than the attacker.
    const defenders = attackersOf(applied.board, back.index, back.piece.color).filter((d) => d.index !== front.index);
    if (defenders.length === 0 || valueOf(back.piece) > valueOf(slider)) return true;
  }
  return false;
}

/**
 * Discovered attack: the refuting piece steps off a line and uncovers a
 * friendly slider onto the king or a valuable piece, while making a threat
 * of its own (a capture, a check, or an attack on a real piece). Two threats
 * at once is what makes it a tactic rather than a move.
 */
function detectDiscoveredAttack(board, uci) {
  const applied = applyUci(board, uci);
  if (!applied) return false;
  const mover = applied.played.color;
  const victimColor = other(mover);
  const from = SQUARES[applied.from];

  let revealed = false;
  for (const delta of ALL_RAYS) {
    // A friendly slider behind the square the piece left…
    const behind = firstAlong(applied.board, from, -delta);
    if (!behind || behind.piece.color !== mover || !slidesAlong(behind.piece.type, delta)) continue;
    // …now sees through it to an enemy target.
    const target = firstAlong(applied.board, behind.index, delta);
    if (!target || target.piece.color !== victimColor || target.index === SQUARES[applied.to]) continue;
    // It must be a line the moving piece was blocking.
    let sq = behind.index + delta;
    let passes = false;
    while (onBoard(sq) && sq !== target.index) {
      if (sq === from) passes = true;
      sq += delta;
    }
    if (!passes) continue;
    const big = target.piece.type === KING || (valueOf(target.piece) >= PIECE_VALUES[ROOK] && valueOf(target.piece) > valueOf(behind.piece));
    const loose = valueOf(target.piece) >= VALUABLE_PIECE && attackersOf(applied.board, target.index, victimColor).length === 0;
    if (big || loose) {
      revealed = true;
      break;
    }
  }
  if (!revealed) return false;

  const captured = board.get(applied.to);
  if (captured && captured.color === victimColor && valueOf(captured) >= VALUABLE_PIECE) return true;
  if (applied.board.inCheck()) return true;
  return attackedSquares(applied.board, applied.to)
    .map((sqAlg) => applied.board.get(sqAlg))
    .some((piece) => piece && piece.color === victimColor && (piece.type === KING || valueOf(piece) >= PIECE_VALUES[ROOK]));
}

/** Would the refuter win material on `square` if it were their move? */
function refuterWinsOn(board, square, refuterColor) {
  return see(board, square, { side: refuterColor }) >= MATERIAL_THRESHOLD;
}

/**
 * Trapped piece: the refutation attacks an enemy knight, bishop, rook or
 * queen that is lost where it stands, and no legal reply at all saves it —
 * not moving it, not defending it, not capturing something of equal value.
 * A reply that gives check counts as saving it, since the attack is then
 * postponed and the detector cannot see past that.
 */
function detectTrappedPiece(board, uci) {
  const applied = applyUci(board, uci);
  if (!applied) return false;
  const refuter = applied.played.color;
  const victimColor = other(refuter);
  if (applied.board.inCheck()) return false; // a check is a different story

  const attacked = attackedSquares(applied.board, applied.to)
    .map((sqAlg) => ({ square: sqAlg, piece: applied.board.get(sqAlg) }))
    .filter(({ piece }) => piece && piece.color === victimColor && piece.type !== KING && piece.type !== PAWN);

  for (const { square, piece } of attacked) {
    if (!refuterWinsOn(applied.board, square, refuter)) continue;
    const replies = applied.board.moves({ verbose: true });
    const saved = replies.some((reply) => {
      const next = applied.board.clone();
      if (!next.move({ from: reply.from, to: reply.to, promotion: reply.promotion || undefined })) return false;
      if (next.inCheck()) return true;
      const whereNow = reply.from === square ? reply.to : square;
      // Swapping it for something at least as valuable is not losing it.
      if (reply.from === square && reply.captured && PIECE_VALUES[reply.captured] >= valueOf(piece)) return true;
      const stillThere = next.get(whereNow);
      if (!stillThere || stillThere.color !== victimColor) return false;
      return !refuterWinsOn(next, whereNow, refuter);
    });
    if (!saved) return true;
  }
  return false;
}

/**
 * Deflection: the refuting move offers something a defender has to take (or
 * captures so that it must recapture), and the follow-up then wins material
 * or mates on a square that defender was guarding. Read from the engine's
 * line: refutation, the defender's capture, the follow-up.
 */
function detectDeflection(board, pv) {
  if (pv.length < 3) return false;
  const first = applyUci(board, pv[0]);
  if (!first) return false;
  const refuter = first.played.color;
  const reply = uciParts(pv[1]);
  const follow = uciParts(pv[2]);
  if (!reply || !follow) return false;
  // The reply captures on the square the refuting piece went to.
  if (reply.to !== first.to) return false;
  const defender = first.board.get(reply.from);
  if (!defender || defender.color === refuter) return false;
  // Before being lured away, that defender guarded the follow-up's square.
  // (attackersOf, not attackedSquares: a defender "attacks" its own piece.)
  const guarded = attackersOf(first.board, SQUARES[follow.to], defender.color)
    .some((d) => d.index === SQUARES[reply.from]);
  if (!guarded) return false;

  const second = applyUci(first.board, pv[1]);
  if (!second) return false;
  const target = second.board.get(follow.to);
  const third = applyUci(second.board, pv[2]);
  if (!third) return false;
  if (third.board.isCheckmate()) return true;
  if (!target || target.color === refuter) return false;
  // The follow-up must win material, net of the piece given up.
  const bait = valueOf(first.board.get(first.to));
  return see(second.board, follow.to) - bait >= MATERIAL_THRESHOLD;
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
  if (detectPin(chess, refutation)) found.push('pin');
  if (detectSkewer(chess, refutation)) found.push('skewer');
  if (detectDiscoveredAttack(chess, refutation)) found.push('discoveredAttack');
  if (detectTrappedPiece(chess, refutation)) found.push('trappedPiece');
  if (detectDeflection(chess, refutationPv)) found.push('deflection');
  return found;
}

export default detectMotifs;
