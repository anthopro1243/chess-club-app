/*
 * puzzleRating.js — when a puzzle outcome is allowed to move a rating.
 *
 * Puzzles have their own rating (puzzleStats.rating), separate from the club
 * rating, the way Lichess keeps a puzzle rating apart from game ratings. It
 * is what picks which puzzles a player is served (puzzleMatch.js).
 *
 * The rules, all of which used to be broken:
 *   - Only the FIRST outcome of a visit counts. A wrong move is a loss; a
 *     later correct move, or "Show answer", changes nothing. Guessing every
 *     legal move until one works used to be scored as a full win.
 *   - A puzzle already solved before never moves the rating again, so cycling
 *     Previous / Next over solved puzzles no longer farms rating.
 *   - Positions from the player's own games have no rating, so they are never
 *     rated at all. They used to be scored against a 0-rated "opponent", and
 *     one "Show answer" took a new player from 1500 to 804.
 */

/**
 * The score to rate this outcome with, or null for "don't rate".
 *
 * @param {object} args
 * @param {object} args.puzzle         the puzzle (own-game puzzles carry `own`)
 * @param {'wrong'|'solved'|'revealed'} args.outcome
 * @param {boolean} args.alreadyRated  this visit already produced a rating result
 * @param {boolean} args.alreadySolved the player solved this puzzle on an earlier visit
 */
export function puzzleRatingScore({ puzzle, outcome, alreadyRated = false, alreadySolved = false }) {
  if (!puzzle || puzzle.own) return null;
  if (!Number.isFinite(puzzle.rating) || puzzle.rating <= 0) return null;
  if (alreadyRated || alreadySolved) return null;
  if (outcome === 'solved') return 1;
  if (outcome === 'wrong' || outcome === 'revealed') return 0;
  return null;
}
