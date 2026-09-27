/*
 * eventAvailabilityStore.js — each member's answer to "can you come?".
 *
 * Same five-part shape as gamesStore: a local store, row translation, a cloud
 * pull on sign-in, a push after every write, and hooks for the pages. The
 * counting lives in the pure availabilityPoll.js.
 *
 * One row per (event, player). RLS (0021): a member reads and writes only
 * their own row; a coach reads and writes everyone's, which is how the coach
 * records answers for a whole room of members on one phone at a Tuesday
 * meeting. Only a coach may delete a row (to undo a mis-tap).
 */

import { createStore, useStore } from './store.js';
import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { reportSyncError } from './syncStatus.js';
import { normaliseAnswer, cleanTransportNote } from './availabilityPoll.js';

const store = createStore('cc-event-availability-v1', []);

export function useEventAvailability() {
  return useStore(store);
}

export function getEventAvailability() {
  return store.get();
}

let cloudReady = false;
let channel = null;

function fromRow(row) {
  return {
    eventId: row.event_id,
    playerId: row.player_id,
    answer: row.answer,
    transportNote: row.transport_note || '',
    answeredAt: row.answered_at,
  };
}

function toRow(entry) {
  return {
    event_id: entry.eventId,
    player_id: entry.playerId,
    answer: entry.answer,
    transport_note: entry.transportNote || null,
    answered_at: entry.answeredAt,
  };
}

async function syncFromCloud() {
  const { data, error } = await supabase.from('event_availability').select('*');
  if (error) {
    reportSyncError('the availability poll', error.message);
    return;
  }
  cloudReady = true;
  store.set(data.map(fromRow));
}

function subscribeRealtime() {
  if (channel) return;
  channel = supabase
    .channel('event-availability-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'event_availability' }, () => {
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

const sameKey = (a, eventId, playerId) => a.eventId === eventId && a.playerId === playerId;

/**
 * Record an answer (and optionally a transport note) for one member.
 * Passing `transportNote: undefined` keeps whatever note was there, so a
 * quick tap on "Yes" never wipes a note typed earlier.
 */
export function setAvailability(eventId, playerId, { answer, transportNote } = {}) {
  const prior = store.get().find((a) => sameKey(a, eventId, playerId));
  const canonical = normaliseAnswer(answer ?? prior?.answer);
  if (!eventId || !playerId || !canonical) return null;

  const record = {
    eventId,
    playerId,
    answer: canonical,
    transportNote: transportNote === undefined ? prior?.transportNote || '' : cleanTransportNote(transportNote),
    answeredAt: new Date().toISOString(),
  };

  store.set((rows) => [...rows.filter((a) => !sameKey(a, eventId, playerId)), record]);

  if (isSupabaseConfigured && cloudReady) {
    supabase
      .from('event_availability')
      .upsert(toRow(record), { onConflict: 'event_id,player_id' })
      .then(({ error }) => {
        if (error) reportSyncError('that availability answer', error.message);
      });
  }
  return record;
}

/** Remove an answer entirely (coach only; RLS refuses anyone else). */
export function clearAvailability(eventId, playerId) {
  store.set((rows) => rows.filter((a) => !sameKey(a, eventId, playerId)));
  if (isSupabaseConfigured && cloudReady) {
    supabase
      .from('event_availability')
      .delete()
      .eq('event_id', eventId)
      .eq('player_id', playerId)
      .then(({ error }) => {
        if (error) reportSyncError('clearing that answer', error.message);
      });
  }
}
