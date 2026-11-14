import { isSupabaseConfigured } from './supabaseClient.js';

/*
 * backend.js — what the UI may know about the backend: only whether there is
 * one. With a club server (Supabase) the app has accounts, shared data and
 * background analysis; without one ("local mode") everything stays in this
 * browser. Pages import this, never supabaseClient.js, so the choice of
 * backend stays inside services/ and the feature stores.
 */
export const isCloud = isSupabaseConfigured;
