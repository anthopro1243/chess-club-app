/*
 * clubSync.js — which members' linked accounts a coach's session should sync
 * in the background (research F043/F044), and how politely.
 *
 * Each member's own session already syncs their accounts on open. That misses
 * everyone who doesn't open the app between Tuesdays, which is most of a
 * club. So when the coach has the app open, it also works through members
 * whose accounts haven't synced in a day.
 *
 * Politeness, per both sites' published rules: one request at a time (never
 * in parallel), a small batch per sitting so a coach's laptop isn't tied up,
 * and when a site answers 429 it is left alone for a minute, then two, four…
 * The member's own "Sync now" button is unaffected by any of this.
 */

export const CLUB_SYNC_EVERY_MS = 24 * 60 * 60 * 1000;
export const CLUB_SYNC_BATCH = 8;
export const BACKOFF_BASE_MS = 60 * 1000;
export const BACKOFF_MAX_MS = 60 * 60 * 1000;

const SYNC_PLATFORMS = ['chesscom', 'lichess'];

/**
 * The (member, platform) pairs due now, oldest-synced first (never-synced
 * first of all), skipping retired members and any platform still backing off.
 */
export function planClubSync(players = [], {
  now = Date.now(),
  everyMs = CLUB_SYNC_EVERY_MS,
  batch = CLUB_SYNC_BATCH,
  pausedUntil = {},
  skipPlayerId = null,
} = {}) {
  const due = [];
  for (const player of players || []) {
    if (!player?.playerId || player.deletedAt || player.playerId === skipPlayerId) continue;
    for (const platform of SYNC_PLATFORMS) {
      const connection = player.connections?.[platform];
      if (!connection?.username) continue;
      if ((pausedUntil[platform] ?? 0) > now) continue;
      const last = Date.parse(connection.lastSyncedAt ?? '');
      if (Number.isFinite(last) && now - last < everyMs) continue;
      due.push({ playerId: player.playerId, platform, last: Number.isFinite(last) ? last : -Infinity });
    }
  }
  return due
    .sort((a, b) => a.last - b.last || a.playerId.localeCompare(b.playerId))
    .slice(0, batch)
    .map(({ playerId, platform }) => ({ playerId, platform }));
}

/** After a 429 from `platform`: when to try it again. Doubles each time, capped. */
export function backoffAfter429(state = {}, platform, now = Date.now()) {
  const strikes = (state.strikes?.[platform] ?? 0) + 1;
  const wait = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (strikes - 1));
  return {
    strikes: { ...(state.strikes || {}), [platform]: strikes },
    pausedUntil: { ...(state.pausedUntil || {}), [platform]: now + wait },
  };
}

/** A clean answer from `platform` clears its strikes. */
export function clearBackoff(state = {}, platform) {
  const strikes = { ...(state.strikes || {}) };
  delete strikes[platform];
  return { strikes, pausedUntil: { ...(state.pausedUntil || {}) } };
}
