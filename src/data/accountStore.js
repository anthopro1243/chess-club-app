/*
 * accountStore.js — who you are and what you are allowed to do.
 *
 * The database is the authority here: `profiles.role` and `profiles.status`
 * are what the RLS policies in migration 0005 actually check. Everything
 * this module exposes is a mirror of that, for deciding what to render.
 * Hiding a button is a courtesy, not a security measure, so nothing here is
 * load-bearing for access control.
 *
 * With no backend configured there are no accounts at all, so the single
 * local user is treated as an approved admin: it is the coach's own browser
 * and there is nobody else in it.
 */

import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from './supabaseClient.js';

const LOCAL_ADMIN = {
  userId: null,
  role: 'admin',
  status: 'approved',
  displayName: '',
  isCoach: true,
  isAdmin: true,
  isApproved: true,
  loading: false,
  signedIn: false,
};

const PENDING = {
  userId: null,
  role: 'player',
  status: 'pending',
  displayName: '',
  isCoach: false,
  isAdmin: false,
  isApproved: false,
  loading: false,
  signedIn: true,
};

function shape(row, userId) {
  const role = row?.role || 'player';
  const status = row?.status || 'pending';
  return {
    userId,
    role,
    status,
    displayName: row?.display_name || '',
    isCoach: role === 'coach' || role === 'admin',
    isAdmin: role === 'admin',
    isApproved: status === 'approved',
    loading: false,
    signedIn: true,
  };
}

/** The signed-in account's role and approval status. */
export function useAccount() {
  const [account, setAccount] = useState(() =>
    isSupabaseConfigured ? { ...PENDING, loading: true, signedIn: false } : LOCAL_ADMIN,
  );

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;
    let live = true;

    const load = async (session) => {
      if (!session) {
        // Signed out on a deployment that has a backend is a stranger, not a
        // coach working offline. The cloud rows are unreachable to them
        // either way, but the club's tools should not be sitting open on a
        // public URL for anyone who finds the link.
        if (live) setAccount({ ...PENDING, signedIn: false, loading: false });
        return;
      }
      const { data, error } = await supabase
        .from('profiles')
        .select('role, status, display_name')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (!live) return;
      if (error) console.error('Profile fetch failed:', error.message);
      setAccount(shape(data, session.user.id));
    };

    supabase.auth.getSession().then(({ data }) => load(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => load(session));

    return () => {
      live = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return account;
}

/**
 * Redeem an invite code. A valid code approves the account there and then;
 * without one it waits for a coach. The check runs in a database function so
 * the code itself is never readable by the people it gates.
 */
export async function redeemInvite(code) {
  if (!isSupabaseConfigured) return true;
  const { data, error } = await supabase.rpc('redeem_invite', { p_code: code.trim() });
  if (error) throw new Error(error.message);
  if (!data) throw new Error('That code is not valid, has expired, or has already been used.');
  return true;
}

// -- coach-facing member management ---------------------------------------

/** Every account with its role and status. Coaches only; RLS enforces it. */
export function useMembers() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  const reload = async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('user_id, role, status, display_name, created_at, approved_at')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Member list fetch failed:', error.message);
      setMembers([]);
    } else {
      setMembers(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    reload();
    if (!isSupabaseConfigured) return undefined;
    const channel = supabase
      .channel('profiles-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, reload)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  return { members, loading, reload };
}

export async function approveMember(userId) {
  const { error } = await supabase
    .from('profiles')
    .update({ status: 'approved', approved_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export async function suspendMember(userId) {
  const { error } = await supabase.from('profiles').update({ status: 'suspended' }).eq('user_id', userId);
  if (error) throw new Error(error.message);
}

export async function setMemberRole(userId, role) {
  const { error } = await supabase.from('profiles').update({ role }).eq('user_id', userId);
  if (error) throw new Error(error.message);
}

/** Make an invite code. Short, unambiguous, no letters that look like digits. */
export async function createInvite({ note = '', maxUses = 1, expiresInDays = 30 } = {}) {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const code = Array.from(
    { length: 8 },
    () => alphabet[Math.floor(Math.random() * alphabet.length)],
  ).join('');

  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 86400000).toISOString()
    : null;

  const { error } = await supabase
    .from('invite_codes')
    .insert({ code, note, max_uses: maxUses, expires_at: expiresAt });
  if (error) throw new Error(error.message);
  return code;
}

export function useInvites() {
  const [invites, setInvites] = useState([]);

  const reload = async () => {
    if (!isSupabaseConfigured) return;
    const { data, error } = await supabase
      .from('invite_codes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (!error) setInvites(data || []);
  };

  useEffect(() => {
    reload();
  }, []);

  return { invites, reload };
}

/**
 * Send a password reset for a member who cannot reach their own inbox.
 *
 * Deliberately not the Supabase admin API: that needs the service-role key,
 * which must never reach client code, and would mean standing up a server
 * function. Since intake already records a guardian email, sending the reset
 * there solves the actual problem — a twelve-year-old without an inbox — with
 * nothing new to host.
 */
export async function sendResetForMember(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: window.location.origin,
  });
  if (error) throw new Error(error.message);
}
