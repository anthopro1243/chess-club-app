/*
 * sacrifice.js — tell a sound sacrifice apart from a hung piece.
 *
 * `hangs` in buildPlyRecords.js is purely SEE-based: after the played move the
 * engine's best reply is a capture worth >= +200cp by static exchange. That is
 * the correct test for "material is going to come off", but it cannot tell WHY
 * the material is going. A queen sacrifice that forces mate in four and a
 * queen left en prise for nothing look identical to SEE.
 *
 * The consequence is backwards for a coaching tool: the strongest player in the
 * club, the one who actually sacrifices, collects the most `hangs` flags and so
 * the worst board-vision score. This module supplies the missing half of the
 * test — the ENGINE'S OPINION. If the engine's own top choice is the move that
 * gave the material away, the player did not hang anything; they sacrificed,
 * and correctly.
 *
 * Nothing here re-evaluates a position. It only reads evaluations already on
 * the PlyRecord, so it is pure, synchronous and free to run over a whole game.
 */

/**
 * How far below the engine's best line the played move may sit and still count
 * as "the engine agrees", in centipawns.
 *
 * Deliberately tight. A sacrifice is only sound if the position after it is
 * about as good as the best available alternative; at 50cp we would start
 * excusing real material losses as "compensation", which is the exact flattery
 * a coaching tool must not offer. Anything looser belongs in a human's note,
 * not in a flag that suppresses a blunder.
 */
export const SACRIFICE_CP_TOLERANCE = 30;

/** The engine's preferred move for a ply, however the record spells it. */
function bestMoveOf(ply) {
  if (ply.bestUci) return ply.bestUci;
  if (Array.isArray(ply.bestPv) && ply.bestPv.length > 0) return ply.bestPv[0];
  return null;
}

/**
 * Centipawns lost by the played move relative to the position before it, or
 * null when the comparison is not meaningful (a missing evaluation).
 *
 * Both values are already in the MOVER's point of view — buildPlyRecords runs
 * cpAfter through normaliseAfter() — so a straight subtraction is correct here
 * and would be badly wrong on raw engine output.
 */
export function evalLoss(ply) {
  if (!ply) return null;
  const { cpBefore, cpAfter, mateBefore, mateAfter } = ply;

  // Mate scores are not centipawns and must not be mixed with them.
  if (mateAfter != null && mateAfter > 0) return 0; // the move mates: nothing lost
  if (mateAfter != null && mateAfter < 0) return Infinity; // the move gets mated
  if (mateBefore != null && mateBefore > 0) return Infinity; // had mate, threw it away
  if (mateBefore != null && mateBefore < 0) return 0; // was already getting mated

  if (typeof cpBefore !== 'number' || typeof cpAfter !== 'number') return null;
  return cpBefore - cpAfter;
}

/**
 * Did this ply give material away with the engine's blessing?
 *
 * Requires BOTH halves:
 *  1. material actually left — `hangs` is set, so SEE says the reply wins >= 200cp;
 *  2. the engine agrees — the played move is its top choice, or the evaluation
 *     after it is within SACRIFICE_CP_TOLERANCE of the position before it.
 *
 * A move that loses no material is not a sacrifice, however good it is; a move
 * the engine wanted nothing to do with is not a sacrifice either, however
 * brave. Only the intersection counts.
 *
 * @param {{ply: object}} args
 * @returns {boolean}
 */
export function isSoundSacrifice({ ply } = {}) {
  if (!ply || typeof ply !== 'object') return false;
  if (!ply.hangs) return false;

  // The engine's own move cannot be a blunder: nothing better exists to play.
  const best = bestMoveOf(ply);
  if (best && ply.uci && ply.uci === best) return true;

  const loss = evalLoss(ply);
  if (loss === null) return false;
  return loss <= SACRIFICE_CP_TOLERANCE;
}

/**
 * Re-flag a game's plies: a sound sacrifice stops counting as a hung piece and
 * is labelled as what it is.
 *
 * Returns a NEW array of NEW records — the caller's plies are never mutated,
 * because the raw SEE verdict is still what gets stored on the analysis row and
 * something else in the pipeline may be holding the same objects.
 *
 * @param {Array<object>} plies
 * @returns {Array<object>}
 */
export function annotateSacrifices(plies) {
  if (!Array.isArray(plies)) return [];
  return plies.map((ply) => {
    if (!ply || typeof ply !== 'object') return ply;
    if (isSoundSacrifice({ ply })) return { ...ply, hangs: false, sacrifice: true };
    return { ...ply, sacrifice: false };
  });
}

/** Convenience for the report: how many sound sacrifices a side played. */
export function countSacrifices(plies, side = null) {
  if (!Array.isArray(plies)) return 0;
  return plies.filter(
    (ply) => ply && ply.sacrifice === true && (side === null || ply.side === side),
  ).length;
}
