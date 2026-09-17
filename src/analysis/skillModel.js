/*
 * skillModel.js — one answer to "how good is this player".
 *
 * There were three parallel representations and the only one with real data was
 * the one nobody could see:
 *
 *   players.rubric        1-10, manual   -> what the Roster displayed
 *   assessments           1-10, manual   -> one leftover test fixture
 *   player_skill_scores   0-100, engine  -> real analysis, displayed nowhere
 *
 * This module is the single place that reconciles them. The rules, in order:
 *
 *   1. A coach's score always wins. The engine proposes; the coach disposes.
 *   2. The engine's number is shown BESIDE the coach's, labelled a suggestion,
 *      never written over it.
 *   3. A low-confidence engine score is not shown as a number at all.
 *
 * SCALE: the internal scale is 0-100, because that is what scoring.js produces
 * and what carries confidence and observation counts. The 1-10 rubric is a
 * presentation scale, converted at the boundary by toRubric/toEngineScale, and
 * every rendered number is labelled with the scale it is on.
 */

import { CATEGORY_KEYS, CATEGORY_LABELS } from './scoring.js';
import { RUBRIC_KEY_BY_CATEGORY } from './presentation.js';

export const ENGINE_MAX = 100;
export const RUBRIC_MAX = 10;

/** Engine 0-100 -> rubric 0-10. */
export const toRubric = (score) => (score == null ? null : Math.round((score / ENGINE_MAX) * RUBRIC_MAX));
/** Rubric 0-10 -> engine 0-100, for averaging the two on one axis. */
export const toEngineScale = (score) => (score == null ? null : Math.round((score / RUBRIC_MAX) * ENGINE_MAX));

/** Category key in the engine's vocabulary, from the roster rubric's. */
export const CATEGORY_BY_RUBRIC_KEY = Object.freeze(
  Object.fromEntries(Object.entries(RUBRIC_KEY_BY_CATEGORY).map(([category, rubric]) => [rubric, category])),
);

/**
 * Has a coach actually assessed this player, or is the rubric still at its
 * default?
 *
 * This matters more than it looks. Every category sitting on the same value,
 * with no dated assessment behind it, is the signature of a form nobody has
 * filled in - not of a coach who judged all eight areas identically. Treating
 * that as an authoritative score would permanently suppress the engine's real
 * measurements, which is exactly the bug this module exists to fix.
 */
export function hasCoachAssessment(player, assessments = []) {
  if (assessments.some((a) => a.playerId === player?.playerId)) return true;
  const rubric = player?.rubric || {};
  const values = Object.values(RUBRIC_KEY_BY_CATEGORY)
    .map((key) => rubric[key])
    .filter((v) => v != null);
  if (!values.length) return false;
  return new Set(values).size > 1;
}

/**
 * One category, resolved.
 *
 * @returns {{
 *   category: string, label: string,
 *   value: number|null,        // 0-100, the number to rank or average on
 *   rubricValue: number|null,  // 0-10, the number to show on the roster
 *   source: 'coach'|'engine'|'none',
 *   suggestion: number|null,   // engine's 0-10, to show beside a coach score
 *   confidence: string,
 *   observations: number,
 *   showSuggestion: boolean
 * }}
 */
export function resolveCategory(category, { manualRubric = null, engine = null, coachAssessed = false } = {}) {
  const label = CATEGORY_LABELS[category] ?? category;
  const engineScore = engine && engine.score != null ? engine.score : null;
  const confidence = engine?.confidence ?? 'none';
  const observations = engine?.observations ?? engine?.n ?? 0;
  // A thin engine score is never rendered as a number - see the spec's
  // presentation rules. It can still be carried for a coach to inspect.
  const confidentEnough = engineScore != null && confidence !== 'low' && confidence !== 'none';

  if (coachAssessed && manualRubric != null) {
    return {
      category, label,
      value: toEngineScale(manualRubric),
      rubricValue: manualRubric,
      source: 'coach',
      suggestion: confidentEnough ? toRubric(engineScore) : null,
      confidence, observations,
      showSuggestion: confidentEnough,
    };
  }
  if (confidentEnough) {
    return {
      category, label,
      value: engineScore,
      rubricValue: toRubric(engineScore),
      source: 'engine',
      suggestion: null,
      confidence, observations,
      showSuggestion: false,
    };
  }
  return {
    category, label,
    value: null, rubricValue: null,
    source: 'none',
    suggestion: null,
    confidence, observations,
    showSuggestion: false,
  };
}

/** All eight categories for one player. */
export function resolvePlayerSkills(player, skills = {}, assessments = []) {
  const coachAssessed = hasCoachAssessment(player, assessments);
  const rubric = player?.rubric || {};
  return CATEGORY_KEYS.map((category) =>
    resolveCategory(category, {
      manualRubric: rubric[RUBRIC_KEY_BY_CATEGORY[category]] ?? null,
      engine: skills[category] ?? null,
      coachAssessed,
    }),
  );
}

/**
 * The club-wide profile, on the 0-100 scale, ignoring categories nobody has a
 * real number for. Averaging an unmeasured category as zero is what produced
 * the flat 2.5 across all eight categories on the home page.
 */
export function clubProfile(players, skillsByPlayer = {}, assessments = []) {
  const out = {};
  for (const category of CATEGORY_KEYS) {
    const values = [];
    let engineBacked = 0;
    for (const player of players) {
      const resolved = resolveCategory(category, {
        manualRubric: player?.rubric?.[RUBRIC_KEY_BY_CATEGORY[category]] ?? null,
        engine: skillsByPlayer[player.playerId]?.[category] ?? null,
        coachAssessed: hasCoachAssessment(player, assessments),
      });
      if (resolved.value == null) continue;
      values.push(resolved.value);
      if (resolved.source === 'engine') engineBacked += 1;
    }
    out[category] = {
      category,
      label: CATEGORY_LABELS[category] ?? category,
      average: values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null,
      rubricAverage: values.length
        ? Math.round((values.reduce((a, b) => a + b, 0) / values.length / ENGINE_MAX) * RUBRIC_MAX * 10) / 10
        : null,
      measured: values.length,
      engineBacked,
    };
  }
  return out;
}

/** Where club time should go: the weakest categories that are actually measured. */
export function weakestCategories(profile, count = 3) {
  return Object.values(profile)
    .filter((entry) => entry.average != null && entry.category !== 'notation')
    .sort((a, b) => a.average - b.average)
    .slice(0, count);
}
