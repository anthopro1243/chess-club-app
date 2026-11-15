/*
 * trainingLink.js — the Training page's deep link: #/training?theme=fork
 * focuses the plan on that tactic's video and Lichess link, and
 * ?mode=mistakes / ?mode=endgames open those sections. The player's home
 * page and the Coach page link here.
 *
 * Anything unknown is dropped rather than trusted: a stale or hand-edited
 * link (the old ?puzzles=… and ?difficulty=… ones included) should land on a
 * working page. The theme list is the Lichess themes in src/data/resources.js.
 */

export const MODE_KEYS = new Set(['mistakes', 'endgames']);

export function parseTrainingLink(hash, { themes = [] } = {}) {
  const out = { theme: '', mode: '' };
  const query = String(hash || '').split('?')[1];
  if (!query) return out;
  const params = new URLSearchParams(query);

  const theme = params.get('theme');
  if (theme && themes.includes(theme)) out.theme = theme;

  const mode = params.get('mode');
  if (mode && MODE_KEYS.has(mode)) out.mode = mode;
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
