/*
 * gamesStore.js — the club's game archive.
 *
 * Every game lands here: who played, the result, the full PGN, and whether
 * it was a club game, an imported one, or (older ones) one against Stockfish.
 * Same pattern as rosterStore — local by default, backed by the shared
 * `games` table once Supabase is configured and someone is signed in.
 *
 * Games are their own table rather than rows hanging off a player because
 * a game belongs to two players at once, and the coach wants to browse them
 * by date, not by person.
 */

import { createStore, useStore } from '../../services/store.js';
import { supabase, isSupabaseConfigured } from '../../services/supabaseClient.js';
import { reportSyncError, reportLoadError, reportSyncOk } from '../../services/syncStatus.js';
import { coalesce } from '../../services/coalesce.js';

const store = createStore('cc-games-v1', []);

/**
 * Where a game came from. 'human' (logged by hand or from a scoresheet) and 'computer' (played
 * on the old Play page, since removed) are club-recorded; the other two are imported.
 */
export const GAME_MODE_LABEL = {
  human: 'Club',
  computer: 'vs Computer',
  chesscom: 'Chess.com',
  lichess: 'Lichess',
};

export function useGames() {
  return useStore(store);
}

export function getGames() {
  return store.get();
}

let cloudReady = false;
let channel = null;

function fromRow(row) {
  return {
    id: row.id,
    playedAt: row.played_at,
    whitePlayerId: row.white_player_id || '',
    blackPlayerId: row.black_player_id || '',
    whiteName: row.white_name || 'White',
    blackName: row.black_name || 'Black',
    result: row.result,
    reason: row.reason || '',
    moveCount: row.move_count || 0,
    mode: row.mode || 'human',
    computerElo: row.computer_elo ?? null,
    pgn: row.pgn || '',
    analysisStatus: row.analysis_status || 'pending',
    analysisAttempts: row.analysis_attempts ?? 0,
    analysisError: row.analysis_error || null,
    analysisDepth: row.analysis_depth ?? null,
    // Over-the-board tags (0022). Absent before that migration, and for
    // every online or casual game, so they default to empty.
    event: row.event || '',
    round: row.round || '',
    board: row.board ?? null,
    timeControl: row.time_control || '',
    // Set once the game has been gone over (0024); the review queue skips it.
    reviewedAt: row.reviewed_at || null,
  };
}

const OTB_COLUMNS = ['event', 'round', 'board', 'time_control'];

function toRow(game) {
  return {
    id: game.id,
    played_at: game.playedAt,
    white_player_id: game.whitePlayerId || null,
    black_player_id: game.blackPlayerId || null,
    white_name: game.whiteName,
    black_name: game.blackName,
    result: game.result,
    reason: game.reason,
    move_count: game.moveCount,
    mode: game.mode,
    computer_elo: game.computerElo,
    pgn: game.pgn,
    // Sent only when set (a bullet game is filed as skipped from the start),
    // so every other path writes exactly the columns it always did.
    ...(game.analysisStatus ? { analysis_status: game.analysisStatus } : {}),
    ...(game.analysisError ? { analysis_error: game.analysisError } : {}),
    // Sent only when set, so sync, the log form and PGN import write exactly
    // the columns they always did, whether or not 0022 has been applied.
    ...(game.event ? { event: game.event } : {}),
    ...(game.round ? { round: game.round } : {}),
    ...(game.board != null && game.board !== '' ? { board: game.board } : {}),
    ...(game.timeControl ? { time_control: game.timeControl } : {}),
  };
}

/*
 * Before 0022 is applied, PostgREST refuses a row naming a column it does
 * not know ("Could not find the 'board' column of 'games' in the schema
 * cache"). The same tags are inside the PGN, so the game is worth saving
 * without them rather than not at all.
 */
function missingOtbColumn(error) {
  const message = String(error?.message || '');
  return /schema cache|does not exist/i.test(message) && OTB_COLUMNS.some((c) => message.includes(c));
}

const withoutOtb = (row) => {
  const copy = { ...row };
  for (const column of OTB_COLUMNS) delete copy[column];
  return copy;
};

async function syncFromCloud() {
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .order('played_at', { ascending: false })
    .limit(500);
  if (error) {
    reportLoadError('the game archive', error.message);
    return;
  }
  reportSyncOk('the game archive');
  cloudReady = true;
  store.set(data.map(fromRow));
}

// Row updates arrive in bursts (the analysis queue touches a game several
// times); one refetch per burst, not per event.
const refetchFromCloud = coalesce(syncFromCloud);

function subscribeRealtime() {
  if (channel) return;
  channel = supabase
    .channel('games-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, refetchFromCloud)
    .subscribe();
}

if (isSupabaseConfigured) {
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) {
      syncFromCloud();
      subscribeRealtime();
    } else {
      cloudReady = false;
      refetchFromCloud.cancel();
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

/** Save a finished game. Returns the stored record. */
export function recordGame(game) {
  const record = {
    id: `G-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    playedAt: new Date().toISOString(),
    ...game,
  };
  store.set((games) => [record, ...games].slice(0, 500));

  if (isSupabaseConfigured && cloudReady) {
    supabase
      .from('games')
      .insert(toRow(record))
      .then(({ error }) => {
        if (error) reportSyncError('that game', error.message);
        else reportSyncOk('that game');
      });
  }
  return record;
}

/*
 * Archive games imported from Chess.com or Lichess.
 *
 * These carry the platform's own game id, so re-importing is a no-op and
 * two club members who played each other online produce one archive row,
 * not two — even though each of them rates the game from their own side.
 */
export function recordExternalGames(games) {
  if (!games.length) return [];

  let added = [];
  store.set((existing) => {
    const known = new Set(existing.map((g) => g.id));
    added = games.filter((g) => !known.has(g.id));
    if (!added.length) return existing;
    return [...added, ...existing]
      .sort((a, b) => String(b.playedAt).localeCompare(String(a.playedAt)))
      .slice(0, 500);
  });

  if (added.length && isSupabaseConfigured && cloudReady) {
    // ignoreDuplicates: a game already in the table is left exactly as it is,
    // including its analysis, so re-importing an old game can never undo a
    // finished analysis or a skip.
    supabase
      .from('games')
      .upsert(added.map(toRow), { onConflict: 'id', ignoreDuplicates: true })
      .then(({ error }) => {
        if (error) reportSyncError('the imported games', error.message);
        else reportSyncOk('the imported games');
      });
  }
  return added;
}

/**
 * What the archive already holds from one linked account: how many games and
 * the date of the oldest. Asked of the database rather than the local list,
 * because the local list keeps only the club's newest 500 games and would
 * undercount a member whose history is deeper than that.
 */
export async function importedHistoryOf(playerId, platform) {
  const mine = (g) =>
    g.mode === platform && (g.whitePlayerId === playerId || g.blackPlayerId === playerId);

  if (!isSupabaseConfigured || !cloudReady) {
    const local = store.get().filter(mine);
    const oldest = local.reduce((min, g) => (!min || String(g.playedAt) < min ? String(g.playedAt) : min), null);
    return { count: local.length, oldestAt: oldest };
  }

  const owned = `white_player_id.eq.${playerId},black_player_id.eq.${playerId}`;
  const [countResult, oldestResult] = await Promise.all([
    supabase
      .from('games')
      .select('id', { count: 'exact', head: true })
      .eq('mode', platform)
      .is('deleted_at', null)
      .or(owned),
    supabase
      .from('games')
      .select('played_at')
      .eq('mode', platform)
      .is('deleted_at', null)
      .or(owned)
      .order('played_at', { ascending: true })
      .limit(1),
  ]);
  const error = countResult.error || oldestResult.error;
  if (error) throw new Error(error.message);
  return { count: countResult.count ?? 0, oldestAt: oldestResult.data?.[0]?.played_at ?? null };
}

/** Which of these game ids are already in the archive. */
export async function knownGameIds(ids) {
  const wanted = [...new Set(ids)];
  if (!wanted.length) return new Set();
  const known = new Set(store.get().filter((g) => wanted.includes(g.id)).map((g) => g.id));
  if (!isSupabaseConfigured || !cloudReady) return known;

  // In slices, so the request line stays short enough for any proxy.
  for (let i = 0; i < wanted.length; i += 50) {
    const { data, error } = await supabase.from('games').select('id').in('id', wanted.slice(i, i + 50));
    if (error) throw new Error(error.message);
    for (const row of data || []) known.add(row.id);
  }
  return known;
}

/*
 * Archive games imported from a PGN file (Games page → Import PGN).
 *
 * Unlike recordExternalGames this waits for the database, because the caller
 * queues each game for analysis next — queueing a row that has not landed yet
 * updates nothing. `ignoreDuplicates` means a game already in the table is
 * left exactly as it is: an import never overwrites the archive.
 */
export async function recordImportedGames(games) {
  if (!games.length) return { ok: true, added: [] };

  let added = [];
  store.set((existing) => {
    const known = new Set(existing.map((g) => g.id));
    added = games.filter((g) => !known.has(g.id));
    if (!added.length) return existing;
    return [...added, ...existing]
      .sort((a, b) => String(b.playedAt).localeCompare(String(a.playedAt)))
      .slice(0, 500);
  });

  if (!added.length || !isSupabaseConfigured || !cloudReady) return { ok: true, added, local: true };

  const rows = added.map(toRow);
  let { error } = await supabase.from('games').upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
  if (error && missingOtbColumn(error)) {
    ({ error } = await supabase
      .from('games')
      .upsert(rows.map(withoutOtb), { onConflict: 'id', ignoreDuplicates: true }));
  }
  if (error) {
    // Take them back out of the local view: showing games that were never
    // saved is how people lose a Tuesday's worth of scoresheets.
    const failed = new Set(added.map((g) => g.id));
    store.set((existing) => existing.filter((g) => !failed.has(g.id)));
    reportSyncError('the imported games', error.message);
    return { ok: false, added: [], error: error.message };
  }
  reportSyncOk('the imported games');
  return { ok: true, added };
}

/**
 * Mark a game reviewed (or, with `reviewed = false`, put it back in the
 * review queue). Only these two columns are written, so a reviewed game's
 * PGN and analysis are never touched. RLS (0005): a player may mark their
 * own games, a coach any game.
 */
export function setGameReviewed(id, reviewed = true) {
  const reviewedAt = reviewed ? new Date().toISOString() : null;
  store.set((games) => games.map((g) => (g.id === id ? { ...g, reviewedAt } : g)));
  if (isSupabaseConfigured && cloudReady) {
    supabase.auth.getUser().then(({ data }) =>
      supabase
        .from('games')
        .update({ reviewed_at: reviewedAt, reviewed_by: reviewed ? data?.user?.id ?? null : null })
        .eq('id', id)
        .then(({ error }) => {
          if (error) reportSyncError('marking that game reviewed', error.message);
          else reportSyncOk('marking that game reviewed');
        }),
    );
  }
}

/**
 * Replace names on archived games (graduateArchive.js): each update is
 * { id, whiteName?, blackName?, pgn }. Only those columns are written.
 * Resolves to the number of games the database refused.
 */
export async function renameInGames(updates = []) {
  const byId = new Map(updates.map((u) => [u.id, u]));
  store.set((games) => games.map((g) => (byId.has(g.id) ? { ...g, ...byId.get(g.id) } : g)));
  if (!isSupabaseConfigured || !cloudReady) return 0;
  let failed = 0;
  for (const u of updates) {
    const patch = { pgn: u.pgn };
    if (u.whiteName) patch.white_name = u.whiteName;
    if (u.blackName) patch.black_name = u.blackName;
    const { error } = await supabase.from('games').update(patch).eq('id', u.id);
    if (error) failed += 1;
  }
  if (failed) reportSyncError('renaming archived games', `${failed} game(s) were not updated`);
  else reportSyncOk('renaming archived games');
  return failed;
}

export function removeGame(id) {
  store.set((games) => games.filter((g) => g.id !== id));
  if (isSupabaseConfigured && cloudReady) {
    supabase
      .from('games')
      .delete()
      .eq('id', id)
      .then(({ error }) => {
        if (error) reportSyncError('removing that game', error.message);
        else reportSyncOk('removing that game');
      });
  }
}
