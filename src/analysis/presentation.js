/*
 * presentation.js — the rules about what a viewer is allowed to see and how a
 * score is allowed to be worded.
 *
 * Kept as pure functions, separately from the JSX, for two reasons. The first
 * is that the permission rule protects children: "no player ever sees another
 * player's analysis" has to be testable without a browser and without an
 * account. The second is that hiding something in React hides nothing — this
 * module is the second line, behind the RLS policies in
 * 0009_game_analysis.sql, not the only one.
 */

import { CATEGORY_KEYS, CATEGORY_LABELS } from './scoring.js';

export const NOT_ENOUGH = 'not enough games yet';
export const NOT_MEASURABLE = 'not measurable from games';

/** Roles that may see everything. */
const STAFF = new Set(['coach', 'admin']);

export const isStaff = (viewer) => !!viewer && STAFF.has(viewer.role);

/**
 * May `viewer` see the analysis of `playerId`?
 *
 * Coaches and admins: everything. A player: only their own. Anyone else —
 * signed out, pending, a parent account — nothing. Deliberately a whitelist:
 * an unknown role sees nothing rather than everything.
 */
export function canViewAnalysis(viewer, playerId) {
  if (!viewer || !viewer.role) return false;
  if (isStaff(viewer)) return true;
  if (viewer.role === 'player') return !!playerId && viewer.playerId === playerId;
  return false;
}

/** Filter a list of analysis rows down to what this viewer may see. */
export function visibleAnalyses(viewer, rows = []) {
  return rows.filter((row) => canViewAnalysis(viewer, row.player_id ?? row.playerId ?? null));
}

/**
 * How a single category should be rendered.
 *
 * A score whose confidence is 'low' or 'none' is never shown as a number. The
 * difference between "endgame 8" and "endgame — not enough games yet" is the
 * difference between a 12-year-old quitting and a 12-year-old practising, and
 * a number computed from four moves has no business looking like a fact.
 */
export function describeScore(entry, { trend = null } = {}) {
  if (!entry || entry.score === null || entry.measured === false) {
    return {
      display: entry?.note ? NOT_MEASURABLE : NOT_ENOUGH,
      numeric: null,
      showNumber: false,
      confidence: entry?.confidence ?? 'none',
      note: entry?.note ?? null,
    };
  }
  if (entry.confidence === 'low' || entry.confidence === 'none') {
    return {
      display: NOT_ENOUGH,
      numeric: entry.score,
      showNumber: false,
      confidence: entry.confidence,
      note: null,
    };
  }
  return {
    display: String(entry.score),
    numeric: entry.score,
    showNumber: true,
    confidence: entry.confidence,
    trend: trend ?? null,
    note: null,
  };
}

/**
 * Lead with the trend, not the level. "Board vision 46, up 9 over ten games"
 * reads as progress; "board vision 46" reads as a verdict on the child.
 */
export function trendLabel(trend) {
  if (trend == null || Number.isNaN(trend)) return null;
  const n = Math.round(trend);
  if (n === 0) return 'steady';
  return n > 0 ? `up ${n}` : `down ${Math.abs(n)}`;
}

/** Headline line for one category, trend first where there is one. */
export function categoryLine(key, entry, trend = null) {
  const described = describeScore(entry, { trend });
  const label = CATEGORY_LABELS[key] ?? key;
  const movement = trendLabel(trend);
  if (!described.showNumber) return { label, text: described.display, ...described };
  return {
    label,
    text: movement ? `${described.display}, ${movement} over recent games` : described.display,
    ...described,
  };
}

/**
 * The player's own view: one priority, not a ranked list of every failure.
 * A teenager handed eight numbers and told six are bad stops opening the app.
 */
export function playerSummary(scores, plan, trends = {}) {
  const categories = CATEGORY_KEYS.map((key) => categoryLine(key, scores?.[key], trends[key] ?? null));
  const priority = plan?.priorities?.[0] ?? null;
  return {
    categories,
    priority: priority
      ? {
          category: priority.category,
          label: CATEGORY_LABELS[priority.category] ?? priority.category,
          advice: priority.advice ?? null,
          trainingTheme: priority.practice?.trainingTheme ?? priority.trainingTheme ?? null,
        }
      : null,
    measuredCount: categories.filter((c) => c.showNumber).length,
  };
}

/** The coach's view may show every number, including the shaky ones. */
export function coachSummary(scores, trends = {}) {
  return CATEGORY_KEYS.map((key) => {
    const entry = scores?.[key];
    return {
      key,
      label: CATEGORY_LABELS[key] ?? key,
      score: entry?.score ?? null,
      confidence: entry?.confidence ?? 'none',
      observations: entry?.n ?? 0,
      trend: trends[key] ?? null,
      // A coach is shown the raw number even at low confidence, but it is
      // always labelled, so "46 (low, n=4)" can never be mistaken for a fact.
      caveat: entry?.score != null && (entry.confidence === 'low' || entry.confidence === 'none')
        ? `low confidence, ${entry?.n ?? 0} observations`
        : null,
    };
  });
}

/** Map a scoring.js category key onto the roster rubric key it advises. */
export const RUBRIC_KEY_BY_CATEGORY = Object.freeze({
  openingKnowledge: 'opening',
  tacticalVision: 'tactics',
  positionalUnderstanding: 'positional',
  endgameTechnique: 'endgame',
  timeManagement: 'timeManagement',
  boardVision: 'boardVision',
  psychologicalResilience: 'resilience',
  notation: 'notation',
});

/**
 * Engine scores as SUGGESTIONS beside the coach's manual rubric, on the
 * roster's 0-10 scale. Never overwrites a coach score — the point is seeing
 * where the number and the judgement disagree.
 */
export function suggestedRubric(scores) {
  const out = {};
  for (const [category, rubricKey] of Object.entries(RUBRIC_KEY_BY_CATEGORY)) {
    const entry = scores?.[category];
    if (!entry || entry.score == null || !entry.measured) continue;
    if (entry.confidence === 'low' || entry.confidence === 'none') continue;
    out[rubricKey] = {
      suggestion: Math.round(entry.score / 10),
      confidence: entry.confidence,
      observations: entry.n,
      source: 'engine',
    };
  }
  return out;
}

/*
 * improvementPlan() names themes for humans ("Back Rank Mate"); puzzles.json
 * tags them the Lichess way ("backRankMate"). The spec says these already
 * match. They do not — and the failure is silent: an unmapped name filters the
 * Training page down to zero puzzles and the player sees an empty screen
 * instead of the drill they were just told to do. The test alongside this
 * checks every value here against the shipped puzzle data.
 */
export const PUZZLE_THEME_BY_TRAINING_THEME = Object.freeze({
  Fork: 'fork',
  Pin: 'pin',
  Skewer: 'skewer',
  'Back Rank Mate': 'backRankMate',
  'Hanging Piece': 'hangingPiece',
  'Discovered Attack': 'discoveredAttack',
  'Trapped Piece': 'trappedPiece',
  Deflection: 'deflection',
  'Smothered Mate': 'smotheredMate',
  Opening: 'opening',
  'Quiet Move': 'quietMove',
  Endgame: 'endgame',
});

/**
 * The puzzle theme to pre-filter Training to, or null when the plan names
 * something the puzzle set cannot serve. Null means "send them to the
 * unfiltered page", never "send them to an empty one".
 */
export function puzzleThemeFor(trainingTheme) {
  if (!trainingTheme) return null;
  return PUZZLE_THEME_BY_TRAINING_THEME[trainingTheme] ?? null;
}
