/*
 * progress.js — "Analysing your recent games: 37 of 180", worked out from the
 * games a member already has loaded. Nothing here asks the database anything:
 * the archive rows carry their own analysis status.
 *
 * Pure: no React, no Supabase.
 */

import { HISTORY_DEPTH } from '../sync/historyTopUp.js';

/** Below this many games still waiting, a note would only be noise. */
export const PROGRESS_MIN_WAITING = 3;

/**
 * How far the engine has got through one member's most recent games.
 * Bullet (skipped) and failed games are not counted either way: the engine
 * is not going to do them, so they are neither done nor waiting.
 * Returns null when there is too little waiting to be worth saying.
 */
export function recentAnalysisProgress(games = [], playerId, { depth = HISTORY_DEPTH } = {}) {
  if (!playerId) return null;
  const mine = (games || [])
    .filter((g) => g && (g.whitePlayerId === playerId || g.blackPlayerId === playerId))
    .filter((g) => g.analysisStatus === 'done' || g.analysisStatus === 'pending' || g.analysisStatus === 'running')
    .sort((a, b) => String(b.playedAt).localeCompare(String(a.playedAt)))
    .slice(0, depth);

  const done = mine.filter((g) => g.analysisStatus === 'done').length;
  const waiting = mine.length - done;
  if (waiting < PROGRESS_MIN_WAITING) return null;
  return { done, total: mine.length, waiting };
}
