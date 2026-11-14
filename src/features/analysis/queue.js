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

import { supabase, isSupabaseConfigured } from '../../services/supabaseClient.js';
import { reportSyncError } from '../../services/syncStatus.js';
import { partitionQueueCandidates, RETIRED_SKIP_REASON } from '../roster/retiredPlayers.js';
import { readyForRetry, viewerFirst } from '../../services/external/autoPolicy.js';

export const STALE_MINUTES = 15;
export const MAX_ATTEMPTS = 3;
/* Wide enough that a run of skippable games cannot hide the next real one. */
const CLAIM_WINDOW = 25;

const staleCutoff = () => new Date(Date.now() - STALE_MINUTES * 60000).toISOString();

/** How much work is outstanding, for the coach's dashboard. */
const STATUSES = ['pending', 'running', 'done', 'failed', 'skipped'];

export async function queueCounts() {
  if (!isSupabaseConfigured) return null;
  // One count per status rather than downloading every game row to count
  // them in the browser.
  const results = await Promise.all(
    STATUSES.map((status) =>
      supabase
        .from('games')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .eq('analysis_status', status),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed) {
    reportSyncError('the analysis queue', failed.error.message);
    return null;
  }
  return Object.fromEntries(STATUSES.map((status, i) => [status, results[i].count ?? 0]));
}

/**
 * Take the next game that needs analysing, marking it as ours.
 *
 * The claim is a conditional UPDATE rather than a read-then-write, so two tabs
 * racing for the same row cannot both win: the update only matches the row
 * in exactly the state this tab read (same status, same attempt count, and
 * for a takeover a claim that is still stale). The second tab updates zero
 * rows and moves on. It used to match any status but 'done', so a row the
 * first tab had just set to 'running' still matched and both tabs analysed it.
 */
export async function claimNext({ playerId = null, preferPlayerId = null } = {}) {
  if (!isSupabaseConfigured) return null;

  let find = supabase
    .from('games')
    .select(
      'id, pgn, white_player_id, black_player_id, played_at, mode, analysis_status, analysis_claimed_at, analysis_attempts, analysis_updated_at',
    )
    .is('deleted_at', null)
    .not('pgn', 'is', null)
    .lt('analysis_attempts', MAX_ATTEMPTS)
    .or(`analysis_status.eq.pending,and(analysis_status.eq.running,analysis_claimed_at.lt.${staleCutoff()})`)
    .order('played_at', { ascending: false })
    .limit(CLAIM_WINDOW);

  // A player drains their own games; a coach drains everything.
  if (playerId) find = find.or(`white_player_id.eq.${playerId},black_player_id.eq.${playerId}`);

  const { data, error } = await find;
  if (error || !data?.length) return null;

  /*
   * A game whose only club player has been retired is not worth engine time:
   * nothing on the roster would ever read the result. Those are marked
   * 'skipped' rather than quietly passed over, because a row left 'pending'
   * would come back at the top of every claim and could starve the window of
   * real work (CC-003 alone had 67 pending when it was retired).
   */
  const { analyse, skip } = partitionQueueCandidates(data, await retiredPlayerIds());
  await markSkipped(skip.map((g) => g.id));

  // A game that just failed waits out a backoff before it is tried again, so
  // a transient fault (a dropped connection, a busy engine) gets time to
  // clear instead of burning all MAX_ATTEMPTS in a few seconds. The viewer's
  // own games go first: their analysis is the one somebody is waiting for.
  const now = Date.now();
  const ready = viewerFirst(analyse.filter((g) => readyForRetry(g, now)), preferPlayerId);

  for (const candidate of ready) {
    let claim = supabase
      .from('games')
      .update({
        analysis_status: 'running',
        analysis_claimed_at: new Date().toISOString(),
        analysis_attempts: (candidate.analysis_attempts ?? 0) + 1,
        analysis_updated_at: new Date().toISOString(),
      })
      .eq('id', candidate.id)
      .eq('analysis_status', candidate.analysis_status)
      .eq('analysis_attempts', candidate.analysis_attempts ?? 0);
    if (candidate.analysis_status === 'running') claim = claim.lt('analysis_claimed_at', staleCutoff());
    const { data: claimed, error: claimError } = await claim.select('id').maybeSingle();
    if (!claimError && claimed) return candidate;
  }
  return null;
}

/** Player ids that have been soft-deleted. Empty on any error: fail open, never block the queue. */
async function retiredPlayerIds() {
  const { data, error } = await supabase
    .from('players')
    .select('player_id')
    .not('deleted_at', 'is', null);
  if (error) return new Set();
  return new Set((data || []).map((row) => row.player_id));
}

async function markSkipped(gameIds) {
  if (!gameIds.length) return;
  const { error } = await supabase
    .from('games')
    .update({
      analysis_status: 'skipped',
      analysis_error: RETIRED_SKIP_REASON,
      analysis_claimed_at: null,
      analysis_updated_at: new Date().toISOString(),
    })
    .in('id', gameIds)
    .neq('analysis_status', 'done');
  // Best effort: if RLS refuses (a player cannot update a retired member's
  // game), the game is still left out of this claim, which is what matters.
  if (error) console.warn('analysis queue: could not mark skipped', error.message);
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
