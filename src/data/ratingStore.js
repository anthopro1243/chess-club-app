/*
 * ratingStore.js — per-platform ratings and the coach's override.
 *
 * Deliberately thin. All of the judgement lives in src/analysis/ratings.js;
 * this only persists rows and reads them back. Ratings are stored one row per
 * (player, platform, time control) and are never combined here or anywhere
 * else - see the header of ratings.js for why there is no conversion.
 */

import { useMemo } from 'react';
import { createStore, useStore } from './store.js';
import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { reportSyncError } from './syncStatus.js';

const ratings = createStore('cc-platform-ratings-v1', []);
const overrides = createStore('cc-rating-overrides-v1', []);

export const usePlatformRatings = () => useStore(ratings);
export const useRatingOverrides = () => useStore(overrides);
export const getPlatformRatings = () => ratings.get();
export const getRatingOverrides = () => overrides.get();

const fromRow = (row) => ({
  playerId: row.player_id,
  platform: row.platform,
  timeControl: row.time_control,
  rating: row.rating,
  rd: row.rd,
  games: row.games,
  provisional: row.provisional,
  fetchedAt: row.fetched_at,
});

const overrideFromRow = (row) => ({
  playerId: row.player_id,
  clubRating: row.club_rating,
  note: row.note,
  setBy: row.set_by,
  setAt: row.set_at,
});

/** Store a batch of freshly-read platform ratings. */
export async function savePlatformRatings(rows) {
  if (!rows?.length) return { ok: true, saved: 0 };

  const local = rows.map(fromRow);
  const keep = ratings
    .get()
    .filter(
      (r) =>
        !local.some(
          (n) => n.playerId === r.playerId && n.platform === r.platform && n.timeControl === r.timeControl,
        ),
    );
  ratings.set([...keep, ...local]);

  if (!isSupabaseConfigured) return { ok: true, saved: local.length, local: true };

  const { error } = await supabase
    .from('player_platform_ratings')
    .upsert(rows, { onConflict: 'player_id,platform,time_control' });
  if (error) {
    reportSyncError('the platform ratings', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, saved: rows.length };
}

/**
 * A coach sets a rating by hand. This wins over every derived or imported
 * number, the same way coach_note wins over engine commentary. The database
 * refuses this for anyone who is not a coach.
 */
export async function setRatingOverride(playerId, clubRating, note = null) {
  const row = { player_id: playerId, club_rating: clubRating, note, set_at: new Date().toISOString() };
  const keep = overrides.get().filter((o) => o.playerId !== playerId);
  overrides.set([...keep, overrideFromRow(row)]);

  if (!isSupabaseConfigured) return { ok: true, local: true };
  const { error } = await supabase
    .from('player_rating_overrides')
    .upsert(row, { onConflict: 'player_id' });
  if (error) {
    reportSyncError('the rating override', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function clearRatingOverride(playerId) {
  overrides.set(overrides.get().filter((o) => o.playerId !== playerId));
  if (!isSupabaseConfigured) return { ok: true, local: true };
  const { error } = await supabase.from('player_rating_overrides').delete().eq('player_id', playerId);
  if (error) {
    reportSyncError('the rating override', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function syncRatingsFromCloud() {
  if (!isSupabaseConfigured) return;
  const [a, b] = await Promise.all([
    supabase.from('player_platform_ratings').select('*'),
    supabase.from('player_rating_overrides').select('*'),
  ]);
  if (a.error) reportSyncError('the platform ratings', a.error.message);
  else ratings.set((a.data || []).map(fromRow));
  if (b.error) reportSyncError('the rating overrides', b.error.message);
  else overrides.set((b.data || []).map(overrideFromRow));
}

/** Every stored rating for one player, newest platform read first. */
export function usePlatformRatingsFor(playerId) {
  const all = usePlatformRatings();
  return useMemo(() => all.filter((r) => r.playerId === playerId), [all, playerId]);
}

export function useRatingOverrideFor(playerId) {
  const all = useRatingOverrides();
  return useMemo(() => all.find((o) => o.playerId === playerId) ?? null, [all, playerId]);
}

if (isSupabaseConfigured) {
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) syncRatingsFromCloud();
  });
  supabase.auth.getSession().then(({ data }) => {
    if (data.session) syncRatingsFromCloud();
  });
}
