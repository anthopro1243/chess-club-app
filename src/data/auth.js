/*
 * auth.js — accounts for the shared roster.
 *
 * Real email + password accounts, backed entirely by Supabase Auth — it
 * owns the user table, hashes and stores passwords (bcrypt), issues
 * sessions, and handles the reset-password email flow. Nothing here ever
 * sees a password in a form that isn't about to go straight into
 * `supabase.auth.*`; there is no custom password storage of any kind.
 *
 * Email magic links (signInWithEmail) still work too — same underlying
 * account, just a second way in that doesn't need a password at all.
 */

import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from './supabaseClient.js';

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

const redirectTo = () => window.location.origin + window.location.pathname;

/**
 * Create an account with a password. Depending on the project's
 * "Confirm email" setting, this either signs them in immediately (returned
 * session is non-null) or requires clicking a confirmation link first
 * (returned session is null, user is not) — the caller shows the right
 * message either way.
 */
export async function signUpWithPassword(email, password) {
  if (!isSupabaseConfigured) throw new Error('Cloud sync is not configured for this deployment.');
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: redirectTo() },
  });
  if (error) throw error;
  return { confirmedImmediately: !!data.session };
}

export async function signInWithPassword(email, password) {
  if (!isSupabaseConfigured) throw new Error('Cloud sync is not configured for this deployment.');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/** Emails a reset link. Works even for an account that has no password yet (magic-link-only). */
export async function sendPasswordReset(email) {
  if (!isSupabaseConfigured) throw new Error('Cloud sync is not configured for this deployment.');
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectTo() });
  if (error) throw error;
}

/** Sets a new password on the current session — used both by the reset-link landing and a signed-in "change password". */
export async function updatePassword(newPassword) {
  if (!isSupabaseConfigured) throw new Error('Cloud sync is not configured for this deployment.');
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function signInWithEmail(email) {
  if (!isSupabaseConfigured) throw new Error('Cloud sync is not configured for this deployment.');
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } });
  if (error) throw error;
}

export async function signOut() {
  if (!isSupabaseConfigured) return;
  await supabase.auth.signOut();
}
