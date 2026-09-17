/*
 * queue.js — the analysis queue, held on the games row itself.
 *
 * It used to be an array in localStorage, which meant the queue was per
 * browser: analysing on a laptop told a phone nothing, and clearing site data
 * silently dropped the backlog. The state now lives in
 * `public.games.analysis_status`, so "which games still need analysing" is a
 * property of the club's data rather than of one device.
 *
 * Claiming is deliberate. A worker sets 'running' with a timestamp before it
 * starts; a row still 'running' after STALE_MINUTES is assumed to belong to a
 * tab that was closed mid-analysis and may be taken over. Without that, one
 * closed laptop lid wedges a game forever.
 */

import { supabase, isSupabaseConfigured } from '../data/supabaseClient.js';
import { reportSyncError } from '../data/syncStatus.js';

export const STALE_MINUTES = 15;
export const MAX_ATTEMPTS = 3;

const staleCutoff = () => new Date(Date.now() - STALE_MINUTES * 60000).toISOString();

/** How much work is outstanding, for the coach's dashboard. */
export async function queueCounts() {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase
    .from('games')
    .select('analysis_status')
    .is('deleted_at', null);
  if (error) {
    reportSyncError('the analysis queue', error.message);
    return null;
  }
  const counts = { pending: 0, running: 0, done: 0, failed: 0, skipped: 0 };
  for (const row of data || []) {
    counts[row.analysis_status] = (counts[row.analysis_status] || 0) + 1;
  }
  return counts;
}

/**
 * Take the next game that needs analysing, marking it as ours.
 *
 * The claim is a conditional UPDATE rather than a read-then-write, so two tabs
 * racing for the same row cannot both win: the second one updates zero rows
 * and moves on.
 */
export async function claimNext({ playerId = null } = {}) {
  if (!isSupabaseConfigured) return null;

  let find = supabase
    .from('games')
    .select('id, pgn, white_player_id, black_player_id, played_at, mode, analysis_attempts')
    .is('deleted_at', null)
    .not('pgn', 'is', null)
    .lt('analysis_attempts', MAX_ATTEMPTS)
    .or(`analysis_status.eq.pending,and(analysis_status.eq.running,analysis_claimed_at.lt.${staleCutoff()})`)
    .order('played_at', { ascending: false })
    .limit(5);

  // A player drains their own games; a coach drains everything.
  if (playerId) find = find.or(`white_player_id.eq.${playerId},black_player_id.eq.${playerId}`);

  const { data, error } = await find;
  if (error || !data?.length) return null;

  for (const candidate of data) {
    const { data: claimed, error: claimError } = await supabase
      .from('games')
      .update({
        analysis_status: 'running',
        analysis_claimed_at: new Date().toISOString(),
        analysis_attempts: (candidate.analysis_attempts ?? 0) + 1,
        analysis_updated_at: new Date().toISOString(),
      })
      .eq('id', candidate.id)
      .neq('analysis_status', 'done')
      .select('id')
      .maybeSingle();
    if (!claimError && claimed) return candidate;
  }
  return null;
}

export async function markDone(gameId, depth) {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase
    .from('games')
    .update({
      analysis_status: 'done',
      analysis_depth: depth ?? null,
      analysis_error: null,
      analysis_claimed_at: null,
      analysis_updated_at: new Date().toISOString(),
    })
    .eq('id', gameId);
  if (error) reportSyncError('the analysis queue', error.message);
}

/**
 * Record a failure. After MAX_ATTEMPTS the row stays 'failed' rather than
 * returning to the queue, so one unparseable PGN cannot spin forever.
 */
export async function markFailed(gameId, message, attempts) {
  if (!isSupabaseConfigured) return;
  const exhausted = (attempts ?? 0) >= MAX_ATTEMPTS;
  const { error } = await supabase
    .from('games')
    .update({
      analysis_status: exhausted ? 'failed' : 'pending',
      analysis_error: String(message || 'unknown error').slice(0, 500),
      analysis_claimed_at: null,
      analysis_updated_at: new Date().toISOString(),
    })
    .eq('id', gameId);
  if (error) reportSyncError('the analysis queue', error.message);
}

/** Put everything unanalysed back in the queue. The coach's backfill button. */
export async function enqueueAll({ playerId = null } = {}) {
  if (!isSupabaseConfigured) return { ok: false, queued: 0 };
  let update = supabase
    .from('games')
    .update({ analysis_status: 'pending', analysis_attempts: 0, analysis_error: null })
    .is('deleted_at', null)
    .not('pgn', 'is', null)
    .in('analysis_status', ['failed', 'skipped']);
  if (playerId) update = update.or(`white_player_id.eq.${playerId},black_player_id.eq.${playerId}`);
  const { data, error } = await update.select('id');
  if (error) {
    reportSyncError('the analysis queue', error.message);
    return { ok: false, queued: 0, error: error.message };
  }
  return { ok: true, queued: data?.length ?? 0 };
}

/** Mark one game for (re)analysis, e.g. straight after it is imported. */
export async function enqueueGameRow(gameId) {
  if (!isSupabaseConfigured || !gameId) return;
  await supabase
    .from('games')
    .update({ analysis_status: 'pending', analysis_attempts: 0, analysis_error: null })
    .eq('id', gameId)
    .neq('analysis_status', 'done');
}
