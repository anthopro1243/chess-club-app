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

const store = createStore('cc-games-v1', []);

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
    console.error('Game archive fetch from Supabase failed:', error.message);
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
        if (error) console.error('Game save to Supabase failed:', error.message);
      });
  }
  return record;
}

export function removeGame(id) {
  store.set((games) => games.filter((g) => g.id !== id));
  if (isSupabaseConfigured && cloudReady) {
    supabase
      .from('games')
      .delete()
      .eq('id', id)
      .then(({ error }) => {
        if (error) console.error('Game delete from Supabase failed:', error.message);
      });
  }
}
