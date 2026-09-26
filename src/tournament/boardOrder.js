/*
 * boardOrder.js — lineups for team-vs-team formats (research F082).
 *
 * In team matches the strongest player sits on board 1 and the order is fixed
 * by rating. Some events allow a tolerance (e.g. a lower board may be up to 50
 * or 75 points higher rated than the board above it). This proposes a legal
 * order and checks a lineup the coach arranged by hand.
 *
 * Ratings must come from ONE source (the event's), and each player carries it
 * so the screen can say where the number came from. Unrated players go to the
 * bottom, in the order given, and are flagged for the coach to confirm with
 * the tournament director: rules for placing unrated players vary by event.
 */

/** Proposed order: rated players by descending rating, then unrated. Splits off alternates. */
export function proposeOrder(players = [], { boards = 4 } = {}) {
  const rated = players.filter((p) => Number.isFinite(p.rating)).sort((a, b) => b.rating - a.rating);
  const unrated = players.filter((p) => !Number.isFinite(p.rating));
  const ordered = [...rated, ...unrated];
  return {
    lineup: ordered.slice(0, boards),
    alternates: ordered.slice(boards),
    unratedInLineup: ordered.slice(0, boards).filter((p) => !Number.isFinite(p.rating)).map((p) => p.id),
  };
}

/**
 * Check a lineup (board 1 first). A violation is any pair where a LOWER board
 * is rated more than `tolerance` points above a HIGHER board, the way event
 * rules state it. Unrated players below rated ones are not violations; an
 * unrated player above a rated one is flagged for the TD to confirm.
 */
export function checkLineup(lineup = [], { tolerance = 0 } = {}) {
  const violations = [];
  for (let upper = 0; upper < lineup.length; upper += 1) {
    for (let lower = upper + 1; lower < lineup.length; lower += 1) {
      const a = lineup[upper];
      const b = lineup[lower];
      if (Number.isFinite(a.rating) && Number.isFinite(b.rating)) {
        if (b.rating - a.rating > tolerance) {
          violations.push({
            kind: 'order',
            upperBoard: upper + 1,
            lowerBoard: lower + 1,
            by: b.rating - a.rating,
            message: `Board ${lower + 1} (${b.rating}) is rated ${b.rating - a.rating} above board ${upper + 1} (${a.rating}); the limit is ${tolerance}.`,
          });
        }
      } else if (!Number.isFinite(a.rating) && Number.isFinite(b.rating)) {
        violations.push({
          kind: 'unrated-above-rated',
          upperBoard: upper + 1,
          lowerBoard: lower + 1,
          message: `Board ${upper + 1} is unrated but sits above a rated player on board ${lower + 1}; confirm this is allowed with the tournament director.`,
        });
      }
    }
  }
  return { ok: violations.length === 0, violations };
}
