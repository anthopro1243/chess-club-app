/*
 * puzzleAttemptsStore.js — every attempt at a puzzle, kept.
 *
 * The Training page used to count a solve and forget the rest. This records
 * one row per attempt, failures included, because the failures are the
 * interesting half: knowing someone is 91% on forks and 38% on deflection is
 * what turns "tactical vision: 6/10" from a guess into a measurement.
 *
 * Same five-part shape as rosterStore and gamesStore: a local store, row
 * translation, a cloud pull on sign-in, a push after every write, and hooks
 * for the pages. Attempts are only recorded against a real player — practice
 * with no trainee selected stays ephemeral, because there is nobody to
 * attribute it to.
 */

import { useMemo } from 'react';
import { createStore, useStore } from './store.js';
import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { reportSyncError } from './syncStatus.js';

/** Attempts pile up faster than any other record, so the local copy is capped. */
const LOCAL_LIMIT = 2000;

const store = createStore('cc-puzzle-attempts-v1', []);

export function useAttempts() {
  return useStore(store);
}

export function getAttempts() {
  return store.get();
}

let cloudReady = false;
let channel = null;

function fromRow(row) {
  return {
    id: row.id,
    playerId: row.player_id,
    puzzleId: row.puzzle_id,
    themes: row.themes || [],
    difficulty: row.difficulty || '',
    puzzleRating: row.puzzle_rating ?? null,
    correct: !!row.correct,
    usedHint: !!row.used_hint,
    usedSolution: !!row.used_solution,
    secondsTaken: row.seconds_taken ?? null,
    attemptedAt: row.attempted_at,
  };
}

function toRow(attempt) {
  return {
    player_id: attempt.playerId,
    puzzle_id: attempt.puzzleId,
    themes: attempt.themes || [],
    difficulty: attempt.difficulty || null,
    puzzle_rating: attempt.puzzleRating,
    correct: attempt.correct,
    used_hint: attempt.usedHint,
    used_solution: attempt.usedSolution,
    seconds_taken: attempt.secondsTaken,
    attempted_at: attempt.attemptedAt,
  };
}

async function syncFromCloud() {
  const { data, error } = await supabase
    .from('puzzle_attempts')
    .select('*')
    .order('attempted_at', { ascending: false })
    .limit(LOCAL_LIMIT);
  if (error) {
    reportSyncError('your puzzle history', error.message);
    return;
  }
  cloudReady = true;
  store.set(data.map(fromRow));
}

function subscribeRealtime() {
  if (channel) return;
  channel = supabase
    .channel('puzzle-attempts-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'puzzle_attempts' }, () => {
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

/**
 * Record one attempt. Returns the stored record, or null when there is no
 * player to attribute it to.
 */
export function recordAttempt(attempt) {
  if (!attempt.playerId || !attempt.puzzleId) return null;

  const record = {
    id: `PA-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    attemptedAt: new Date().toISOString(),
    themes: [],
    difficulty: '',
    puzzleRating: null,
    usedHint: false,
    usedSolution: false,
    secondsTaken: null,
    ...attempt,
  };

  store.set((attempts) => [record, ...attempts].slice(0, LOCAL_LIMIT));

  if (isSupabaseConfigured && cloudReady) {
    // The database assigns the real id; the local one only has to be unique
    // in this browser until the next pull replaces it.
    supabase
      .from('puzzle_attempts')
      .insert(toRow(record))
      .then(({ error }) => {
        if (error) reportSyncError('that puzzle attempt', error.message);
      });
  }
  return record;
}

// -- reading it back ------------------------------------------------------

/** Every attempt by one player, newest first. */
export function attemptsFor(attempts, playerId) {
  return attempts.filter((a) => a.playerId === playerId);
}

/**
 * Accuracy per theme for one player, as
 * `[{ theme, attempts, correct, accuracy }]`, worst first.
 *
 * `minAttempts` keeps a single lucky guess out of the ranking — one attempt
 * at a theme is not evidence of anything.
 */
export function accuracyByTheme(attempts, playerId, { minAttempts = 3 } = {}) {
  const totals = new Map();

  for (const attempt of attempts) {
    if (attempt.playerId !== playerId) continue;
    for (const theme of attempt.themes || []) {
      const row = totals.get(theme) || { theme, attempts: 0, correct: 0 };
      row.attempts += 1;
      if (attempt.correct) row.correct += 1;
      totals.set(theme, row);
    }
  }

  return [...totals.values()]
    .filter((row) => row.attempts >= minAttempts)
    .map((row) => ({ ...row, accuracy: row.correct / row.attempts }))
    .sort((a, b) => a.accuracy - b.accuracy);
}

/** Headline numbers for one player: totals, accuracy, and how fast they answer. */
export function attemptSummary(attempts, playerId) {
  const mine = attemptsFor(attempts, playerId);
  if (!mine.length) {
    return { attempts: 0, correct: 0, accuracy: null, medianSeconds: null, hintRate: null };
  }

  const correct = mine.filter((a) => a.correct).length;
  const times = mine.map((a) => a.secondsTaken).filter((s) => typeof s === 'number').sort((a, b) => a - b);

  return {
    attempts: mine.length,
    correct,
    accuracy: correct / mine.length,
    medianSeconds: times.length ? times[Math.floor(times.length / 2)] : null,
    hintRate: mine.filter((a) => a.usedHint).length / mine.length,
  };
}

/** Hook form of `accuracyByTheme`, memoised on the attempt list. */
export function useThemeAccuracy(playerId, options) {
  const attempts = useAttempts();
  return useMemo(
    () => (playerId ? accuracyByTheme(attempts, playerId, options) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [attempts, playerId, options?.minAttempts],
  );
}
