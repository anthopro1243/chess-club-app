/*
 * playerPrivateStore.js — the two intake fields a member's classmates must not see.
 *
 * The signup form collects a DISD student ID and a school email. Both are
 * needed to match a response against the roster, and neither belongs on the
 * `players` row, which every approved member can select. They live in
 * `player_private`, which only coaches can reach (migration 0018).
 *
 * Same shape as coachNotesStore.js, for the same reason: a player account is
 * *supposed* to be refused by the policy here, so a failed read is the system
 * working and is not reported as a sync error.
 *
 * With no backend configured there is nobody to hide them from, so they stay
 * in this browser like everything else.
 */

import { createStore, useStore } from './store.js';
import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { reportSyncError } from './syncStatus.js';

// { [playerId]: { studentId, schoolEmail } }
const store = createStore('cc-player-private-v1', {});

let cloudReady = false;
let channel = null;

export function usePlayerPrivate() {
  return useStore(store);
}

/** The roster-matching shape the import planner expects. */
export function getPrivateRows() {
  return Object.entries(store.get()).map(([playerId, row]) => ({
    playerId,
    studentId: row?.studentId || '',
    schoolEmail: row?.schoolEmail || '',
  }));
}

async function syncFromCloud() {
  const { data, error } = await supabase
    .from('player_private')
    .select('player_id, student_id, school_email');
  if (error) {
    // A player account hitting the coach-only policy. Expected; stay quiet.
    cloudReady = false;
    return;
  }
  cloudReady = true;
  store.set(
    Object.fromEntries(
      data.map((row) => [row.player_id, { studentId: row.student_id || '', schoolEmail: row.school_email || '' }]),
    ),
  );
}

function subscribeRealtime() {
  if (channel) return;
  channel = supabase
    .channel('player-private-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'player_private' }, syncFromCloud)
    .subscribe();
}

if (isSupabaseConfigured) {
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) {
      syncFromCloud();
      subscribeRealtime();
    } else {
      cloudReady = false;
      store.set({});
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
 * Write the private fields for one or more players.
 *
 * Takes [{ playerId, studentId, schoolEmail }]. Upserts on player_id, so
 * re-importing the same response updates rather than duplicating. Throws on
 * failure: the import needs to know, because a player row written without its
 * student ID would be invisible to the next import's dedupe.
 */
export async function savePrivateRows(rows) {
  const usable = rows.filter((row) => row?.playerId && (row.studentId || row.schoolEmail));
  if (!usable.length) return;

  store.set((current) => {
    const next = { ...current };
    for (const row of usable) {
      next[row.playerId] = {
        studentId: row.studentId || '',
        schoolEmail: row.schoolEmail || '',
      };
    }
    return next;
  });

  if (!isSupabaseConfigured || !cloudReady) return;

  const { error } = await supabase.from('player_private').upsert(
    usable.map((row) => ({
      player_id: row.playerId,
      student_id: row.studentId || null,
      school_email: row.schoolEmail || null,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: 'player_id' },
  );
  if (error) {
    reportSyncError('the private roster fields', error.message);
    throw new Error(error.message);
  }
}
