/*
 * supabaseClient.js — the one place that knows whether a backend is
 * configured at all. Everything else checks `isSupabaseConfigured` and
 * falls back to browser-local storage when it's false, so the app runs
 * fine with no backend and upgrades automatically once one is connected.
 */

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = isSupabaseConfigured ? createClient(url, anonKey) : null;
