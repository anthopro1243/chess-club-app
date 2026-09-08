/*
 * rosterStore.js — the roster, made real, and now optionally shared.
 *
 * roster.js still holds the sample players and the rubric math; this module
 * seeds a persistent local store from that sample the first time the app
 * runs in a browser, then owns all reads and writes from there on. Every
 * exported function keeps the same signature whether or not a backend is
 * connected — add a player, edit their rubric, log a solved puzzle — so no
 * page needs to know or care which mode it's running in.
 *
 * With no Supabase project configured (see supabaseClient.js), everything
 * stays in this browser, same as before. Once one is configured and a
 * signed-in session exists, this module fetches the shared table, mirrors
 * every local write to it, and subscribes to Realtime so every open tab —
 * on any device — sees changes as they land.
 */

import { useEffect, useState } from 'react';
import { createStore, useStore } from './store.js';
import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { PLAYERS as SAMPLE_PLAYERS } from './roster.js';

const store = createStore('cc-roster-v1', SAMPLE_PLAYERS);

export function usePlayers() {
  return useStore(store);
}

export function getPlayers() {
  return store.get();
}

// -- cloud sync --------------------------------------------------------

let cloudReady = false;
let channel = null;

function fromRow(row) {
  return {
    playerId: row.player_id,
    name: row.name,
    grade: row.grade || '',
    joined: row.joined || '',
    boardRole: row.board_role || '',
    commitment: row.commitment || 'Casual',
    ratings: row.ratings || {},
    preferredOpenings: row.preferred_openings || [],
    style: row.style || '',
    rubric: row.rubric || {},
    goal: row.goal || '',
    trainingFocus: row.training_focus || '',
    coachNotes: row.coach_notes || '',
    puzzleStats: row.puzzle_stats || { solvedIds: [], attempts: 0, lastPlayed: null },
  };
}

function toRow(player) {
  return {
    player_id: player.playerId,
    name: player.name,
    grade: player.grade,
    joined: player.joined || null,
    board_role: player.boardRole,
    commitment: player.commitment,
    ratings: player.ratings,
    preferred_openings: player.preferredOpenings,
    style: player.style,
    rubric: player.rubric,
    goal: player.goal,
    training_focus: player.trainingFocus,
    coach_notes: player.coachNotes,
    puzzle_stats: player.puzzleStats,
  };
}

async function syncFromCloud() {
  const { data, error } = await supabase.from('players').select('*').order('player_id');
  if (error) {
    console.error('Roster fetch from Supabase failed:', error.message);
    return;
  }
  cloudReady = true;
  store.set(data.map(fromRow));
}

function subscribeRealtime() {
  if (channel) return;
  channel = supabase
    .channel('players-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => {
      syncFromCloud();
    })
    .subscribe();
}

function unsubscribeRealtime() {
  if (!channel) return;
  supabase.removeChannel(channel);
  channel = null;
}

if (isSupabaseConfigured) {
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) {
      syncFromCloud();
      subscribeRealtime();
    } else {
      cloudReady = false;
      unsubscribeRealtime();
    }
  });
  supabase.auth.getSession().then(({ data }) => {
    if (data.session) {
      syncFromCloud();
      subscribeRealtime();
    }
  });
}

function cloudActive() {
  return isSupabaseConfigured && cloudReady;
}

async function pushToCloud(player) {
  if (!cloudActive() || !player) return;
  const { error } = await supabase.from('players').upsert(toRow(player));
  if (error) console.error('Roster sync to Supabase failed:', error.message);
}

async function deleteFromCloud(playerId) {
  if (!cloudActive()) return;
  const { error } = await supabase.from('players').delete().eq('player_id', playerId);
  if (error) console.error('Roster delete from Supabase failed:', error.message);
}

/** Whether the roster is backed by a live, shared connection right now. */
export function useCloudStatus() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, []);

  return { configured: isSupabaseConfigured, signedIn: !!session, email: session?.user?.email };
}

// -- reads and writes ----------------------------------------------------

function nextPlayerId(players) {
  const numbers = players
    .map((p) => Number(String(p.playerId || '').replace(/\D/g, '')))
    .filter((n) => !Number.isNaN(n));
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `CC-${String(next).padStart(3, '0')}`;
}

const emptyRubric = () =>
  Object.fromEntries(['opening', 'tactics', 'positional', 'endgame', 'timeManagement', 'boardVision', 'resilience', 'notation'].map((k) => [k, 5]));

/** Add a player from a partial form object. Returns the new playerId. */
export function addPlayer(partial) {
  let created = null;
  store.set((players) => {
    const playerId = nextPlayerId(players);
    created = {
      playerId,
      name: partial.name?.trim() || 'New player',
      grade: partial.grade?.trim() || '',
      joined: new Date().toISOString().slice(0, 10),
      boardRole: partial.boardRole?.trim() || '',
      commitment: partial.commitment || 'Casual',
      ratings: {
        uscf: partial.uscf ? Number(partial.uscf) : null,
        chesscomRapid: null,
        chesscomBlitz: null,
        lichessPuzzles: null,
      },
      preferredOpenings: [],
      style: partial.style?.trim() || '',
      rubric: emptyRubric(),
      goal: partial.goal?.trim() || '',
      trainingFocus: '',
      coachNotes: '',
      puzzleStats: { solvedIds: [], attempts: 0, lastPlayed: null },
    };
    return [...players, created];
  });
  pushToCloud(created);
  return created.playerId;
}

export function updatePlayer(playerId, patch) {
  let updated = null;
  store.set((players) =>
    players.map((p) => {
      if (p.playerId !== playerId) return p;
      updated = { ...p, ...patch };
      return updated;
    }),
  );
  pushToCloud(updated);
}

export function updateRubric(playerId, rubricPatch) {
  let updated = null;
  store.set((players) =>
    players.map((p) => {
      if (p.playerId !== playerId) return p;
      updated = { ...p, rubric: { ...p.rubric, ...rubricPatch } };
      return updated;
    }),
  );
  pushToCloud(updated);
}

export function removePlayer(playerId) {
  store.set((players) => players.filter((p) => p.playerId !== playerId));
  deleteFromCloud(playerId);
}

/** Called when a trainee solves a puzzle — writes the result onto their row. */
export function recordPuzzleSolved(playerId, puzzleId) {
  let updated = null;
  store.set((players) =>
    players.map((p) => {
      if (p.playerId !== playerId) return p;
      const stats = p.puzzleStats || { solvedIds: [], attempts: 0, lastPlayed: null };
      const solvedIds = stats.solvedIds.includes(puzzleId)
        ? stats.solvedIds
        : [...stats.solvedIds, puzzleId];
      updated = {
        ...p,
        puzzleStats: {
          solvedIds,
          attempts: (stats.attempts || 0) + 1,
          lastPlayed: new Date().toISOString(),
        },
      };
      return updated;
    }),
  );
  pushToCloud(updated);
}

export function resetRoster() {
  store.set(SAMPLE_PLAYERS);
}
