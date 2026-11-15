/*
 * externalSync.js — turning online games into club results.
 *
 * externalChess.js knows how to talk to Chess.com and Lichess. This module
 * decides what their answers are worth: it pulls new games, converts each
 * opponent onto the club's rating scale, hands the batch to the roster to be
 * rated, and files the games in the club archive.
 *
 * Two decisions live here rather than in the roster, for the same reason the
 * endgame trainer decides what a Stockfish opponent was worth:
 * whoever produces a result owns the judgement about it, and the
 * roster only does the arithmetic.
 */

import { fetchGames, fetchProfile, fetchRecentHistory, PLATFORMS } from '../../services/external/externalChess.js';
import { getPlayers, recordExternalResults, setConnection } from '../roster/rosterStore.js';
import { recordExternalGames, importedHistoryOf, knownGameIds } from '../games/gamesStore.js';
import { enqueueGameRow } from '../analysis/queue.js';
import { isBulletGame, BULLET_SKIP_REASON } from '../analysis/bulletGames.js';
import {
  HISTORY_DEPTH, HISTORY_TIME_BUDGET_MS, needsHistoryTopUp, topUpIsComplete, newHistoryGames,
} from './historyTopUp.js';
import { toRatingRows } from '../../analysis/ratings.js';
import { savePlatformRatings } from '../ratings/ratingStore.js';

/*
 * Decision 1: the scale.
 *
 * Lichess ratings run visibly higher than Chess.com ratings for the same
 * player, and both differ from a club pool that starts everyone at 1500.
 * Left uncorrected, two equally strong members would end up with different
 * club ratings purely because of which site they play on, which would make
 * the leaderboard meaningless.
 *
 * So external opponents are shifted onto one scale before they are rated
 * against, with Chess.com as the reference point. These offsets are the
 * widely-observed gaps between the two sites, not exact science — they are
 * approximate by nature, and this table is the one place to tune them.
 */
const RATING_OFFSETS = {
  chesscom: { bullet: 0, blitz: 0, rapid: 0, classical: 0, daily: 0 },
  lichess: { bullet: -200, blitz: -250, rapid: -300, classical: -250, daily: -250 },
};

/*
 * Decision 2: how certain we are about the opponent.
 *
 * Glicko-2 moves a rating further when the opponent's own rating is
 * trustworthy. Online opponents have usually played far more rated games
 * than anyone in the club, so they count as well established, unless the
 * site says the rating is still provisional.
 */
const ESTABLISHED_RD = 80;
const PROVISIONAL_RD = 200;

/**
 * How much history feeds the club RATING on the first sync, and on every sync
 * after it. Deeper history for the engine to analyse is a separate step that
 * never touches the rating: see historyTopUp.js (HISTORY_DEPTH).
 */
const FIRST_SYNC_LIMIT = 50;
const INCREMENTAL_LIMIT = 100;

function toClubScale(game) {
  const offsets = RATING_OFFSETS[game.platform] || {};
  const offset = offsets[game.timeClass] ?? 0;
  // Nothing to rate against if the site withheld the opponent's rating.
  if (game.opponentRating == null) return null;
  return {
    ...game,
    clubOpponentRating: game.opponentRating + offset,
    opponentRd: game.opponentProvisional ? PROVISIONAL_RD : ESTABLISHED_RD,
  };
}

function toArchiveRecord(game, playerId) {
  // Bullet is imported and rated like any other game, but filed as skipped so
  // the engine never queues it.
  const skipped = isBulletGame(game);
  return {
    ...(skipped ? { analysisStatus: 'skipped', analysisError: BULLET_SKIP_REASON } : {}),
    id: game.externalId,
    playedAt: game.playedAt,
    whitePlayerId: game.color === 'white' ? playerId : '',
    blackPlayerId: game.color === 'black' ? playerId : '',
    whiteName: game.whiteName,
    blackName: game.blackName,
    result: game.result,
    reason: game.reason,
    moveCount: game.moveCount,
    mode: game.platform,
    computerElo: null,
    pgn: game.pgn,
  };
}

/**
 * Check a username really exists, then remember it against the player.
 * Returns the platform profile so the caller can show what it found.
 */
export async function connectAccount(playerId, platform, username) {
  const profile = await fetchProfile(platform, username);
  setConnection(playerId, platform, {
    username: profile.username,
    url: profile.url,
    ratings: profile.ratings,
    connectedAt: new Date().toISOString(),
    lastSyncedAt: null,
    lastGameAt: null,
    historyToppedUpAt: null,
  });
  return profile;
}

/**
 * Pull everything new from one linked account and fold it into the club
 * record: ratings refreshed, new games rated, games archived.
 */
export async function syncPlatform(playerId, platform) {
  const player = getPlayers().find((p) => p.playerId === playerId);
  const connection = player?.connections?.[platform];
  if (!connection?.username) throw new Error(`No ${PLATFORMS[platform]?.label} account linked.`);

  const profile = await fetchProfile(platform, connection.username);

  // How much of this account is already archived, read before anything new
  // lands. Null when it cannot be read: the top-up then waits for a later sync.
  let archivedBefore = null;
  if (needsHistoryTopUp({ connection, storedCount: 0 })) {
    try {
      archivedBefore = (await importedHistoryOf(playerId, platform)).count;
    } catch (error) {
      console.warn(`history top-up: could not count ${platform} games:`, error?.message);
    }
  }

  const firstSync = !connection.lastGameAt;
  const fetched = await fetchGames(platform, connection.username, {
    since: connection.lastGameAt,
    limit: firstSync ? FIRST_SYNC_LIMIT : INCREMENTAL_LIMIT,
  });

  // Both sites answer newest first; ratings have to be applied in the order
  // the games were actually played.
  const rateable = fetched
    .map(toClubScale)
    .filter(Boolean)
    .sort((a, b) => String(a.playedAt).localeCompare(String(b.playedAt)));

  const newestAt = fetched.reduce(
    (latest, g) => (String(g.playedAt) > String(latest) ? g.playedAt : latest),
    connection.lastGameAt || '',
  );

  const { imported, ratingBefore, ratingAfter } = recordExternalResults(playerId, platform, rateable, {
    ratings: profile.ratings,
    username: profile.username,
    url: profile.url,
    lastSyncedAt: new Date().toISOString(),
    lastGameAt: newestAt || connection.lastGameAt || null,
  });

  const archived = imported.map((g) => toArchiveRecord(g, playerId));
  if (archived.length) {
    recordExternalGames(archived);
    // A game imported in bulk is queued exactly like a game played in the app.
    // Nothing should sit waiting for a coach to notice it exists. The row is
    // inserted with analysis_status 'pending' by default, so this only matters
    // for a game that was previously marked failed or skipped.
    for (const game of archived) if (!game.analysisStatus) await enqueueGameRow(game.id);
  }

  // Ratings are stored per (platform, time control) as separate rows and are
  // never merged into one number - see src/analysis/ratings.js for why.
  await savePlatformRatings(toRatingRows(playerId, platform, profile.ratings));

  // Deeper history for analysis. Runs last, so a slow or refused request here
  // can never cost the member the rated import above.
  const history = await topUpHistory(playerId, platform, {
    connection: { ...connection, username: profile.username },
    storedCount: archivedBefore == null ? null : archivedBefore + archived.length,
    alreadyHave: new Set([...fetched.map((g) => g.externalId), ...(player.importedGameIds || [])]),
  });

  return {
    platform,
    label: PLATFORMS[platform]?.label || platform,
    username: profile.username,
    imported: imported.length,
    queuedForAnalysis: archived.filter((g) => !g.analysisStatus).length,
    historyAdded: history.added,
    ratings: profile.ratings,
    ratingBefore,
    ratingAfter,
    ratingChange: ratingBefore != null && ratingAfter != null ? ratingAfter - ratingBefore : 0,
  };
}

/**
 * Bring an account's archive up to HISTORY_DEPTH recent games for analysis.
 *
 * Analysis only: these games go to the archive and the queue and are never
 * handed to recordExternalResults, so the club rating cannot move because of
 * them. A game already archived is left alone (checked against the archive,
 * and the table refuses a second row with the same id anyway).
 *
 * A rate limit is rethrown, so the caller's back-off applies; any other
 * failure just leaves the job unfinished for the next sync to pick up.
 */
async function topUpHistory(playerId, platform, { connection, storedCount, alreadyHave }) {
  if (storedCount == null) return { added: 0 };
  if (!needsHistoryTopUp({ connection, storedCount })) {
    // Already deep enough: note it, so the archive is not counted every sync.
    if (storedCount >= HISTORY_DEPTH && !connection.historyToppedUpAt) {
      setConnection(playerId, platform, { historyToppedUpAt: new Date().toISOString() });
    }
    return { added: 0 };
  }
  try {
    const { games, reachedEnd } = await fetchRecentHistory(platform, connection.username, {
      limit: HISTORY_DEPTH,
      deadlineAt: Date.now() + HISTORY_TIME_BUDGET_MS,
    });

    const known = await knownGameIds(games.map((g) => g.externalId));
    for (const id of alreadyHave) known.add(id);
    const archived = newHistoryGames(games, known).map((g) => toArchiveRecord(g, playerId));

    if (archived.length) {
      recordExternalGames(archived);
      for (const game of archived) if (!game.analysisStatus) await enqueueGameRow(game.id);
    }
    if (topUpIsComplete({ fetchedCount: games.length, reachedEnd })) {
      setConnection(playerId, platform, { historyToppedUpAt: new Date().toISOString() });
    }
    return { added: archived.length };
  } catch (error) {
    if (error?.status === 429) throw error;
    console.warn(`history top-up: ${platform}:`, error?.message);
    return { added: 0 };
  }
}

/**
 * Sync every linked account for a player. One site being down or rate
 * limiting us does not stop the other from going through.
 */
export async function syncAllPlatforms(playerId) {
  const player = getPlayers().find((p) => p.playerId === playerId);
  const linked = Object.keys(player?.connections || {}).filter(
    (key) => player.connections[key]?.username,
  );

  const results = [];
  for (const platform of linked) {
    try {
      results.push(await syncPlatform(playerId, platform));
    } catch (error) {
      results.push({
        platform,
        label: PLATFORMS[platform]?.label || platform,
        error: error.message || 'Sync failed.',
        imported: 0,
      });
    }
  }
  return results;
}
