/*
 * puzzles.js — real tactics puzzles from Lichess's open, CC0-licensed
 * puzzle database (database.lichess.org), not hand-authored.
 *
 * Each entry's `fen` is the position the trainee sees; `solution` is the
 * full forced line as {from, to, promotion} pairs, starting with the
 * trainee's move and alternating with the opponent's forced reply. Every
 * entry was replayed end-to-end through src/engine/chess.js before being
 * included — see scripts/import-puzzles.mjs, which built this file and can
 * be re-run to refresh it with a new sample.
 */

import data from './puzzles.json';

export const PUZZLES = data;

export const PUZZLE_THEMES = [...new Set(data.flatMap((p) => p.themes))].sort();

/*
 * The theme menu. Lichess tags every puzzle with dozens of themes, many of
 * which are not things to practise ("long", "crushing", "masterVsMaster"),
 * and many of which have one or two puzzles here. The menu shows teaching
 * themes with proper names, and only those with enough puzzles to practise.
 * Links may still name any theme (PUZZLE_THEMES); the page adds it to the
 * menu when that happens.
 */
export const THEME_LABELS = {
  fork: 'Fork',
  pin: 'Pin',
  skewer: 'Skewer',
  discoveredAttack: 'Discovered attack',
  discoveredCheck: 'Discovered check',
  doubleCheck: 'Double check',
  deflection: 'Deflection',
  attraction: 'Attraction (decoy)',
  sacrifice: 'Sacrifice',
  hangingPiece: 'Hanging piece',
  trappedPiece: 'Trapped piece',
  xRayAttack: 'X-ray attack',
  clearance: 'Clearance',
  interference: 'Interference',
  quietMove: 'Quiet move',
  zugzwang: 'Zugzwang',
  exposedKing: 'Exposed king',
  kingsideAttack: 'Kingside attack',
  queensideAttack: 'Queenside attack',
  intermezzo: 'In-between move',
  capturingDefender: 'Remove the defender',
  defensiveMove: 'Defensive move',
  mate: 'Checkmate',
  mateIn1: 'Mate in 1',
  mateIn2: 'Mate in 2',
  mateIn3: 'Mate in 3',
  backRankMate: 'Back-rank mate',
  smotheredMate: 'Smothered mate',
  promotion: 'Promotion',
  advancedPawn: 'Advanced pawn',
  opening: 'Opening',
  middlegame: 'Middlegame',
  endgame: 'Endgame',
  pawnEndgame: 'Pawn endgame',
  rookEndgame: 'Rook endgame',
  bishopEndgame: 'Bishop endgame',
  knightEndgame: 'Knight endgame',
  queenEndgame: 'Queen endgame',
  ownGame: 'From your game',
};

/** A theme needs this many puzzles before it is offered in the menu. */
export const MIN_THEME_PUZZLES = 10;

const themeCounts = data.reduce((counts, p) => {
  for (const t of p.themes) counts[t] = (counts[t] || 0) + 1;
  return counts;
}, {});

export const MENU_THEMES = Object.keys(THEME_LABELS)
  .filter((t) => (themeCounts[t] || 0) >= MIN_THEME_PUZZLES)
  .sort((a, b) => THEME_LABELS[a].localeCompare(THEME_LABELS[b]));

/** A readable name for any theme, curated or not. */
export function themeLabel(theme) {
  if (THEME_LABELS[theme]) return THEME_LABELS[theme];
  return String(theme || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}

export const PUZZLE_RATING_RANGE = data.reduce(
  (range, p) => ({ min: Math.min(range.min, p.rating), max: Math.max(range.max, p.rating) }),
  { min: Infinity, max: -Infinity },
);
