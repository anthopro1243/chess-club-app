/*
 * analysisStore.js — stored game analyses and tracked skill scores.
 *
 * Same five-part shape as rosterStore, gamesStore and puzzleAttemptsStore: a
 * local store, row translation, a cloud pull on sign-in, a push after every
 * write, and hooks for the pages.
 *
 * Decision 3 in the spec: archiving a game marks it pending and a worker drains
 * the queue while the app is open and idle. Nobody waits on a progress bar to
 * see their game, and nobody has to remember to trigger anything.
 */

import { useMemo } from 'react';
import { createStore, useStore } from './store.js';
import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { reportSyncError } from './syncStatus.js';
import { CATEGORY_KEYS } from '../analysis/scoring.js';

const analyses = createStore('cc-game-analyses-v1', []);
const skills = createStore('cc-skill-scores-v1', []);
/** Game ids waiting to be analysed, oldest first. */
const pending = createStore('cc-analysis-queue-v1', []);

const LOCAL_LIMIT = 500;

export const useAnalyses = () => useStore(analyses);
export const useSkillScores = () => useStore(skills);
export const usePendingQueue = () => useStore(pending);
export const getAnalyses = () => analyses.get();
export const getPending = () => pending.get();

/* ── row translation ─────────────────────────────────────────────────────── */

const fromRow = (row) => ({
  id: row.id,
  gameId: row.game_id,
  playerId: row.player_id,
  side: row.side,
  engine: row.engine,
  depth: row.depth,
  multipv: row.multipv,
  schemaVersion: row.schema_version,
  accuracy: row.accuracy == null ? null : Number(row.accuracy),
  acpl: row.acpl == null ? null : Number(row.acpl),
  meanWinLoss: row.mean_win_loss == null ? null : Number(row.mean_win_loss),
  movesPlayed: row.moves_played,
  movesCounted: row.moves_counted,
  counts: row.counts || {},
  byPhase: row.by_phase || {},
  raw: row.raw || {},
  scores: row.scores || {},
  critical: row.critical || [],
  motifCounts: row.motif_counts || {},
  plies: row.plies || null,
  coachNote: row.coach_note || '',
  analyzedAt: row.analyzed_at,
});

const skillFromRow = (row) => ({
  playerId: row.player_id,
  category: row.category,
  score: row.score,
  confidence: row.confidence,
  observations: row.observations,
  games: row.games,
  trend: row.trend,
  source: row.source,
  updatedAt: row.updated_at,
});

/* ── the queue ───────────────────────────────────────────────────────────── */

/** Mark a freshly archived game as needing analysis. Idempotent. */
export function enqueueGame(gameId) {
  if (!gameId) return;
  const queue = pending.get();
  if (queue.includes(gameId)) return;
  if (analyses.get().some((a) => a.gameId === gameId)) return; // already done
  pending.set([...queue, gameId]);
}

export function dequeueGame(gameId) {
  pending.set(pending.get().filter((id) => id !== gameId));
}

/** Everything archived but never analysed — what "Analyze all pending" runs. */
export function pendingFor(games = []) {
  const done = new Set(analyses.get().map((a) => a.gameId));
  return games.filter((g) => !done.has(g.id)).map((g) => g.id);
}

/* ── writes ──────────────────────────────────────────────────────────────── */

/**
 * Save both sides of one analysed game. Local first so the UI updates even if
 * the network is down, then pushed; a failed push is surfaced rather than
 * silently swallowed, which is the mistake commit 99cd699 already fixed once.
 */
export async function saveAnalysis(rows) {
  const stamped = rows.map((row) => ({ ...row, analyzed_at: new Date().toISOString() }));
  const local = stamped.map(fromRow);

  const keep = analyses
    .get()
    .filter((a) => !local.some((n) => n.gameId === a.gameId && n.side === a.side));
  analyses.set([...local, ...keep].slice(0, LOCAL_LIMIT));
  for (const row of stamped) dequeueGame(row.game_id);

  if (!isSupabaseConfigured) return { ok: true, local: true };

  const { error } = await supabase
    .from('game_analyses')
    .upsert(stamped, { onConflict: 'game_id,side,schema_version' });
  if (error) {
    reportSyncError('the game analysis', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Persist the tracked per-category scores, and append to the history chart. */
export async function saveSkillScores(playerId, tracked, { gameId = null } = {}) {
  if (!playerId || !tracked) return { ok: false, error: 'no player' };

  const rows = CATEGORY_KEYS.map((category) => {
    const entry = tracked[category];
    if (!entry || entry.score == null) return null;
    return {
      player_id: playerId,
      category,
      score: Math.round(entry.score),
      confidence: entry.confidence ?? 'none',
      observations: entry.n ?? 0,
      games: entry.games ?? 0,
      trend: Math.round(entry.trend ?? 0),
      source: 'engine',
      updated_at: new Date().toISOString(),
    };
  }).filter(Boolean);
  if (!rows.length) return { ok: true, empty: true };

  const keep = skills.get().filter((s) => s.playerId !== playerId);
  skills.set([...keep, ...rows.map(skillFromRow)]);

  if (!isSupabaseConfigured) return { ok: true, local: true };

  const { error } = await supabase
    .from('player_skill_scores')
    .upsert(rows, { onConflict: 'player_id,category' });
  if (error) {
    reportSyncError('the skill scores', error.message);
    return { ok: false, error: error.message };
  }

  const history = rows.map((r) => ({
    player_id: r.player_id,
    category: r.category,
    score: r.score,
    confidence: r.confidence,
    game_id: gameId,
  }));
  const { error: histError } = await supabase.from('player_skill_history').insert(history);
  if (histError) reportSyncError('the skill history', histError.message);

  return { ok: true };
}

/* ── reads ───────────────────────────────────────────────────────────────── */

export async function syncFromCloud() {
  if (!isSupabaseConfigured) return;
  const { data, error } = await supabase
    .from('game_analyses')
    .select('*')
    .order('analyzed_at', { ascending: false })
    .limit(LOCAL_LIMIT);
  if (error) {
    reportSyncError('the analysis archive', error.message);
    return;
  }
  analyses.set((data || []).map(fromRow));

  const { data: skillData, error: skillError } = await supabase
    .from('player_skill_scores')
    .select('*');
  if (skillError) {
    reportSyncError('the skill scores', skillError.message);
    return;
  }
  skills.set((skillData || []).map(skillFromRow));
}

/** Both sides of one game, if it has been analysed. */
export function useAnalysisForGame(gameId) {
  const all = useAnalyses();
  return useMemo(() => all.filter((a) => a.gameId === gameId), [all, gameId]);
}

/** One player's tracked scores, keyed by category. */
export function useSkillsForPlayer(playerId) {
  const all = useSkillScores();
  return useMemo(() => {
    const out = {};
    for (const row of all) if (row.playerId === playerId) out[row.category] = row;
    return out;
  }, [all, playerId]);
}
