/*
 * buildPlyRecords.js — turns a parsed game plus an engine into the
 * `PlyRecord[]` that scoring.js consumes.
 *
 * The one efficiency that matters: the position *after* ply n is the same
 * position as *before* ply n+1. Evaluating each position once rather than
 * twice halves the engine time for a game, which is the whole cost of
 * analysis. An 80-ply game needs 81 evaluations, not 160.
 */

import { Chess, FLAGS, QUEEN, ROOK, BISHOP, KNIGHT, START_FEN } from '../engine/chess.js';
import { normaliseAfter, TACTIC_GAIN } from './scoring.js';
import { see, seeCapture } from './see.js';
import { detectMotifs } from './motifs.js';
import { annotateSacrifices } from './sacrifice.js';

/** Non-pawn material, used to decide the phase. */
const PHASE_VALUES = { [QUEEN]: 9, [ROOK]: 5, [BISHOP]: 3, [KNIGHT]: 3 };

/** Endgame once non-pawn material for BOTH sides together drops to this. */
export const ENDGAME_MATERIAL = 14;
/** Opening lasts at most this many full moves, unless the endgame arrives first. */
export const OPENING_LAST_FULLMOVE = 12;
/** SEE threshold at which a capture counts as winning real material. */
export const HANGING_THRESHOLD = 200;
/** Without an opening book we call the first N plies "book" and say so in the UI. */
export const BOOK_PLIES_FALLBACK = 8;

/** Summed non-pawn material for both sides. */
export function nonPawnMaterial(board) {
  let total = 0;
  for (const row of board.boardArray()) {
    for (const piece of row) {
      if (!piece) continue;
      total += PHASE_VALUES[piece.type] || 0;
    }
  }
  return total;
}

/**
 * Phase by material rather than move number: a queenless position on move 15
 * is an endgame, and calling it a middlegame is what makes endgame technique
 * scores meaningless.
 */
export function phaseOf(board) {
  if (nonPawnMaterial(board) <= ENDGAME_MATERIAL) return 'endgame';
  if (board.moveNumber <= OPENING_LAST_FULLMOVE) return 'opening';
  return 'middlegame';
}

const isCapture = (mv) => mv.flags.includes(FLAGS.CAPTURE) || mv.flags.includes(FLAGS.EP_CAPTURE);

/** Does the side to move have a capture or a check available? */
export function hasCaptureOrCheck(board) {
  const moves = board.moves({ verbose: true });
  for (const mv of moves) if (isCapture(mv)) return true;
  for (const mv of moves) {
    const probe = board.clone();
    probe.move({ from: mv.from, to: mv.to, promotion: mv.promotion || undefined });
    if (probe.inCheck()) return true; // the opponent is now in check
  }
  return false;
}

/** Best SEE among the side-to-move's available captures, or null if none. */
function bestCaptureSee(board) {
  let best = null;
  for (const mv of board.moves({ verbose: true })) {
    if (!isCapture(mv)) continue;
    const value = seeCapture(board, mv.from, mv.to);
    if (best === null || value > best.value) best = { value, uci: toUci(mv) };
  }
  return best;
}

const toUci = (mv) => `${mv.from}${mv.to}${mv.promotion || ''}`;

/** Top line of an evaluation, with everything defaulted rather than thrown. */
function topLine(evaluation) {
  const line = evaluation && evaluation.lines && evaluation.lines[0];
  return line || { cp: null, mate: null, pv: [] };
}

/**
 * Build the ply records for one parsed game.
 *
 * @param {object} game     a game from parseAndValidate() (moves carry fenBefore)
 * @param {{evaluate: Function}} engine
 * @param {{depth?: number, multiPV?: number, maxNodes?: number, signal?: AbortSignal,
 *          bookPlies?: number, onProgress?: Function}} opts
 * @returns {Promise<{plies: Array<object>, meta: object}>}
 */
export async function buildPlyRecords(game, engine, opts = {}) {
  const {
    depth = 14,
    multiPV = 3,
    maxNodes = 400000,
    signal,
    bookPlies = BOOK_PLIES_FALLBACK,
    onProgress,
  } = opts;

  const startFen =
    typeof game.tags?.FEN === 'string' && game.tags.FEN.trim() ? game.tags.FEN.trim() : START_FEN;

  // --- replay once, collecting every position and the shape of every move ---
  const board = new Chess(startFen);
  const steps = [];
  for (const move of game.moves) {
    const fenBefore = board.fen();
    const snapshot = board.clone();
    const played = board.move(move.san);
    if (!played) throw new Error(`buildPlyRecords: illegal move ${move.san} in ${fenBefore}`);
    steps.push({
      move,
      played,
      fenBefore,
      before: snapshot,
      after: board.clone(),
      side: played.color,
      fullmove: snapshot.moveNumber,
      uci: toUci(played),
    });
  }

  // --- evaluate each distinct position exactly once -------------------------
  const positions = [...steps.map((s) => s.fenBefore), board.fen()];
  const evaluations = [];
  for (let i = 0; i < positions.length; i += 1) {
    if (signal?.aborted) throw new Error('analysis aborted');
    // The final position needs no MultiPV: nothing is played from it.
    const wantLines = i === positions.length - 1 ? 1 : multiPV;
    evaluations.push(await engine.evaluate(positions[i], { depth, multiPV: wantLines, maxNodes, signal }));
    onProgress?.({ done: i + 1, total: positions.length });
  }

  // --- assemble ------------------------------------------------------------
  const plies = steps.map((step, i) => {
    const before = evaluations[i];
    const beforeTop = topLine(before);
    const lines = before?.lines || [];

    // cpAfter is the NEXT position's score, which belongs to the opponent —
    // flipping it is the single most important line in this file.
    let cpAfter;
    let mateAfter;
    if (step.after.isCheckmate()) {
      cpAfter = null;
      mateAfter = 1; // the mover delivered mate
    } else if (step.after.isStalemate() || step.after.isDraw()) {
      cpAfter = 0;
      mateAfter = null;
    } else {
      const flipped = normaliseAfter(topLine(evaluations[i + 1]));
      cpAfter = flipped.cp;
      mateAfter = flipped.mate;
    }

    // "Only move" credit compares the best line with the second.
    const secondBestDelta =
      lines.length > 1 && lines[0].cp != null && lines[1].cp != null
        ? lines[0].cp - lines[1].cp
        : null;

    // A real tactic is measured against the THIRD line: the second is usually
    // a transposition of the same idea and would flag everything.
    const tacticAvailable =
      lines.length > 2 && lines[0].cp != null && lines[2].cp != null
        ? lines[0].cp - lines[2].cp >= TACTIC_GAIN
        : false;

    // Did the mover leave a piece to be taken? The engine's best reply must be
    // a capture that wins material by SEE — not merely "is it defended".
    const reply = topLine(evaluations[i + 1]).pv[0];
    let hangs = false;
    if (reply && reply.length >= 4) {
      const to = reply.slice(2, 4);
      const target = step.after.get(to);
      if (target) hangs = see(step.after, to) >= HANGING_THRESHOLD;
    }

    // Was there free material on the board that they walked past?
    const freebie = bestCaptureSee(step.before);
    const missedFreeCapture =
      !!freebie &&
      freebie.value >= HANGING_THRESHOLD &&
      step.uci !== freebie.uci &&
      step.uci !== beforeTop.pv[0];

    return {
      ply: i + 1,
      fullmove: step.fullmove,
      side: step.side,
      san: step.move.san,
      uci: step.uci,
      fen: step.fenBefore,
      cpBefore: beforeTop.cp,
      mateBefore: beforeTop.mate,
      cpAfter,
      mateAfter,
      bestUci: beforeTop.pv[0] ?? null,
      bestPv: beforeTop.pv,
      secondBestDelta,
      inBook: i < bookPlies,
      phase: phaseOf(step.before),
      quiet: !hasCaptureOrCheck(step.before) && Math.abs(beforeTop.cp ?? 0) < 200,
      tacticAvailable,
      hangs,
      missedFreeCapture,
      // Only tag moves that actually cost something. Running the detectors on
      // every ply would label forced recaptures and good moves with motifs,
      // which is worse than no tagging at all: the counts drive the coaching
      // advice, so a motif on a decent move becomes bad advice.
      motifs:
        lostGround(beforeTop, { cp: cpAfter, mate: mateAfter }) || hangs
          ? detectMotifs({ chess: step.after, refutationPv: topLine(evaluations[i + 1]).pv })
          : [],
      moveSeconds: step.move.moveSeconds ?? null,
      clockBefore: step.move.clockSeconds ?? null,
    };
  });

  /*
   * `hangs` is SEE-based, so a sound sacrifice scores identically to blundering
   * a piece — which penalises exactly the strongest player in the club, the
   * opposite of what a coaching tool should do. This clears `hangs` on plies
   * where the engine itself wanted the move.
   */
  const annotated = annotateSacrifices(plies);

  return {
    plies: annotated,
    meta: {
      result: game.result,
      baseSeconds: baseSecondsFrom(game.tags?.TimeControl),
      flagged: /time|flag/i.test(game.tags?.Termination || ''),
      bookSource: `first ${bookPlies} plies`,
    },
  };
}

/**
 * Did this move drop real ground? A centipawn proxy is enough to decide
 * whether it is worth running the motif detectors; scoring.js does the real
 * win-probability classification later.
 */
function lostGround(before, after) {
  if (before.mate != null && before.mate > 0 && !(after.mate != null && after.mate > 0)) return true;
  if (after.mate != null && after.mate < 0 && (before.mate == null || before.mate > 0)) return true;
  if (before.cp == null || after.cp == null) return false;
  return before.cp - after.cp >= 100;
}

/** Base thinking time in seconds from a TimeControl tag ("600+5" -> 600). */
export function baseSecondsFrom(timeControl) {
  if (typeof timeControl !== 'string') return null;
  const period = timeControl.trim().split(':').pop();
  const m = /^(?:\d+\/)?(\d+)/.exec(period);
  return m ? Number(m[1]) : null;
}
