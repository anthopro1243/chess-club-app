import { useSyncExternalStore } from 'react';

function safeParse(raw, fallback) {
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
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
