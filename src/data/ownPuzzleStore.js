/*
 * ownPuzzleStore.js — the positions a player actually got wrong, scheduled.
 *
 * Every critical moment in an analysed game is a FEN plus the move that should
 * have been played, already validated by the engine. That is a puzzle, and it
 * is the one drill in the app aimed at a specific player's specific mistake.
 *
 * Same five-part shape as the other stores: local store, row translation, a
 * cloud pull, a push after every write, and hooks for the pages.
 */

import { useMemo } from 'react';
import { createStore, useStore } from './store.js';
import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { reportSyncError } from './syncStatus.js';
import { newPuzzleState, review, dueNow, reviewSummary } from '../analysis/spacedRepetition.js';

const store = createStore('cc-own-puzzles-v1', []);

export const useOwnPuzzles = () => useStore(store);
export const getOwnPuzzles = () => store.get();

const fromRow = (row) => ({
  id: row.id,
  playerId: row.player_id,
  gameId: row.game_id,
  fen: row.fen,
  solution: row.solution,
  played: row.played,
  san: row.san,
  fullmove: row.fullmove,
  themes: row.themes || [],
  source: row.source,
  winPercentLost: row.win_percent_lost == null ? null : Number(row.win_percent_lost),
  label: row.label,
  dueAt: row.due_at,
  intervalDays: row.interval_days,
  ease: Number(row.ease),
  reps: row.reps,
  lapses: row.lapses,
  lastResult: row.last_result,
  lastReviewedAt: row.last_reviewed_at,
  retired: row.retired,
  createdAt: row.created_at,
});

const toRow = (p) => ({
  player_id: p.playerId,
  game_id: p.gameId ?? null,
  fen: p.fen,
  solution: p.solution,
  played: p.played ?? null,
  san: p.san ?? null,
  fullmove: p.fullmove ?? null,
  themes: p.themes ?? [],
  source: p.source ?? 'own-game',
  win_percent_lost: p.winPercentLost ?? null,
  label: p.label ?? null,
  due_at: p.dueAt,
  interval_days: p.intervalDays,
  ease: p.ease,
  reps: p.reps,
  lapses: p.lapses,
  last_result: p.lastResult ?? null,
  last_reviewed_at: p.lastReviewedAt ?? null,
  retired: !!p.retired,
});

/**
 * Add the blunders from one analysed game to a player's review queue.
 *
 * Deduplicated on (player, fen) by the database, so re-analysing a game at a
 * higher depth tops the queue up rather than multiplying the same position
 * into a dozen identical drills.
 */
export async function addOwnGamePuzzles(puzzles, { now = Date.now() } = {}) {
  const usable = (puzzles || []).filter((p) => p.playerId && p.fen && p.solution);
  if (!usable.length) return { ok: true, added: 0 };

  const seeded = usable.map((p) => ({
    playerId: p.playerId,
    gameId: p.gameId ?? null,
    fen: p.fen,
    solution: p.solution,
    played: p.played ?? null,
    san: p.san ?? null,
    fullmove: p.fullmove ?? null,
    themes: p.themes ?? [],
    source: 'own-game',
    winPercentLost: p.winPercentLost ?? null,
    label: p.label ?? null,
    ...newPuzzleState(now),
  }));

  // Local first, so the queue is usable offline and the UI updates at once.
  const existing = store.get();
  const known = new Set(existing.map((p) => `${p.playerId}|${p.fen}`));
  const fresh = seeded.filter((p) => !known.has(`${p.playerId}|${p.fen}`));
  if (fresh.length) store.set([...fresh, ...existing]);

  if (!isSupabaseConfigured) return { ok: true, added: fresh.length, local: true };

  // ignoreDuplicates: a position already in the queue keeps the schedule it
  // has earned. Resetting it on re-analysis would erase the player's progress.
  const { error } = await supabase
    .from('player_puzzles')
    .upsert(seeded.map(toRow), { onConflict: 'player_id,fen', ignoreDuplicates: true });
  if (error) {
    reportSyncError('the review queue', error.message);
    return { ok: false, error: error.message, added: fresh.length };
  }
  return { ok: true, added: fresh.length };
}

/** Record one review and reschedule the position. */
export async function reviewOwnPuzzle(puzzle, grade, { now = Date.now() } = {}) {
  const next = review(puzzle, grade, now);
  const updated = { ...puzzle, ...next };
  store.set(store.get().map((p) => (p.id === puzzle.id && p.fen === puzzle.fen ? updated : p)));

  if (!isSupabaseConfigured || !puzzle.id) return { ok: true, local: true, state: next };

  const { error } = await supabase
    .from('player_puzzles')
    .update({
      due_at: next.dueAt,
      interval_days: next.intervalDays,
      ease: next.ease,
      reps: next.reps,
      lapses: next.lapses,
      last_result: next.lastResult,
      last_reviewed_at: next.lastReviewedAt,
      retired: next.retired,
    })
    .eq('id', puzzle.id);
  if (error) {
    reportSyncError('the review schedule', error.message);
    return { ok: false, error: error.message, state: next };
  }
  return { ok: true, state: next };
}

export async function syncOwnPuzzlesFromCloud(playerId = null) {
  if (!isSupabaseConfigured) return;
  let query = supabase.from('player_puzzles').select('*').order('due_at', { ascending: true });
  if (playerId) query = query.eq('player_id', playerId);
  const { data, error } = await query.limit(1000);
  if (error) {
    reportSyncError('the review queue', error.message);
    return;
  }
  store.set((data || []).map(fromRow));
}

/** One player's queue. RLS already restricts the rows; this narrows the view. */
export function useOwnPuzzlesFor(playerId) {
  const all = useOwnPuzzles();
  return useMemo(() => all.filter((p) => p.playerId === playerId), [all, playerId]);
}

/** What that player should be shown right now. */
export function useDuePuzzles(playerId, now = Date.now()) {
  const mine = useOwnPuzzlesFor(playerId);
  return useMemo(() => dueNow(mine, now), [mine, now]);
}

export function useReviewSummary(playerId, now = Date.now()) {
  const mine = useOwnPuzzlesFor(playerId);
  return useMemo(() => reviewSummary(mine, now), [mine, now]);
}

/* Pull the review queue on sign-in, same pattern as the other stores. */
if (isSupabaseConfigured) {
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) syncOwnPuzzlesFromCloud();
  });
  supabase.auth.getSession().then(({ data }) => {
    if (data.session) syncOwnPuzzlesFromCloud();
  });
}
