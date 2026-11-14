/*
 * syncStatus.js — make a failed write visible.
 *
 * Every store used to swallow cloud errors into console.error and carry on,
 * which meant a database that had never once accepted a write looked exactly
 * like one that was working: the change appeared on screen, because the local
 * store had already accepted it, and only vanished on the next reload.
 *
 * A write that did not reach the server is something the person who made it
 * has to know about immediately, so it goes on screen.
 */

import { useStore } from './store.js';
import { reportClientError } from './errorLog.js';

// Deliberately not persisted: a stale error from a previous visit would be
// worse than no error at all.
const store = { value: null, listeners: new Set() };

const memoryStore = {
  get: () => store.value,
  set: (updater) => {
    store.value = typeof updater === 'function' ? updater(store.value) : updater;
    store.listeners.forEach((fn) => fn());
  },
  subscribe: (fn) => {
    store.listeners.add(fn);
    return () => store.listeners.delete(fn);
  },
};

/** The most recent failed write, or null. */
export function useSyncError() {
  return useStore(memoryStore);
}

/** The current error, for code outside React (and the tests). */
export function getSyncError() {
  return memoryStore.get();
}

/**
 * Record a failed cloud operation. `what` names the thing in the user's
 * terms ("the roster", "that game"), not the table. `kind` is 'save' for a
 * write and 'load' for a read, so the banner says which one failed.
 */
export function reportSyncError(what, message, kind = 'save') {
  reportClientError(`sync: ${what}`, message);
  memoryStore.set({ what, message, kind, at: Date.now() });
}

/** A failed read: same banner, different wording (nothing was lost). */
export function reportLoadError(what, message) {
  reportSyncError(what, message, 'load');
}

/**
 * A later sync of `what` worked, so a banner about it is out of date. Only
 * that thing's own error is cleared: success saving the roster says nothing
 * about the analysis archive.
 */
export function reportSyncOk(what) {
  if (memoryStore.get()?.what === what) memoryStore.set(null);
}

export function clearSyncError() {
  memoryStore.set(null);
}

/** Convenience for the `.then(({ error }) => ...)` shape every store uses. */
export function reportIfFailed(what) {
  return ({ error }) => {
    if (error) reportSyncError(what, error.message);
    else reportSyncOk(what);
  };
}
