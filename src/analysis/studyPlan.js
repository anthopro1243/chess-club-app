/*
 * studyPlan.js — the short weekly plan a player is handed.
 *
 * The app diagnoses and then points elsewhere: it states the one thing to
 * work on (from playerHome.js), and hands over to a video and to Lichess's
 * own themed puzzles (src/data/resources.js). It never writes a lesson.
 *
 * Exactly five rows, in this order: the one thing to work on, Watch,
 * Practise, Review your mistakes, Play one long game. No scores and no ranked
 * lists of failures (the rule playerHome.js already keeps).
 */

import { puzzleThemeFor } from './presentation.js';
import {
  LICHESS_MIXED, generalVideo, lichessForTheme, videoForCategory, videoForTheme,
} from '../data/resources.js';

export const PRACTISE_SUGGESTION = 'About 15 minutes, a few times a week.';

const DEFAULT_FOCUS = Object.freeze({
  label: 'Build your fundamentals',
  line: 'Once a few of your games are analyzed, this names the one thing to work on. Until then, these are good habits at any level.',
});

/**
 * A rating to choose a video level by: the US Chess rating, else the middle
 * of the player's online ratings, else null (treated as a newer player).
 */
export function planRating(player, platformRatings = []) {
  const uscf = Number(player?.ratings?.uscf);
  if (Number.isFinite(uscf) && uscf > 0) return uscf;
  const online = (platformRatings || [])
    .filter((r) => r && r.playerId === player?.playerId && Number.isFinite(Number(r.rating)) && Number(r.rating) > 0)
    .map((r) => Number(r.rating))
    .sort((a, b) => a - b);
  return online.length ? online[Math.floor(online.length / 2)] : null;
}

/**
 * The plan for one player.
 *
 * @param {object} input
 * @param {object|null} input.priority   playerHome.js's priority ({ category, label, advice, trainingTheme }) or null
 * @param {object} input.reviews         { due, active, href }
 * @param {number|null} [input.rating]   picks the video's level
 * @param {number} [input.analysedCount] games analyzed, for the wording when there is no priority yet
 * @param {string|null} [input.themeOverride] a theme key from a deep link (#/training?theme=fork): practise that instead
 */
export function buildStudyPlan({ priority = null, reviews = { due: 0, active: 0, href: '#/training?mode=mistakes' }, rating = null, analysedCount = 0, themeOverride = null } = {}) {
  const theme = themeOverride || (priority ? puzzleThemeFor(priority.trainingTheme) : null);
  const themeLink = theme ? lichessForTheme(theme) : null;

  let watch = null;
  if (themeOverride) watch = videoForTheme(theme) ?? generalVideo(rating);
  else if (priority) watch = videoForTheme(theme) ?? videoForCategory(priority.category, rating);
  else watch = generalVideo(rating);

  const practise = themeLink
    ? { label: `${themeLink.label} puzzles`, url: themeLink.url, theme }
    : { label: LICHESS_MIXED.label, url: LICHESS_MIXED.url, theme: null };

  let focus;
  if (themeOverride && themeLink) {
    focus = { label: themeLink.label, line: 'You picked this theme. Watch the video, then practise it.' };
  } else if (priority) {
    focus = { label: priority.label, line: priority.advice ?? null };
  } else {
    focus = {
      ...DEFAULT_FOCUS,
      line: analysedCount
        ? 'Not enough analyzed games yet to name one thing. Until then, these are good habits at any level.'
        : DEFAULT_FOCUS.line,
    };
  }

  return {
    hasPriority: !!priority && !themeOverride,
    focus,
    watch,
    practise: { ...practise, suggestion: PRACTISE_SUGGESTION },
    review: { due: reviews.due ?? 0, active: reviews.active ?? 0, href: reviews.href },
    play: { text: 'Play one long game this week and it will show up here.' },
  };
}
