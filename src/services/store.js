import { useSyncExternalStore } from 'react';

function safeParse(raw, fallback) {
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** Every store made here, so sign-out can empty them all at once. */
const registry = new Set();

/** Browser keys that survive sign-out: preferences, not anyone's data. */
const KEEP_ON_SIGN_OUT = new Set(['cc-theme', 'cc-last-user']);

/**
 * Forget everything this browser holds about the club: every store goes back
 * to its starting value and every `cc-*` key except the theme is removed.
 * Called on sign-out and when a different account signs in, so the next
 * person on a shared school computer can't read the last one's roster,
 * notes or student ids from the browser.
 */
export function clearUserData() {
  for (const reset of registry) reset();
  try {
    const doomed = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith('cc-') && !KEEP_ON_SIGN_OUT.has(key)) doomed.push(key);
    }
    doomed.forEach((key) => localStorage.removeItem(key));
  } catch {
    /* storage unavailable: nothing was persisted either */
  }
}

/**
 * A small localStorage-backed store: get / set / subscribe, shaped for
 * useSyncExternalStore. If storage is unavailable (private browsing, a
 * locked-down browser) it quietly falls back to an in-memory value for the
 * rest of the visit instead of throwing.
 */
export function createStore(key, initialValue) {
  let persistable = true;
  let value;
  try {
    value = safeParse(localStorage.getItem(key), initialValue);
  } catch {
    persistable = false;
    value = initialValue;
  }

  const listeners = new Set();

  const persist = () => {
    if (!persistable) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage full or blocked; state still holds for this visit */
    }
  };

  registry.add(() => {
    value = initialValue;
    try {
      localStorage.removeItem(key);
    } catch {
      /* nothing to remove */
    }
    listeners.forEach((fn) => fn());
  });

  return {
    get: () => value,
    set: (updater) => {
      value = typeof updater === 'function' ? updater(value) : updater;
      persist();
      listeners.forEach((fn) => fn());
    },
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export function useStore(store) {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
