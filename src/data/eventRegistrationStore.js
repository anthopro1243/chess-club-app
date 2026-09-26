/*
 * eventRegistrationStore.js — who the coach has put on the district form.
 *
 * Same five-part shape as gamesStore: a local store, row translation, a cloud
 * pull on sign-in, a push after every write, and hooks for the pages. The
 * rules (10 per coach, sections, the stipend floor) live in the pure
 * registrationRules.js, which the page consults BEFORE every add.
 *
 * One row per (event, player): which coach they are under (1 or 2), and the
 * coach's manual "mini-repertoire reviewed" tick for the readiness checklist.
 * RLS (0021): only a coach writes; a member can read their own row, so they
 * can see their own readiness.
 */

import { createStore, useStore } from './store.js';
import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { reportSyncError } from './syncStatus.js';

const store = createStore('cc-event-registrations-v1', []);

export function useEventRegistrations() {
  return useStore(store);
}

export function getEventRegistrations() {
  return store.get();
}

let cloudReady = false;
let channel = null;

function fromRow(row) {
  return {
    eventId: row.event_id,
    playerId: row.player_id,
    coachSlot: row.coach_slot,
    repertoireReviewed: !!row.repertoire_reviewed,
    updatedAt: row.updated_at,
  };
}

function toRow(entry) {
  return {
    event_id: entry.eventId,
    player_id: entry.playerId,
    coach_slot: entry.coachSlot,
    repertoire_reviewed: !!entry.repertoireReviewed,
    updated_at: entry.updatedAt,
  };
}

async function syncFromCloud() {
  const { data, error } = await supabase.from('event_registrations').select('*');
  if (error) {
    reportSyncError('the registration list', error.message);
    return;
  }
  cloudReady = true;
  store.set(data.map(fromRow));
}

function subscribeRealtime() {
  if (channel) return;
  channel = supabase
    .channel('event-registrations-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'event_registrations' }, () => {
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

const sameKey = (r, eventId, playerId) => r.eventId === eventId && r.playerId === playerId;

function push(record) {
  if (!isSupabaseConfigured || !cloudReady) return;
  supabase
    .from('event_registrations')
    .upsert(toRow(record), { onConflict: 'event_id,player_id' })
    .then(({ error }) => {
      if (error) reportSyncError('the registration list', error.message);
    });
}

/**
 * Put a player on the list under a coach, or move them to the other coach.
 * Callers check `canAddToSlot` first; this does not re-check, so the rule
 * has one home.
 */
export function upsertRegistration(eventId, playerId, patch) {
  const prior = store.get().find((r) => sameKey(r, eventId, playerId));
  const record = {
    eventId,
    playerId,
    coachSlot: prior?.coachSlot ?? 1,
    repertoireReviewed: prior?.repertoireReviewed ?? false,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  store.set((rows) => [...rows.filter((r) => !sameKey(r, eventId, playerId)), record]);
  push(record);
  return record;
}

export function removeRegistration(eventId, playerId) {
  store.set((rows) => rows.filter((r) => !sameKey(r, eventId, playerId)));
  if (isSupabaseConfigured && cloudReady) {
    supabase
      .from('event_registrations')
      .delete()
      .eq('event_id', eventId)
      .eq('player_id', playerId)
      .then(({ error }) => {
        if (error) reportSyncError('removing that registration', error.message);
      });
  }
}
