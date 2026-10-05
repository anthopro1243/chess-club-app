/*
 * accountLinkStore.js — the "Who are you?" step and the coach's link tools,
 * talking to the database functions from migration 0025.
 *
 * The decisions (when to ask, what the coach sees) are in accountLinking.js.
 * This module only makes the calls and keeps the signed-in member's link
 * status in memory for the screens.
 *
 * Until 0025 is applied the functions don't exist. That is reported as
 * `available: false`, the step never shows, and the old "Join the roster" in
 * the account menu keeps working, so the app can ship before the migration.
 */

import { useSyncExternalStore } from 'react';
import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { refreshRoster } from './rosterStore.js';
import { refreshPrivate } from './playerPrivateStore.js';

const EMPTY = { status: 'idle', available: false, answered: false, playerId: null, studentId: null, outcome: null };

let state = EMPTY;
const listeners = new Set();
const setState = (next) => {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn());
};
const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** The signed-in account's link status: { status, available, answered, playerId, studentId, outcome }. */
export function useMyAccountLink() {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

// PostgREST says PGRST202 for a function it can't find; Postgres says 42883.
const isMissingFunction = (error) =>
  error?.code === 'PGRST202' || error?.code === '42883' || /could not find the function/i.test(error?.message || '');

export async function loadMyAccountLink() {
  if (!isSupabaseConfigured) return;
  setState({ status: 'loading' });
  const { data, error } = await supabase.rpc('my_account_link');
  if (error) {
    if (!isMissingFunction(error)) console.error('Account link status failed:', error.message);
    // Either way, don't ask: a question that can't be saved is worse than none.
    setState({ ...EMPTY, status: 'ready', available: false });
    return;
  }
  setState({
    status: 'ready',
    available: true,
    answered: !!data?.answered,
    playerId: data?.player_id ?? null,
    studentId: data?.student_id ?? null,
    outcome: data?.outcome ?? null,
  });
}

if (isSupabaseConfigured) {
  supabase.auth.onAuthStateChange((event, session) => {
    if (!session) setState(EMPTY);
    else if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED') loadMyAccountLink();
  });
}

/** Send the "Who are you?" answers. Resolves to { outcome, playerId }; throws a readable message. */
export async function submitWhoAreYou({ firstName, lastName, studentId }) {
  const { data, error } = await supabase.rpc('link_my_account', {
    p_first: firstName,
    p_last: lastName,
    p_student_id: studentId,
  });
  if (error) throw new Error(error.message || 'Couldn’t save that. Try again.');
  await refreshRoster();
  await loadMyAccountLink();
  return { outcome: data?.outcome ?? null, playerId: data?.player_id ?? null };
}

// -- coach --------------------------------------------------------------

/**
 * Everything the Roster page's account panel needs. Returns
 * { available: false } before 0025 is applied.
 */
export async function loadLinkData() {
  if (!isSupabaseConfigured) return { available: false, accounts: [], links: [] };
  const [accountsRes, linksRes] = await Promise.all([
    supabase.rpc('coach_list_accounts'),
    supabase.from('account_links').select('*'),
  ]);
  if (accountsRes.error) {
    if (isMissingFunction(accountsRes.error)) return { available: false, accounts: [], links: [] };
    throw new Error(accountsRes.error.message);
  }
  return {
    available: true,
    accounts: (accountsRes.data || []).map((a) => ({
      userId: a.user_id,
      email: a.email || '',
      displayName: a.display_name || '',
      role: a.role,
      status: a.status,
    })),
    links: linksRes.error
      ? []
      : (linksRes.data || []).map((l) => ({
          userId: l.user_id,
          firstName: l.first_name,
          lastName: l.last_name,
          studentId: l.student_id,
          playerId: l.player_id,
          outcome: l.outcome,
          resolvedAt: l.resolved_at,
        })),
  };
}

/** Move an account to a roster row (or unlink it with playerId = null). */
export async function coachLinkAccount(userId, playerId) {
  const { error } = await supabase.rpc('coach_link_account', { p_user_id: userId, p_player_id: playerId });
  if (error) throw new Error(error.message);
  await Promise.all([refreshRoster(), refreshPrivate()]);
}
