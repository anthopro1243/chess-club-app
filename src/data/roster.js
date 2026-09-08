/*
 * roster.js — sample club data.
 *
 * The field names deliberately mirror the columns in
 * chess_club_player_database.xlsx so that this file can later be replaced by a
 * real import (Google Sheets export, or an API call) without touching the UI.
 *
 * These two entries are the worked examples from the workbook. Replace them
 * with real players once intake starts.
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

export const PLAYERS = [
  {
    playerId: 'CC-001',
    name: 'Example Player One',
    grade: '11',
    joined: '2026-09-01',
    boardRole: 'Board 1',
    commitment: 'Competitive',
    ratings: { uscf: 1240, chesscomRapid: 1310, chesscomBlitz: 1185, lichessPuzzles: 1720 },
    preferredOpenings: ['Italian Game', 'Sicilian Defence'],
    style: 'Attacking',
    rubric: {
      opening: 6,
      tactics: 7,
      positional: 5,
      endgame: 4,
      timeManagement: 3,
      boardVision: 6,
      resilience: 5,
      notation: 8,
    },
    goal: 'Reach 1400 USCF by the spring scholastic',
    trainingFocus: 'Rook endgames and clock discipline',
    coachNotes:
      'Strong calculator, plays fast and confidently in the opening, then burns clock in equal middlegames. Endgame technique is the biggest gap between current results and rating goal.',
  },
  {
    playerId: 'CC-002',
    name: 'Example Player Two',
    grade: '9',
    joined: '2026-09-01',
    boardRole: 'Board 3',
    commitment: 'Casual',
    ratings: { uscf: null, chesscomRapid: 890, chesscomBlitz: 810, lichessPuzzles: 1140 },
    preferredOpenings: ['London System'],
    style: 'Solid',
    rubric: {
      opening: 3,
      tactics: 4,
      positional: 3,
      endgame: 2,
      timeManagement: 6,
      boardVision: 4,
      resilience: 6,
      notation: 3,
    },
    goal: 'Play a first rated tournament this season',
    trainingFocus: 'Basic tactics patterns; writing down moves',
    coachNotes:
      'New to organised play. Comfortable in one opening system, which is the right call for now. Needs volume on one- and two-move tactics before anything positional.',
  },
];

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
