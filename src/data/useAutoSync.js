/*
 * useAutoSync.js — sync linked Chess.com / Lichess accounts in the
 * background, so nobody has to remember the Sync button.
 *
 *   - the signed-in member's OWN accounts: on open, then at most once per
 *     AUTO_SYNC_MIN_INTERVAL_MS per account (the check uses the account's own
 *     `lastSyncedAt`, so it holds across tabs and reloads).
 *   - in a COACH's session, also every member's accounts that haven't synced
 *     in a day, a small batch per sitting, one request at a time, with a
 *     growing pause after a 429 (clubSync.js; research F043/F044). This
 *     replaced the earlier "own accounts only" rule once the research
 *     confirmed both sites allow serial requests.
 *   - each sync gets a time limit. A failure is not retried straight away —
 *     a sync that timed out may already have written part of its result — it
 *     is simply due again at the next check.
 *   - the Sync button in Connected accounts still works exactly as before.
 */

import { useEffect, useRef } from 'react';
import { isSupabaseConfigured } from './supabaseClient.js';
import { useMyProfile, getPlayers } from './rosterStore.js';
import { syncPlatform } from './externalSync.js';
import { platformsDueForSync, withTimeout, AUTO_SYNC_MIN_INTERVAL_MS } from './autoPolicy.js';
import { planClubSync, backoffAfter429, clearBackoff } from './clubSync.js';
import { createStore } from './store.js';

/*
 * Back-off state for the club sweep, kept across reloads so a site that said
 * "slow down" isn't asked again the moment the coach refreshes the page.
 */
const clubSyncState = createStore('cc-club-sync-v1', { strikes: {}, pausedUntil: {} });

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

export function useAutoSync({ enabled = true, isCoach = false } = {}) {
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
    if (!enabled || !isSupabaseConfigured || (!playerId && !isCoach)) return undefined;
    let cancelled = false;

    /** One account, with a time limit. Returns imported count, or throws. */
    const syncOne = async (id, platform) => {
      const label = platform === 'lichess' ? 'Lichess' : 'Chess.com';
      const result = await withTimeout(syncPlatform(id, platform), SYNC_TIMEOUT_MS, {
        label: `Syncing ${label}`,
      });
      return result.imported || 0;
    };

    const syncOwn = async () => {
      if (!playerId) return { imported: 0, failed: false };
      // Read the row fresh: after a sync its lastSyncedAt has moved on.
      const row = getPlayers().find((p) => p.playerId === playerId);
      const due = platformsDueForSync(row?.connections || {});
      let imported = 0;
      let failed = false;
      for (const platform of due) {
        if (cancelled) break;
        const label = platform === 'lichess' ? 'Lichess' : 'Chess.com';
        autoSyncStatus.set({ state: 'syncing', label });
        try {
          imported += await syncOne(playerId, platform);
        } catch (error) {
          failed = true;
          autoSyncStatus.set({ state: 'error', label, error: error.message || 'Sync failed.' });
        }
      }
      return { imported, failed };
    };

    /*
     * The coach's session also works through members whose accounts haven't
     * synced in a day (clubSync.js): one at a time, a small batch per
     * sitting, and a site that answers 429 is left alone with a growing
     * pause. A member's failure never shows as an error banner here: the
     * coach can't fix someone else's typo from the corner of the screen, and
     * the member sees it on their own Connected accounts.
     */
    const syncClub = async () => {
      if (!isCoach) return 0;
      const plan = planClubSync(getPlayers(), {
        pausedUntil: clubSyncState.get().pausedUntil || {},
        skipPlayerId: playerId,
      });
      let imported = 0;
      const paused = new Set();
      for (let i = 0; i < plan.length; i += 1) {
        if (cancelled) break;
        const { playerId: id, platform } = plan[i];
        if (paused.has(platform)) continue;
        autoSyncStatus.set({ state: 'syncing', label: `members' accounts (${i + 1} of ${plan.length})` });
        try {
          imported += await syncOne(id, platform);
          clubSyncState.set((state) => clearBackoff(state, platform));
        } catch (error) {
          if (error?.status === 429) {
            paused.add(platform);
            clubSyncState.set((state) => backoffAfter429(state, platform));
          } else {
            console.warn(`club sync: ${id} ${platform}:`, error?.message);
          }
        }
      }
      return imported;
    };

    const check = async () => {
      if (cancelled || running.current) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      running.current = true;
      try {
        const own = await syncOwn();
        const club = await syncClub();
        const imported = own.imported + club;
        if (!own.failed && autoSyncStatus.get().state === 'syncing') {
          autoSyncStatus.set({ state: 'done', imported });
        }
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
    // Restart only when who is signed in, their role, or what they have linked, changes.
  }, [enabled, isCoach, playerId, linkedKey]);
}
