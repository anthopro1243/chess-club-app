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
import { createStore, useStore } from '../../services/store.js';
import { supabase, isSupabaseConfigured } from '../../services/supabaseClient.js';
import { reportSyncError, reportLoadError, reportSyncOk } from '../../services/syncStatus.js';
import { CATEGORY_KEYS } from '../../analysis/scoring.js';

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
  reportSyncOk('the game analysis');
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
  reportSyncOk('the skill scores');

  const history = rows.map((r) => ({
    player_id: r.player_id,
    category: r.category,
    score: r.score,
    confidence: r.confidence,
    game_id: gameId,
  }));
  const { error: histError } = await supabase.from('player_skill_history').insert(history);
  if (histError) reportSyncError('the skill history', histError.message);
  else reportSyncOk('the skill history');

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
    reportLoadError('the analysis archive', error.message);
    return;
  }
  reportSyncOk('the analysis archive');
  analyses.set((data || []).map(fromRow));

  const { data: skillData, error: skillError } = await supabase
    .from('player_skill_scores')
    .select('*');
  if (skillError) {
    reportLoadError('the skill scores', skillError.message);
    return;
  }
  reportSyncOk('the skill scores');
  skills.set((skillData || []).map(skillFromRow));
}

/**
 * Every analysis of one player's own games, for working out their tracked
 * scores: one entry per game, each with the date the game was played.
 *
 * Read from the database, not from the local list. The local list holds only
 * the newest 500 analysis rows in the whole club, so a coach's browser working
 * through a backlog would score a member from whichever few of their games
 * happened to be in that window, and write the result over the member's real
 * scores. Heavy columns (the per-move detail) are left out.
 *
 * Falls back to what is held locally when there is no database or it cannot
 * be reached; `playedAtOf` supplies dates for that case.
 */
export async function analysesForScoring(playerId, { playedAtOf = () => null } = {}) {
  const fromLocal = () =>
    analyses.get()
      .filter((a) => a.playerId === playerId)
      .map((a) => ({
        gameId: a.gameId, schemaVersion: a.schemaVersion ?? 1, playedAt: playedAtOf(a.gameId),
        raw: a.raw, movesPlayed: a.movesPlayed, movesCounted: a.movesCounted, motifCounts: a.motifCounts,
      }));
  if (!isSupabaseConfigured) return fromLocal();

  const { data, error } = await supabase
    .from('game_analyses')
    .select('game_id, schema_version, moves_played, moves_counted, raw, motif_counts')
    .eq('player_id', playerId)
    .order('analyzed_at', { ascending: false })
    .limit(1000);
  if (error || !data) return fromLocal();

  // One entry per game: the newest engine schema if a game was analysed twice.
  const latest = new Map();
  for (const row of data) {
    const kept = latest.get(row.game_id);
    if (!kept || (row.schema_version ?? 1) > (kept.schema_version ?? 1)) latest.set(row.game_id, row);
  }

  const ids = [...latest.keys()];
  const dates = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const { data: games, error: gamesError } = await supabase
      .from('games')
      .select('id, played_at')
      .in('id', ids.slice(i, i + 100));
    if (gamesError) return fromLocal();
    for (const g of games || []) dates.set(g.id, g.played_at);
  }

  return [...latest.values()].map((row) => ({
    gameId: row.game_id,
    schemaVersion: row.schema_version ?? 1,
    playedAt: dates.get(row.game_id) ?? null,
    raw: row.raw || {},
    movesPlayed: row.moves_played,
    movesCounted: row.moves_counted,
    motifCounts: row.motif_counts || {},
  }));
}

/** Both sides of one game, if it has been analysed. */
export function useAnalysisForGame(gameId) {
  const all = useAnalyses();
  return useMemo(() => all.filter((a) => a.gameId === gameId), [all, gameId]);
}

/** One player's tracked scores, keyed by category, outside React. */
export function getSkillsForPlayer(playerId) {
  const out = {};
  for (const row of skills.get()) {
    if (row.playerId !== playerId) continue;
    out[row.category] = {
      score: row.score,
      games: row.games,
      trend: row.trend,
      confidence: row.confidence,
      n: row.observations,
    };
  }
  return out;
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

/*
 * Pull on sign-in, the same way gamesStore and rosterStore do. Without this
 * the analyses only exist in whichever browser produced them, and a coach's
 * work would be invisible to the player it was about.
 */
if (isSupabaseConfigured) {
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) syncFromCloud();
  });
  supabase.auth.getSession().then(({ data }) => {
    if (data.session) syncFromCloud();
  });
}
