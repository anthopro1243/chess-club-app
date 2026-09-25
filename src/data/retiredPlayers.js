/*
 * retiredPlayers.js — what a soft-deleted (retired) player means to the rest
 * of the app.
 *
 * A retired member keeps their row, games, analyses and scores (0008 built
 * `deleted_at` so nothing cascades), which means every table that references
 * a player still hands their rows back. The roster store hides the player
 * row itself; these helpers are for everything keyed by player id, so a
 * retired member's scores cannot leak into a club average or a leaderboard
 * through a side door, and the analysis queue stops spending engine time on
 * games nobody on the roster played.
 *
 * Pure, so the rules are testable without a database.
 */

/** Ids of the players currently on the roster. */
export function activePlayerIdSet(players = []) {
  return new Set(
    (players || []).filter((p) => p && p.playerId && !p.deletedAt).map((p) => p.playerId),
  );
}

/**
 * Keep only rows that belong to an active player. Rows with no player id at
 * all are dropped too: every caller here aggregates per player, and a row
 * nobody owns cannot be attributed to anyone on the roster.
 */
export function onlyActiveRows(rows = [], activeIds, key = 'playerId') {
  if (!(activeIds instanceof Set)) return [...(rows || [])];
  return (rows || []).filter((row) => row && activeIds.has(row[key]));
}

/** The club player ids on a game row (either the store's or the table's shape). */
export function clubPlayerIdsOf(game) {
  if (!game) return [];
  const white = game.whitePlayerId ?? game.white_player_id ?? null;
  const black = game.blackPlayerId ?? game.black_player_id ?? null;
  return [white, black].filter(Boolean);
}

/**
 * True when every club player in the game is retired. A game with no club
 * player at all is NOT retired-only — there is nothing to say it belongs to a
 * removed member, so it keeps whatever treatment it had before.
 */
export function isRetiredOnlyGame(game, retiredIds) {
  const ids = clubPlayerIdsOf(game);
  if (!ids.length || !(retiredIds instanceof Set) || !retiredIds.size) return false;
  return ids.every((id) => retiredIds.has(id));
}

/** Split queue candidates into ones to analyse and ones to mark skipped. */
export function partitionQueueCandidates(candidates = [], retiredIds) {
  const analyse = [];
  const skip = [];
  for (const game of candidates || []) {
    (isRetiredOnlyGame(game, retiredIds) ? skip : analyse).push(game);
  }
  return { analyse, skip };
}

export const RETIRED_SKIP_REASON = 'skipped: every club player in this game has been removed from the roster';
