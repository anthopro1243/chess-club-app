/*
 * prepResults.js — each player's best result per drill, and what counts as a pass.
 *
 * Pure logic. One record per (player, drill) keeps the best attempt, the
 * latest attempt, the attempt count, and when the player first passed. The
 * readiness checklist reads these; the store (prepResultsStore.js) keeps them.
 *
 * "Best" is by accuracy, then by length (a 40-move game beats a 10-move
 * skills set at the same accuracy), then by speed. First pass is sticky:
 * once a player has shown they know the rules, a bad retake later does not
 * un-ready them the week of the tournament.
 */

import { RULES_PASS_MARK } from './rulesQuiz.js';

/** The notation bar from the research: a 40-move game at 95% or better (F033, F074). */
export const NOTATION_PASS_ACCURACY = 0.95;
export const NOTATION_GAME_MOVES = 40;
/** 40 moves each side: 80 half-moves written down, as on a real scoresheet. */
export const NOTATION_GAME_PLIES = NOTATION_GAME_MOVES * 2;

export const DRILLS = {
  'rules-quiz': 'Rules & etiquette quiz',
  'notation-game-type': 'Notation: write a 40-move game',
  'notation-game-play': 'Notation: play a game from its moves',
  'notation-skills-type': 'Notation skills: write the move',
  'notation-skills-play': 'Notation skills: play the move',
};

/** Whether one attempt passes its drill. Drills with no bar never "pass". */
export function isPassing(drill, { score, total } = {}) {
  if (!Number.isFinite(score) || !Number.isFinite(total) || total <= 0 || score < 0 || score > total) return false;
  const accuracy = score / total;
  if (drill === 'rules-quiz') return total >= 10 && accuracy >= RULES_PASS_MARK;
  if (drill === 'notation-game-type') return total >= NOTATION_GAME_PLIES && accuracy >= NOTATION_PASS_ACCURACY;
  return false;
}

const better = (a, b) => {
  if (!b) return true;
  if (a.accuracy !== b.accuracy) return a.accuracy > b.accuracy;
  if (a.total !== b.total) return a.total > b.total;
  return (a.seconds ?? Infinity) < (b.seconds ?? Infinity);
};

/**
 * Fold one attempt into a player's record for a drill.
 * `attempt` is `{ score, total, seconds, at }`. Returns the new record, or the
 * old one unchanged if the attempt is malformed (a bug should never be able
 * to write a 110% score into someone's readiness).
 */
export function mergeResult(prev, drill, attempt) {
  const { score, total } = attempt || {};
  if (!DRILLS[drill]) return prev ?? null;
  if (!Number.isInteger(score) || !Number.isInteger(total) || total <= 0 || score < 0 || score > total) {
    return prev ?? null;
  }
  const at = attempt.at || new Date().toISOString();
  const seconds = Number.isFinite(attempt.seconds) ? Math.max(0, Math.round(attempt.seconds)) : null;
  const latest = { score, total, accuracy: score / total, seconds, at };
  const prevBest = prev?.best ?? null;
  const passed = isPassing(drill, { score, total });

  return {
    drill,
    best: better(latest, prevBest) ? latest : prevBest,
    last: latest,
    attempts: (prev?.attempts ?? 0) + 1,
    passedAt: prev?.passedAt || (passed ? at : null),
  };
}

/** The record for one player and drill, or null. */
export function resultFor(results, playerId, drill) {
  return (results || []).find((r) => r.playerId === playerId && r.drill === drill) || null;
}
