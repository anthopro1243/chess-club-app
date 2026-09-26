/*
 * announcementsStore.js — the coach's announcement board.
 *
 * Same five-part shape as gamesStore: a local store, row translation, a
 * cloud pull on sign-in, a push after every write, and hooks. Coaches write;
 * RLS lets any approved member read (0023). Archiving replaces deleting, so
 * what went out stays on record.
 */

import { createStore, useStore } from './store.js';
import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { reportSyncError } from './syncStatus.js';

const store = createStore('cc-announcements-v1', []);
let cloudReady = false;
let channel = null;

export const useAnnouncements = () => useStore(store);

const fromRow = (row) => ({
  id: row.id,
  title: row.title,
  body: row.body || '',
  pinned: !!row.pinned,
  createdAt: row.created_at,
  archivedAt: row.archived_at || null,
});

async function syncFromCloud() {
  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) {
    // Before 0023 is applied the table doesn't exist; say nothing rather
    // than put a scary banner on the home page.
    cloudReady = false;
    return;
  }
  cloudReady = true;
  store.set((data || []).map(fromRow));
}

function subscribeRealtime() {
  if (channel) return;
  channel = supabase
    .channel('announcements-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, syncFromCloud)
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

const cloudActive = () => isSupabaseConfigured && cloudReady;

/** Post an announcement. Returns { ok, error }. */
export async function postAnnouncement({ title, body = '', pinned = false }) {
  const local = {
    id: `local-${Date.now()}`,
    title: title.trim(),
    body: body.trim(),
    pinned,
    createdAt: new Date().toISOString(),
    archivedAt: null,
  };
  if (!cloudActive()) {
    store.set((rows) => [local, ...rows]);
    return { ok: true, local: true };
  }
  const { data: { session } } = await supabase.auth.getSession();
  const { data, error } = await supabase
    .from('announcements')
    .insert({ title: local.title, body: local.body, pinned, created_by: session?.user?.id ?? null })
    .select('*')
    .single();
  if (error) {
    reportSyncError('that announcement', error.message);
    return { ok: false, error: error.message };
  }
  store.set((rows) => [fromRow(data), ...rows.filter((r) => r.id !== data.id)]);
  return { ok: true };
}

async function patch(id, fields, local) {
  store.set((rows) => rows.map((r) => (r.id === id ? { ...r, ...local } : r)));
  if (!cloudActive() || String(id).startsWith('local-')) return { ok: true, local: true };
  const { error } = await supabase.from('announcements').update(fields).eq('id', id);
  if (error) {
    reportSyncError('that announcement', error.message);
    syncFromCloud();
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export const setPinned = (id, pinned) => patch(id, { pinned }, { pinned });

export function archiveAnnouncement(id) {
  const at = new Date().toISOString();
  return patch(id, { archived_at: at }, { archivedAt: at });
}
