/*
 * historyTopUp.js — how deep a linked account's imported history should be,
 * and when it still needs deepening.
 *
 * The club rating is fed by the first FIRST_SYNC_LIMIT games of a new link
 * and by every sync after that (externalSync.js); none of that changes. On
 * top of it, each account is brought up to HISTORY_DEPTH recent games for the
 * engine to analyse, so the "what to practise" plan rests on more than the
 * last fortnight. Those extra games are archived only: they never reach the
 * rating.
 *
 * The same step serves a brand-new link (it runs straight after the first
 * sync) and members who linked before this existed and only have ~50 games.
 * It is decided from data that is already there, plus one note on the
 * connection once the job is finished, so an account with fewer than
 * HISTORY_DEPTH games in total is not asked again on every sync.
 *
 * Pure: no React, no Supabase, no network.
 */

/** How many recent games an account should have in the archive. One number, used everywhere. */
export const HISTORY_DEPTH = 200;

/** How long the walk through older Chess.com months may take before it stops and finishes next sync. */
export const HISTORY_TIME_BUDGET_MS = 25 * 1000;

/**
 * Does this connection still need its history deepened?
 * `storedCount` is how many of its games the archive already holds.
 */
export function needsHistoryTopUp({ connection, storedCount }) {
  if (!connection?.username) return false;
  if (connection.historyToppedUpAt) return false;
  return (Number(storedCount) || 0) < HISTORY_DEPTH;
}

/**
 * Was the job finished? Yes when the full depth arrived, or when the site had
 * nothing older to give (a short account is complete, not unfinished).
 * A walk cut short by the time limit or an error is not finished.
 */
export function topUpIsComplete({ fetchedCount, reachedEnd }) {
  return fetchedCount >= HISTORY_DEPTH || !!reachedEnd;
}

/** The fetched games the archive does not have yet, newest first. */
export function newHistoryGames(fetched = [], knownIds = new Set()) {
  return (fetched || [])
    .filter((game) => game && !knownIds.has(game.externalId))
    .sort((a, b) => String(b.playedAt).localeCompare(String(a.playedAt)));
}
