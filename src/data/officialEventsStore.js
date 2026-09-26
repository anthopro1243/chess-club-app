/*
 * officialEventsStore.js — district tournaments the club is preparing for.
 *
 * Same five-part shape as gamesStore: a local store, row translation, a cloud
 * pull on sign-in, a push after every write, and hooks for the pages. The
 * rules about what the dates MEAN (default deadlines, reminders) live in the
 * pure officialEvents.js; this module only keeps rows.
 *
 * Local mode starts from SEED_EVENTS so the Oct 24 event and its deadlines
 * show before anyone has typed a thing. With a backend, migration 0021 seeds
 * the same row, and the table is the truth.
 *
 * Every approved member may read events (RLS: is_approved); only a coach may
 * write them (RLS: is_coach). The page hides the edit form from members, but
 * that is a courtesy — the policy is what holds.
 */

import { createStore, useStore } from './store.js';
import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { reportSyncError } from './syncStatus.js';
import { SEED_EVENTS, cleanEvent } from './officialEvents.js';

const store = createStore('cc-official-events-v1', SEED_EVENTS);

export function useOfficialEvents() {
  return useStore(store);
}

export function getOfficialEvents() {
  return store.get();
}

let cloudReady = false;
let channel = null;

function fromRow(row) {
  return {
    id: row.id,
    name: row.name || '',
    date: row.event_date,
    venue: row.venue || '',
    registrationCloses: row.registration_closes || null,
    transportDue: row.transport_due || null,
    coach1Name: row.coach1_name || '',
    coach2Name: row.coach2_name || '',
    notes: row.notes || '',
  };
}

function toRow(event) {
  return {
    id: event.id,
    name: event.name,
    event_date: event.date,
    venue: event.venue || null,
    registration_closes: event.registrationCloses || null,
    transport_due: event.transportDue || null,
    coach1_name: event.coach1Name || null,
    coach2_name: event.coach2Name || null,
    notes: event.notes || null,
    updated_at: new Date().toISOString(),
  };
}

async function syncFromCloud() {
  const { data, error } = await supabase.from('official_events').select('*').order('event_date');
  if (error) {
    // Most likely 0021 has not been applied yet. Keep the local copy (the
    // seed at least) rather than blanking the page.
    reportSyncError('the tournament calendar', error.message);
    return;
  }
  cloudReady = true;
  store.set(data.map(fromRow));
}

function subscribeRealtime() {
  if (channel) return;
  channel = supabase
    .channel('official-events-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'official_events' }, () => {
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

/**
 * Create or update an event (coach only). The draft should already have
 * passed validateEvent. Returns the stored record.
 */
export function saveOfficialEvent(draft) {
  const record = cleanEvent({
    ...draft,
    id: draft.id || `EV-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  });

  store.set((events) => {
    const rest = events.filter((e) => e.id !== record.id);
    return [...rest, record].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  });

  if (isSupabaseConfigured && cloudReady) {
    supabase
      .from('official_events')
      .upsert(toRow(record), { onConflict: 'id' })
      .then(({ error }) => {
        if (error) reportSyncError('that event', error.message);
      });
  }
  return record;
}
