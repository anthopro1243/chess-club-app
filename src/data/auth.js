/*
 * auth.js — passwordless sign-in for the shared roster.
 *
 * Email magic links only: nobody types a password into this app, Supabase
 * emails a one-time link, clicking it signs the browser in. There is no
 * per-role permission model — any signed-in club member can read and write
 * the roster (see supabase/schema.sql) — this is about knowing who's
 * allowed to touch shared data at all, not about restricting individuals.
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

export async function signInWithEmail(email) {
  if (!isSupabaseConfigured) throw new Error('Cloud sync is not configured for this deployment.');
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + window.location.pathname },
  });
  if (error) throw error;
}

export async function signOut() {
  if (!isSupabaseConfigured) return;
  await supabase.auth.signOut();
}
