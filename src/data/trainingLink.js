/*
 * trainingLink.js — the Training page's deep link, #/training?theme=fork&difficulty=easy
 * (or ?puzzles=id1,id2). The improvement plan on a player's home page links
 * straight to the drill it recommends this way.
 *
 * Anything not in the library is dropped rather than trusted: a stale or
 * hand-edited link should land on a working page, not on an empty pool.
 */

export const DIFFICULTY_KEYS = new Set(['beginner', 'easy', 'intermediate', 'hard', 'expert']);

export function parseTrainingLink(hash, { themes = [], puzzleIds = [] } = {}) {
  const out = { theme: '', difficulty: '', puzzleIds: [] };
  const query = String(hash || '').split('?')[1];
  if (!query) return out;
  const params = new URLSearchParams(query);

  const theme = params.get('theme');
  if (theme && themes.includes(theme)) out.theme = theme;

  const difficulty = params.get('difficulty');
  if (difficulty && DIFFICULTY_KEYS.has(difficulty)) out.difficulty = difficulty;

  const known = new Set(puzzleIds);
  const wanted = (params.get('puzzles') || '').split(',').map((s) => s.trim()).filter(Boolean);
  out.puzzleIds = [...new Set(wanted.filter((pid) => known.has(pid)))];
  return out;
}
