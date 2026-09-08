/*
 * coachNotesStore.js — notes about a player that the player cannot read.
 *
 * These used to live in `players.coach_notes`, which every signed-in account
 * could read, because the old policies allowed any authenticated user to
 * select every column. Migration 0005 moves them to a table only coaches can
 * reach and blanks the old column. A note like "loses focus when losing,
 * needs handling" has to be structurally unreachable, not merely off-screen.
 *
 * With no backend there is no one to hide them from, so they stay in this
 * browser, seeded once from whatever the player row already held.
 */

import { createStore, useStore } from './store.js';
import { supabase, isSupabaseConfigured } from './supabaseClient.js';

const store = createStore('cc-coach-notes-v1', {});

let cloudReady = false;
let channel = null;

/** All notes as `{ [playerId]: note }`. */
export function useCoachNotes() {
  return useStore(store);
}

export function getCoachNote(playerId) {
  return store.get()[playerId] || '';
}

async function syncFromCloud() {
  const { data, error } = await supabase.from('coach_notes').select('player_id, note');
  if (error) {
    // A player account is *supposed* to be refused here. That is the policy
    // working, not a fault worth shouting about.
    cloudReady = false;
    return;
  }
  cloudReady = true;
  store.set(Object.fromEntries(data.map((row) => [row.player_id, row.note || ''])));
}

function subscribeRealtime() {
  if (channel) return;
  channel = supabase
    .channel('coach-notes-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'coach_notes' }, syncFromCloud)
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

export function setCoachNote(playerId, note) {
  store.set((notes) => ({ ...notes, [playerId]: note }));

  if (isSupabaseConfigured && cloudReady) {
    supabase
      .from('coach_notes')
      .upsert({ player_id: playerId, note, updated_at: new Date().toISOString() }, { onConflict: 'player_id' })
      .then(({ error }) => {
        if (error) console.error('Coach note save failed:', error.message);
      });
  }
}

/**
 * Carry across notes that predate the split, once, so nothing disappears
 * from the coach's view on the day the migration runs. Cloud rows always
 * win: the migration already copied them, so anything still on a player row
 * locally is either the same text or older.
 */
export function seedCoachNotesFromPlayers(players) {
  const existing = store.get();
  const seeded = { ...existing };
  let changed = false;

  for (const player of players) {
    const legacy = (player.coachNotes || '').trim();
    if (legacy && !seeded[player.playerId]) {
      seeded[player.playerId] = legacy;
      changed = true;
    }
  }

  if (changed) store.set(seeded);
}
