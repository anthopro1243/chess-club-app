/*
 * trainingLink.js — the Training page's deep link, #/training?theme=fork&difficulty=easy
 * (or ?puzzles=id1,id2, or ?mode=mistakes for the player's own positions to
 * review). The improvement plan on a player's home page links straight to the
 * drill it recommends this way.
 *
 * Anything not in the library is dropped rather than trusted: a stale or
 * hand-edited link should land on a working page, not on an empty pool.
 */

export const DIFFICULTY_KEYS = new Set(['beginner', 'easy', 'intermediate', 'hard', 'expert']);
export const MODE_KEYS = new Set(['mistakes', 'endgames']);

export function parseTrainingLink(hash, { themes = [], puzzleIds = [] } = {}) {
  const out = { theme: '', difficulty: '', puzzleIds: [], mode: '' };
  const query = String(hash || '').split('?')[1];
  if (!query) return out;
  const params = new URLSearchParams(query);

  const theme = params.get('theme');
  if (theme && themes.includes(theme)) out.theme = theme;

  const difficulty = params.get('difficulty');
  if (difficulty && DIFFICULTY_KEYS.has(difficulty)) out.difficulty = difficulty;

  const mode = params.get('mode');
  if (mode && MODE_KEYS.has(mode)) out.mode = mode;

  const known = new Set(puzzleIds);
  const wanted = (params.get('puzzles') || '').split(',').map((s) => s.trim()).filter(Boolean);
  out.puzzleIds = [...new Set(wanted.filter((pid) => known.has(pid)))];
  return out;
}

/**
 * Whose puzzles these are. A member always trains as themselves: the page
 * used to open on "Practice only" with a list of every member, so a member
 * had to find their own name first, and could pick someone else and move
 * that person's rating. The coach (and the no-backend local mode, which is
 * the coach) still picks, for a lesson at the club laptop.
 */
// pickedId: null = never picked (start as themselves), '' = "Practice only".
export function traineeIdFor({ isCoach = false, myPlayerId = null, pickedId = null } = {}) {
  if (isCoach) return pickedId ?? myPlayerId ?? '';
  return myPlayerId || '';
}
