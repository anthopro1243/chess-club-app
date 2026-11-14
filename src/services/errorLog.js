/*
 * errorLog.js — tell the coach when something breaks in someone's browser.
 *
 * A crashed page or a failed save used to surface only as a banner in one
 * tab and a console line nobody reads. Each error is written to
 * `client_errors` (migration 0027), which members may only insert into and
 * the coach reads on the Coach page. Best effort: if the table isn't there
 * yet, or the write fails, nothing else is affected.
 */
import { supabase, isSupabaseConfigured } from './supabaseClient.js';

const MAX_PER_VISIT = 20;
let sent = 0;
const seen = new Set();

export function reportClientError(where, error) {
  const message = String(error?.message || error || 'unknown error').slice(0, 500);
  console.error(`[${where}]`, error);
  if (!isSupabaseConfigured || sent >= MAX_PER_VISIT) return;
  const key = `${where}:${message}`;
  if (seen.has(key)) return;
  seen.add(key);
  sent += 1;
  supabase
    .from('client_errors')
    .insert({
      place: String(where).slice(0, 100),
      message,
      page: window.location.hash.split('?')[0].slice(0, 60),
      user_agent: navigator.userAgent.slice(0, 200),
    })
    .then(
      () => {},
      () => {},
    );
}

/** The latest errors, newest first (coach only; RLS returns nothing otherwise). */
export async function recentClientErrors(limit = 30) {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('client_errors')
    .select('id, created_at, place, message, page, user_id')
    .order('created_at', { ascending: false })
    .limit(limit);
  return error ? [] : data || [];
}
