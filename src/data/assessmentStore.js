/*
 * assessmentStore.js — dated skill assessments, written by a coach or by the
 * engine.
 *
 * The form on the Coach page starts every slider at 5 and waits for a human,
 * which is why "Last assessed" read "—" for everyone while the engine had
 * quietly measured the same players across 52 analysed games. An assessment
 * should be able to write itself.
 *
 * The spec's rule is unchanged and is enforced by SOURCE rather than by
 * overwriting: an engine row and a coach row can coexist for the same player,
 * and the coach's is the one that counts. Nothing here ever edits a coach row.
 */

import { useMemo } from 'react';
import { createStore, useStore } from './store.js';
import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { reportSyncError } from './syncStatus.js';
import { writeEngineAssessment } from './engineAssessmentWrite.js';
import { CATEGORY_KEYS } from '../analysis/scoring.js';
import { RUBRIC_KEY_BY_CATEGORY } from '../analysis/presentation.js';
import { toRubric } from '../analysis/skillModel.js';

const store = createStore('cc-assessments-v1', []);

export const useAssessments = () => useStore(store);
export const getAssessments = () => store.get();

/** Column name on `assessments` for each roster rubric key. */
const COLUMN_BY_RUBRIC_KEY = Object.freeze({
  opening: 'opening',
  tactics: 'tactics',
  positional: 'positional',
  endgame: 'endgame',
  timeManagement: 'time_management',
  boardVision: 'board_vision',
  resilience: 'resilience',
  notation: 'notation',
});

const fromRow = (row) => ({
  id: row.id,
  playerId: row.player_id,
  assessedAt: row.assessed_at,
  source: row.source || 'coach',
  notes: row.notes || '',
  rubric: Object.fromEntries(
    Object.entries(COLUMN_BY_RUBRIC_KEY).map(([key, column]) => [key, row[column]]),
  ),
});

/**
 * Turn the engine's tracked 0-100 scores into a rubric on the roster's 1-10
 * scale, dropping anything too thin to state as a number.
 *
 * A low-confidence score is left out entirely rather than rounded into a 5 -
 * an invented middling number is worse than an absent one, because it looks
 * like a measurement.
 */
export function engineRubricFrom(skills = {}) {
  const rubric = {};
  let measured = 0;
  for (const category of CATEGORY_KEYS) {
    const entry = skills[category];
    if (!entry || entry.score == null) continue;
    if (entry.confidence === 'low' || entry.confidence === 'none') continue;
    rubric[RUBRIC_KEY_BY_CATEGORY[category]] = toRubric(entry.score);
    measured += 1;
  }
  return { rubric, measured };
}

/**
 * Record an engine assessment for a player, at most one per day.
 *
 * Called automatically after analysis updates a player's scores, so linking an
 * account or playing a game eventually produces a dated assessment with nobody
 * pressing anything.
 */
export async function recordEngineAssessment(playerId, skills, { gamesAnalysed = 0 } = {}) {
  if (!playerId) return { ok: false, error: 'no player' };
  const { rubric, measured } = engineRubricFrom(skills);
  // Fewer than three measured categories is not an assessment, it is a rumour.
  if (measured < 3) return { ok: false, skipped: 'not enough measured categories', measured };

  const row = {
    player_id: playerId,
    source: 'engine',
    assessed_at: new Date().toISOString(),
    notes: `Derived from ${gamesAnalysed} analysed game${gamesAnalysed === 1 ? '' : 's'}. `
      + 'Engine estimate — a coach assessment overrides this.',
    ...Object.fromEntries(
      Object.entries(rubric).map(([key, value]) => [COLUMN_BY_RUBRIC_KEY[key], value]),
    ),
  };

  const local = { ...fromRow({ ...row, id: `local-${Date.now()}` }) };
  const today = local.assessedAt.slice(0, 10);
  const existing = store
    .get()
    .filter((a) => !(a.playerId === playerId && a.source === 'engine' && a.assessedAt.slice(0, 10) === today));
  store.set([local, ...existing]);

  if (!isSupabaseConfigured) return { ok: true, local: true, measured };

  // One engine row per player per UTC day (a partial unique index). See
  // engineAssessmentWrite.js for why this is not an upsert.
  const saved = await writeEngineAssessment(supabase, row);
  if (!saved.ok) {
    reportSyncError('the assessment', saved.error);
    return { ok: false, error: saved.error };
  }
  return { ok: true, measured };
}

export async function syncAssessmentsFromCloud() {
  if (!isSupabaseConfigured) return;
  const { data, error } = await supabase
    .from('assessments')
    .select('*')
    .order('assessed_at', { ascending: false })
    .limit(500);
  if (error) {
    reportSyncError('the assessments', error.message);
    return;
  }
  store.set((data || []).map(fromRow));
}

/** Every assessment for one player, newest first. */
export function useAssessmentsFor(playerId) {
  const all = useAssessments();
  return useMemo(
    () =>
      all
        .filter((a) => a.playerId === playerId)
        .sort((a, b) => String(b.assessedAt).localeCompare(String(a.assessedAt))),
    [all, playerId],
  );
}

/** The most recent assessment of each kind, for the Coach page's summary. */
export function useLatestAssessment(playerId) {
  const mine = useAssessmentsFor(playerId);
  return useMemo(
    () => ({
      latest: mine[0] ?? null,
      latestCoach: mine.find((a) => a.source === 'coach') ?? null,
      latestEngine: mine.find((a) => a.source === 'engine') ?? null,
    }),
    [mine],
  );
}

if (isSupabaseConfigured) {
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) syncAssessmentsFromCloud();
  });
  supabase.auth.getSession().then(({ data }) => {
    if (data.session) syncAssessmentsFromCloud();
  });
}
