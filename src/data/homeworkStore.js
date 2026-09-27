/*
 * homeworkStore.js — homework the coach has set.
 *
 * Same five-part shape as gamesStore: a local store, row translation, a cloud
 * pull on sign-in, a push after every write, and hooks for the pages. With no
 * backend it all lives in this browser, which is the coach's own machine.
 *
 * Only the assignment is stored. Whether anyone has DONE it is computed from
 * puzzle attempts and the game archive (homework.js → progressFor), so there
 * is nothing to push when a trainee solves a puzzle or finishes a game, and
 * nothing that can disagree with those tables.
 *
 * In the database an assignment is two tables (0020): the assignment, and
 * one target row per player for group and chosen-player homework (club-wide
 * homework has none). Here it is one record with `playerIds`, because every
 * caller wants them together. A player's pull only ever returns homework
 * for the whole club or aimed at them, and only their own target row on
 * each; RLS does that, not this file.
 */

import { useMemo } from 'react';
import { createStore, useStore } from './store.js';
import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { reportSyncError } from './syncStatus.js';
import { useAttempts } from './puzzleAttemptsStore.js';
import { useGames } from './gamesStore.js';
import { usePlayers } from './rosterStore.js';
import { homeworkForPlayer } from './homework.js';

const store = createStore('cc-homework-v1', []);

export function useAssignments() {
  return useStore(store);
}

export function getAssignments() {
  return store.get();
}

let cloudReady = false;
// Why the last pull failed, kept so a coach's save can say why it cannot
// reach the server — most likely, before 0020 has been applied, that the
// table does not exist yet.
let cloudError = null;
let channel = null;

/** A client-minted id, like games.id: the app must work before any database does. */
export function newHomeworkId() {
  return `HW-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function fromRow(row) {
  return {
    id: row.id,
    kind: row.kind,
    theme: row.theme ?? null,
    difficulty: row.difficulty ?? null,
    requiredCount: row.required_count ?? null,
    puzzleIds: row.puzzle_ids || [],
    minMinutes: row.min_minutes ?? null,
    audience: row.audience || 'players',
    groupKey: row.group_key ?? null,
    groupLabel: row.group_label ?? null,
    playerIds: (row.homework_targets || []).map((t) => t.player_id),
    note: row.note || '',
    dueAt: row.due_at,
    createdAt: row.created_at,
  };
}

function toRow(assignment) {
  return {
    id: assignment.id,
    kind: assignment.kind,
    theme: assignment.theme,
    difficulty: assignment.difficulty,
    required_count: assignment.requiredCount,
    puzzle_ids: assignment.puzzleIds || [],
    min_minutes: assignment.minMinutes,
    audience: assignment.audience,
    group_key: assignment.groupKey,
    group_label: assignment.groupLabel,
    note: assignment.note || null,
    due_at: assignment.dueAt,
    // Sent, not defaulted: attempts are stamped by the same browser clock, so
    // the "only attempts after it was set" window must be too.
    created_at: assignment.createdAt,
  };
}

// Club-wide homework is read through is_approved() and has no target rows.
const targetRows = (assignment) =>
  assignment.audience === 'club'
    ? []
    : (assignment.playerIds || []).map((playerId) => ({ assignment_id: assignment.id, player_id: playerId }));

async function syncFromCloud() {
  const { data, error } = await supabase
    .from('homework_assignments')
    .select('*, homework_targets(player_id)')
    .order('due_at', { ascending: false })
    .limit(500);
  if (error) {
    // Not shouted on every sign-in: until 0020 is applied this fails for
    // every member, and a banner nobody can act on teaches people to ignore
    // banners. A coach who tries to SET homework is told (see below).
    cloudReady = false;
    cloudError = error.message;
    return;
  }
  cloudReady = true;
  cloudError = null;
  store.set(data.map(fromRow));
}

function subscribeRealtime() {
  if (channel) return;
  channel = supabase
    .channel('homework-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'homework_assignments' }, () => {
      syncFromCloud();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'homework_targets' }, () => {
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

const dropLocal = (id) => store.set((list) => list.filter((a) => a.id !== id));

/**
 * Save an assignment built by homework.js → buildAssignment.
 *
 * Waits for the database, unlike recordGame, because homework that exists
 * only on the coach's screen is homework nobody receives. On any failure the
 * local copy is taken back out and `{ ok: false, error }` comes back, so the
 * form can stay filled in for another try.
 */
export async function saveAssignment(assignment) {
  store.set((list) => [assignment, ...list.filter((a) => a.id !== assignment.id)]);
  if (!isSupabaseConfigured) return { ok: true, local: true };

  // Reported to the form, not the sync banner: the banner says the change
  // "only exists in this browser", and after the rollback it exists nowhere.
  const fail = (message) => {
    dropLocal(assignment.id);
    console.error('Sync failed (that homework):', message);
    return { ok: false, error: message };
  };

  if (!cloudReady) return fail(cloudError || 'The homework list has not loaded from the server yet.');

  const { error } = await supabase.from('homework_assignments').insert(toRow(assignment));
  if (error) return fail(error.message);

  const targets = targetRows(assignment);
  if (targets.length) {
    const { error: targetError } = await supabase.from('homework_targets').insert(targets);
    if (targetError) {
      // A group or chosen-player assignment with no targets is invisible to
      // every player; remove it rather than leave the coach believing it was
      // set. Cascades nothing else — no target row landed.
      await supabase.from('homework_assignments').delete().eq('id', assignment.id);
      return fail(targetError.message);
    }
  }
  return { ok: true };
}

/** Remove an assignment. Attempts and games are untouched: they were practice either way. */
export function removeAssignment(id) {
  dropLocal(id);
  if (isSupabaseConfigured && cloudReady) {
    supabase
      .from('homework_assignments')
      .delete()
      .eq('id', id)
      .then(({ error }) => {
        if (error) {
          reportSyncError('removing that homework', error.message);
          syncFromCloud();
        }
      });
  }
}

// -- hooks for pages --------------------------------------------------------

/**
 * One trainee's homework with progress, unfinished first — the list the
 * Training page shows, and the one the player dashboard shows under
 * "homework due". Each item is `{ assignment, progress }` (homework.js →
 * homeworkForPlayer); `assignmentTitle` and `drillLinkFor` turn one into a
 * title and an in-app `#/…` link.
 *
 * Progress is recomputed whenever the attempts, games, roster or assignments
 * change, which includes every puzzle the trainee finishes. "Overdue" is
 * judged at that moment; a page left open across a deadline catches up on
 * its next change.
 */
export function useHomeworkFor(playerId) {
  const assignments = useAssignments();
  const attempts = useAttempts();
  const games = useGames();
  const players = usePlayers();
  const joined = players.find((p) => p.playerId === playerId)?.joined || '';
  return useMemo(
    () => homeworkForPlayer(assignments, attempts, playerId, { now: Date.now(), games, joined }),
    [assignments, attempts, games, playerId, joined],
  );
}
