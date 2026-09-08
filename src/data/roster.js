/*
 * roster.js — the rubric definition, and the seed the roster starts from.
 *
 * PLAYERS starts empty on purpose: real players come from people creating
 * their own accounts (see rosterStore.js's claimProfile) or a coach adding
 * them by hand on the Roster page, not from placeholder data baked into the
 * app.
 */

export const RUBRIC_CATEGORIES = [
  { key: 'opening', label: 'Opening knowledge' },
  { key: 'tactics', label: 'Tactical vision' },
  { key: 'positional', label: 'Positional understanding' },
  { key: 'endgame', label: 'Endgame technique' },
  { key: 'timeManagement', label: 'Time management' },
  { key: 'boardVision', label: 'Board vision' },
  { key: 'resilience', label: 'Psychological resilience' },
  { key: 'notation', label: 'Notation' },
];

export const PLAYERS = [];

/** Averages across the club, used by the dashboard. */
export function clubAverages(players = PLAYERS) {
  if (!players.length) return {};
  const totals = {};
  for (const category of RUBRIC_CATEGORIES) {
    totals[category.key] =
      players.reduce((sum, p) => sum + (p.rubric[category.key] || 0), 0) / players.length;
  }
  return totals;
}

/** The lowest-scoring rubric categories — where group instruction should go. */
export function weakestAreas(players = PLAYERS, count = 3) {
  const averages = clubAverages(players);
  return RUBRIC_CATEGORIES.map((category) => ({
    ...category,
    average: averages[category.key] || 0,
  }))
    .sort((a, b) => a.average - b.average)
    .slice(0, count);
}
