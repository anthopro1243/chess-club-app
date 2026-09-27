/*
 * puzzleMatch.js — serve each player puzzles near their own strength
 * (research F021). A 700 player drowning in 1600 puzzles learns nothing but
 * frustration; a 1500 player breezing through 600s learns nothing at all.
 *
 * The target is the player's club rating once it rests on enough results
 * (every solved or failed puzzle moves it, so the target follows the player
 * up), else their US Chess rating, else a beginner's 1000. Puzzles are pitched
 * a little above the target so there is something to reach for, and the
 * window widens until there are enough unsolved ones to work through.
 */

export const DEFAULT_TARGET = 1000;
/** Club-rating results needed before it outranks the US Chess rating. */
export const MIN_CLUB_RESULTS = 5;
/** How far above the target the middle of the window sits. */
export const STRETCH = 50;
export const START_WINDOW = 150;
export const MAX_WINDOW = 600;
export const MIN_POOL = 10;

/** The rating to pitch puzzles at, and where it came from. */
export function targetRating(player) {
  const club = player?.clubRating;
  if (club && Number.isFinite(club.rating) && (club.count || 0) >= MIN_CLUB_RESULTS) {
    return { rating: Math.round(club.rating), source: 'club' };
  }
  const uscf = Number(player?.ratings?.uscf);
  if (Number.isFinite(uscf) && uscf > 0) return { rating: uscf, source: 'uscf' };
  return { rating: DEFAULT_TARGET, source: 'default' };
}

/**
 * Puzzles near `target`, closest to target + STRETCH first, unsolved before
 * solved. Starts at ±START_WINDOW and widens in steps until at least
 * `minPool` unsolved puzzles are in range (or MAX_WINDOW is reached).
 *
 * @returns {{ puzzles: object[], window: number, center: number }}
 */
export function matchPuzzles(puzzles = [], target = DEFAULT_TARGET, { solvedIds = [], theme = '', minPool = MIN_POOL } = {}) {
  const center = (Number.isFinite(target) ? target : DEFAULT_TARGET) + STRETCH;
  const solved = new Set(solvedIds);
  const pool = puzzles.filter((p) => p && Number.isFinite(p.rating) && (!theme || (p.themes || []).includes(theme)));

  let window = START_WINDOW;
  let inRange = [];
  for (; window <= MAX_WINDOW; window += 100) {
    inRange = pool.filter((p) => Math.abs(p.rating - center) <= window);
    if (inRange.filter((p) => !solved.has(p.id)).length >= minPool) break;
  }
  window = Math.min(window, MAX_WINDOW);

  const sorted = [...inRange].sort(
    (a, b) =>
      Number(solved.has(a.id)) - Number(solved.has(b.id)) ||
      Math.abs(a.rating - center) - Math.abs(b.rating - center) ||
      String(a.id).localeCompare(String(b.id)),
  );
  return { puzzles: sorted, window, center };
}
