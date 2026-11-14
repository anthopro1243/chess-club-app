/*
 * auth.js — accounts for the shared roster.
 *
 * Real email + password accounts, backed entirely by Supabase Auth — it
 * owns the user table, hashes and stores passwords (bcrypt), issues
 * sessions, and handles the reset-password email flow. Nothing here ever
 * sees a password in a form that isn't about to go straight into
 * `supabase.auth.*`; there is no custom password storage of any kind.
 *
 * No magic link, no email OTP — password only. Whether signUp signs someone
 * in immediately or makes them click a confirmation link first is a Supabase
 * project setting (Authentication -> Providers -> Email -> "Confirm email"),
 * not something this file controls.
 */

import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { clearUserData } from './store.js';

const LAST_USER_KEY = 'cc-last-user';

/*
 * Nothing from one account may be left in the browser for the next. On
 * sign-out, or when a different account signs in on the same browser, every
 * cached store is emptied (store.js). Registered before the data stores
 * subscribe, so the clear runs before they fetch the new account's rows.
 */
if (isSupabaseConfigured) {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      clearUserData();
      return;
    }
    const uid = session?.user?.id;
    if (!uid) return;
    try {
      const last = localStorage.getItem(LAST_USER_KEY);
      if (last && last !== uid) clearUserData();
      localStorage.setItem(LAST_USER_KEY, uid);
    } catch {
      /* storage blocked: nothing was cached either */
    }
  });
}

export function useSession() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, []);

  return session;
}

/**
 * Run `callback` on every sign-in event, so the UI can react to one without
 * importing the Supabase client itself. Returns an unsubscribe function.
 */
export function onAuthEvent(callback) {
  if (!isSupabaseConfigured) return () => {};
  const { data } = supabase.auth.onAuthStateChange((event) => callback(event));
  return () => data.subscription.unsubscribe();
}

const redirectTo = () => window.location.origin + window.location.pathname;

/**
 * Create an account with a password. Depending on the project's
 * "Confirm email" setting, this either signs them in immediately (returned
 * session is non-null) or requires clicking a confirmation link first
 * (returned session is null, user is not) — the caller shows the right
 * message either way.
 */
export async function signUpWithPassword(email, password) {
  if (!isSupabaseConfigured) throw new Error('This copy of the app isn’t connected to the club server.');
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: redirectTo() },
  });
  if (error) throw error;
  return { confirmedImmediately: !!data.session };
}

export async function signInWithPassword(email, password) {
  if (!isSupabaseConfigured) throw new Error('This copy of the app isn’t connected to the club server.');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/** Emails a reset link. Works even for an account that has no password yet (magic-link-only). */
export async function sendPasswordReset(email) {
  if (!isSupabaseConfigured) throw new Error('This copy of the app isn’t connected to the club server.');
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectTo() });
  if (error) throw error;
}

/** Sets a new password on the current session — used both by the reset-link landing and a signed-in "change password". */
export async function updatePassword(newPassword) {
  if (!isSupabaseConfigured) throw new Error('This copy of the app isn’t connected to the club server.');
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function signOut() {
  if (!isSupabaseConfigured) return;
  await supabase.auth.signOut();
  clearUserData();
}
