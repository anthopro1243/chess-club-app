/*
 * useAutoSync.js — sync the viewer's linked Chess.com / Lichess accounts
 * when the app opens, so nobody has to remember the Sync button.
 *
 * Deliberately narrow:
 *   - only the signed-in member's OWN accounts. A coach opening the app does
 *     not fan out across thirty members' accounts; that would hit both sites'
 *     rate limits and slow the coach's first page for everyone else's games.
 *   - at most once per AUTO_SYNC_MIN_INTERVAL_MS per account (the check uses
 *     the account's own `lastSyncedAt`, so it holds across tabs and reloads).
 *   - each platform gets a time limit. A failure is not retried straight
 *     away — a sync that timed out may already have written part of its
 *     result — it is simply due again at the next check.
 *   - the Sync button in Connected accounts still works exactly as before.
 */

import { useEffect, useRef } from 'react';
import { isSupabaseConfigured } from './supabaseClient.js';
import { useMyProfile, getPlayers } from './rosterStore.js';
import { syncPlatform } from './externalSync.js';
import { platformsDueForSync, withTimeout, AUTO_SYNC_MIN_INTERVAL_MS } from './autoPolicy.js';

const SYNC_TIMEOUT_MS = 60 * 1000;
/* Let the page settle before reaching out to other sites. */
const START_DELAY_MS = 5 * 1000;

/*
 * The last auto-sync outcome, in memory only, for the background indicator.
 * { state: 'idle' | 'syncing' | 'done' | 'error', label, imported, error }
 */
const listeners = new Set();
let status = { state: 'idle' };
export const autoSyncStatus = {
  get: () => status,
  set: (next) => {
    status = next;
    listeners.forEach((fn) => fn());
  },
  subscribe: (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export function useAutoSync({ enabled = true } = {}) {
  const me = useMyProfile();
  const running = useRef(false);
  const playerId = me?.playerId ?? null;
  // Re-evaluate when the linked accounts change (e.g. a member links one).
  const connections = me?.connections || {};
  const linkedKey = Object.entries(connections)
    .map(([k, v]) => `${k}:${v?.username || ''}`)
    .sort()
    .join('|');

  useEffect(() => {
    if (!enabled || !isSupabaseConfigured || !playerId) return undefined;
    let cancelled = false;

    const check = async () => {
      if (cancelled || running.current) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      // Read the row fresh: after a sync its lastSyncedAt has moved on.
      const row = getPlayers().find((p) => p.playerId === playerId);
      const due = platformsDueForSync(row?.connections || {});
      if (!due.length) return;

      running.current = true;
      try {
        let imported = 0;
        for (const platform of due) {
          if (cancelled) break;
          const label = platform === 'lichess' ? 'Lichess' : 'Chess.com';
          autoSyncStatus.set({ state: 'syncing', label });
          try {
            const result = await withTimeout(syncPlatform(playerId, platform), SYNC_TIMEOUT_MS, {
              label: `Syncing ${label}`,
            });
            imported += result.imported || 0;
          } catch (error) {
            autoSyncStatus.set({ state: 'error', label, error: error.message || 'Sync failed.' });
            continue;
          }
        }
        if (autoSyncStatus.get().state !== 'error') autoSyncStatus.set({ state: 'done', imported });
      } finally {
        running.current = false;
      }
    };

    const first = setTimeout(check, START_DELAY_MS);
    const every = setInterval(check, AUTO_SYNC_MIN_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(every);
    };
    // Restart only when who is signed in, or what they have linked, changes.
  }, [enabled, playerId, linkedKey]);
}
