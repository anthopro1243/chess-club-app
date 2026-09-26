/*
 * prepResultsStore.js — best and latest result per player per drill.
 *
 * Same five-part shape as gamesStore: a local store, row translation, a cloud
 * pull on sign-in, a push after every write, and hooks for the pages. The
 * merge rules (what counts as best, what counts as a pass) are the pure
 * prepResults.js.
 *
 * One row per (player, drill): the rules quiz and the notation drills.
 * RLS (0021): a member reads and writes only their own rows (owns_player);
 * a coach reads and writes everyone's, e.g. when a member takes the quiz on
 * the coach's laptop. Practice with no player chosen is never stored.
 */

import { useMemo } from 'react';
import { createStore, useStore } from './store.js';
import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { reportSyncError } from './syncStatus.js';
import { mergeResult, resultFor } from './prepResults.js';

const store = createStore('cc-prep-results-v1', []);

export function usePrepResults() {
  return useStore(store);
}

export function getPrepResults() {
  return store.get();
}

/** One player's record for one drill, or null. */
export function usePrepResult(playerId, drill) {
  const results = usePrepResults();
  return useMemo(() => (playerId ? resultFor(results, playerId, drill) : null), [results, playerId, drill]);
}

let cloudReady = false;
let channel = null;

const part = (score, total, seconds, at) =>
  Number.isInteger(score) && Number.isInteger(total) && total > 0
    ? { score, total, accuracy: score / total, seconds: seconds ?? null, at: at || null }
    : null;

function fromRow(row) {
  return {
    playerId: row.player_id,
    drill: row.drill,
    best: part(row.best_score, row.best_total, row.best_seconds, row.best_at),
    last: part(row.last_score, row.last_total, row.last_seconds, row.last_at),
    attempts: row.attempts ?? 0,
    passedAt: row.passed_at || null,
  };
}

function toRow(record) {
  return {
    player_id: record.playerId,
    drill: record.drill,
    best_score: record.best?.score ?? null,
    best_total: record.best?.total ?? null,
    best_seconds: record.best?.seconds ?? null,
    best_at: record.best?.at ?? null,
    last_score: record.last?.score ?? null,
    last_total: record.last?.total ?? null,
    last_seconds: record.last?.seconds ?? null,
    last_at: record.last?.at ?? null,
    attempts: record.attempts,
    passed_at: record.passedAt,
    updated_at: new Date().toISOString(),
  };
}

async function syncFromCloud() {
  const { data, error } = await supabase.from('prep_results').select('*');
  if (error) {
    reportSyncError('quiz and drill results', error.message);
    return;
  }
  cloudReady = true;
  store.set(data.map(fromRow));
}

function subscribeRealtime() {
  if (channel) return;
  channel = supabase
    .channel('prep-results-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'prep_results' }, () => {
      syncFromCloud();
    })
    .subscribe();
}

if (isSupabaseConfigured) {
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) {
      syncFromCloud();
      subscribeRealtime();
    } else {
      cloudReady = false;
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }
    }
  });
  supabase.auth.getSession().then(({ data }) => {
    if (data.session) {
      syncFromCloud();
      subscribeRealtime();
    }
  });
}

/**
 * Fold one finished attempt into a player's record and save it.
 * `attempt` is `{ score, total, seconds }`. Returns the new record, or null
 * when there is no player (practice) or the attempt is malformed.
 */
export function recordPrepResult(playerId, drill, attempt) {
  if (!playerId) return null;
  const prev = resultFor(store.get(), playerId, drill);
  const merged = mergeResult(prev, drill, { ...attempt, at: new Date().toISOString() });
  if (!merged || merged === prev) return null;
  const record = { playerId, ...merged };

  store.set((rows) => [...rows.filter((r) => !(r.playerId === playerId && r.drill === drill)), record]);

  if (isSupabaseConfigured && cloudReady) {
    supabase
      .from('prep_results')
      .upsert(toRow(record), { onConflict: 'player_id,drill' })
      .then(({ error }) => {
        if (error) reportSyncError('that result', error.message);
      });
  }
  return record;
}
