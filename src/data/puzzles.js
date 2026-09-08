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
