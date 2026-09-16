/*
 * spacedRepetition.js — when a player should see their own blunder again.
 *
 * The audit's line is the specification: "A missed puzzle returns in two days,
 * then a week, then a month if it keeps being solved." That ladder is the
 * default path; the ease factor only stretches or compresses it once a player
 * has a history with the position.
 *
 * Pure functions over a plain state object, so the schedule can be tested
 * without a database and without waiting two days.
 */

/** The ladder from the audit, in days, for a puzzle that keeps being solved. */
export const LADDER_DAYS = [2, 7, 30];

export const MIN_EASE = 1.3;
export const MAX_EASE = 3.0;
export const START_EASE = 2.5;
/** Cap so a long streak cannot schedule a review past the end of the season. */
export const MAX_INTERVAL_DAYS = 180;

export const GRADES = ['again', 'hard', 'good', 'easy'];

const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const DAY_MS = 86400000;

/** The state a brand-new own-game puzzle starts in: due immediately. */
export function newPuzzleState(now = Date.now()) {
  return {
    dueAt: new Date(now).toISOString(),
    intervalDays: 0,
    ease: START_EASE,
    reps: 0,
    lapses: 0,
    lastResult: null,
    lastReviewedAt: null,
    retired: false,
  };
}

/**
 * Advance the schedule after one review.
 *
 * @param {object} state  previous state (or null for a new puzzle)
 * @param {'again'|'hard'|'good'|'easy'} grade
 * @param {number} now    epoch ms, injected so tests need not wait
 */
export function review(state, grade, now = Date.now()) {
  if (!GRADES.includes(grade)) throw new Error(`unknown grade: ${grade}`);
  const prev = state ?? newPuzzleState(now);
  const ease = Number(prev.ease) || START_EASE;
  const reps = Number(prev.reps) || 0;
  const lapses = Number(prev.lapses) || 0;
  const intervalDays = Number(prev.intervalDays) || 0;

  let nextEase = ease;
  let nextInterval;
  let nextReps;
  let nextLapses = lapses;

  if (grade === 'again') {
    // Got it wrong again. Back to the start of the ladder, and the position is
    // worth MORE attention, not less — so it comes back tomorrow, not in a week.
    nextEase = clamp(ease - 0.2, MIN_EASE, MAX_EASE);
    nextInterval = 1;
    nextReps = 0;
    nextLapses = lapses + 1;
  } else if (grade === 'hard') {
    nextEase = clamp(ease - 0.15, MIN_EASE, MAX_EASE);
    nextInterval = Math.max(1, Math.round((intervalDays || 1) * 1.2));
    nextReps = reps + 1;
  } else if (grade === 'good') {
    nextReps = reps + 1;
    // The first three correct answers follow the audit's ladder exactly; after
    // that the ease factor takes over.
    nextInterval =
      nextReps <= LADDER_DAYS.length
        ? LADDER_DAYS[nextReps - 1]
        : Math.round((intervalDays || LADDER_DAYS.at(-1)) * nextEase);
  } else {
    // easy
    nextEase = clamp(ease + 0.15, MIN_EASE, MAX_EASE);
    nextReps = reps + 1;
    const base =
      nextReps <= LADDER_DAYS.length
        ? LADDER_DAYS[nextReps - 1]
        : intervalDays || LADDER_DAYS.at(-1);
    nextInterval = Math.round(base * nextEase);
  }

  nextInterval = clamp(nextInterval, 1, MAX_INTERVAL_DAYS);

  return {
    dueAt: new Date(now + nextInterval * DAY_MS).toISOString(),
    intervalDays: nextInterval,
    ease: Math.round(nextEase * 100) / 100,
    reps: nextReps,
    lapses: nextLapses,
    lastResult: grade,
    lastReviewedAt: new Date(now).toISOString(),
    // Solved three times running at the top of the ladder: it has been learned.
    // Retiring stops a mastered position crowding out a fresh mistake.
    retired: nextReps > LADDER_DAYS.length && nextInterval >= MAX_INTERVAL_DAYS,
  };
}

/** Puzzles due for review now, soonest first. */
export function dueNow(puzzles, now = Date.now()) {
  return puzzles
    .filter((p) => !p.retired && new Date(p.dueAt ?? 0).getTime() <= now)
    .sort((a, b) => new Date(a.dueAt ?? 0) - new Date(b.dueAt ?? 0));
}

/** A short, honest summary for the Training page header. */
export function reviewSummary(puzzles, now = Date.now()) {
  const live = puzzles.filter((p) => !p.retired);
  const due = dueNow(live, now);
  const next = live
    .filter((p) => new Date(p.dueAt ?? 0).getTime() > now)
    .sort((a, b) => new Date(a.dueAt ?? 0) - new Date(b.dueAt ?? 0))[0];
  return {
    total: puzzles.length,
    active: live.length,
    due: due.length,
    retired: puzzles.length - live.length,
    nextDueAt: next?.dueAt ?? null,
  };
}
