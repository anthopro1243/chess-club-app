/*
 * gamesStore.js — the club's game archive.
 *
 * Every finished game on the Play page lands here: who played, the result,
 * the full PGN, and whether it was a club game or one against Stockfish.
 * Same pattern as rosterStore — local by default, backed by the shared
 * `games` table once Supabase is configured and someone is signed in.
 *
 * Games are their own table rather than rows hanging off a player because
 * a game belongs to two players at once, and the coach wants to browse them
 * by date, not by person.
 */

import { createStore, useStore } from './store.js';
import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { reportSyncError } from './syncStatus.js';

const store = createStore('cc-games-v1', []);

/** Where a game came from. 'human' and 'computer' are played in the app; the other two are imported. */
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
  };
}

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
  };
}

async function syncFromCloud() {
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .order('played_at', { ascending: false })
    .limit(500);
  if (error) {
    reportSyncError('the game archive', error.message);
    return;
  }
  cloudReady = true;
  store.set(data.map(fromRow));
}

function subscribeRealtime() {
  if (channel) return;
  channel = supabase
    .channel('games-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, () => {
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
    supabase
      .from('games')
      .upsert(added.map(toRow))
      .then(({ error }) => {
        if (error) reportSyncError('the imported games', error.message);
      });
  }
  return added;
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
      });
  }
}
