/*
 * lichessSync.js — the Lichess side of account linking.
 *
 * externalChess.js already knows how to TALK to Lichess: fetchLichessProfile,
 * fetchLichessGames and normalizeLichessGame live there and are not
 * duplicated here. This module is the layer directly above them, mirroring
 * what externalSync.js does for Chess.com: it turns an already-fetched
 * profile into storable rating rows, an already-normalised batch of games
 * into club archive records, and the pair into one small summary for the UI.
 *
 * Everything here is PURE. Nothing in this file calls fetch. Each export
 * takes data that somebody else fetched and returns data, which is what makes
 * the whole thing testable with the network switched off — and is also why
 * the fetching stayed in externalChess.js rather than moving in here.
 *
 * TIME CONTROLS ARE NEVER COMBINED.
 *
 * Read the header of src/analysis/ratings.js for the full argument. The short
 * version: a Lichess rating is a position within one pool, measured at one
 * speed. Averaging a player's bullet and classical numbers describes nobody,
 * and averaging across sites describes nobody twice over. So every perf
 * Lichess reports becomes its own row keyed by (player, platform, time
 * control), each carrying the rd and game count Lichess gave it, and nothing
 * in this file ever adds, averages or folds two of them together. A perf the
 * account does not have produces NO row at all — an absent rating and a
 * rating of null are different claims, and only the first one is true.
 */

/**
 * Lichess perf name -> the club's time control key. One-to-one on purpose.
 *
 * Perfs outside this table are deliberately dropped rather than folded into a
 * neighbour: ultraBullet is not bullet, and crazyhouse, atomic, storm and
 * racer are not standard chess at any speed. Folding them in would be exactly
 * the merge this module exists to refuse.
 *
 * 'puzzles' matches the key src/analysis/ratings.js and the Chess.com path
 * already use (TIME_CONTROLS), so both platforms land in the same column.
 */
const PERF_TIME_CONTROL = {
  bullet: 'bullet',
  blitz: 'blitz',
  rapid: 'rapid',
  classical: 'classical',
  correspondence: 'daily',
  puzzle: 'puzzles',
};

/** Stable row order, so two syncs of the same profile produce the same list. */
const PERF_ORDER = ['bullet', 'blitz', 'rapid', 'classical', 'correspondence', 'puzzle'];

export const PLATFORM = 'lichess';

/** Every id this module writes is namespaced, so ids cannot collide across sites. */
const ID_PREFIX = 'lichess:';

/**
 * A usable number, or null.
 *
 * The type check in front of Number() is the whole point. `Number(null)` is 0,
 * and so are `Number('')` and `Number(false)` — so a bare Number() call turns
 * "this player has no bullet rating" into "this player is rated 0". That is
 * the exact fabrication this module exists to prevent, and it arrives silently:
 * 0 is finite, so every downstream check passes. Only real numbers and strings
 * that spell one are accepted; everything else is absent, and absent is null.
 */
function finiteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * The ratings a Lichess profile actually supports, one entry per time
 * control, in a fixed order. Accepts either a raw Lichess API user object
 * (which has `perfs`) or the normalised profile fetchLichessProfile returns
 * (which has a flat `ratings` map and no deviations).
 *
 * A perf is skipped when it has no usable rating, and when the account has
 * never played it: Lichess hands back a placeholder 1500 for an untouched
 * perf, and storing that would invent a rating the player never earned.
 */
function perfRatings(profile) {
  if (!profile) return [];

  const perfs = profile.perfs;
  if (perfs && typeof perfs === 'object') {
    const rows = [];
    for (const name of PERF_ORDER) {
      const perf = perfs[name];
      if (!perf || typeof perf !== 'object') continue;

      const rating = finiteNumber(perf.rating);
      if (rating == null) continue;

      const games = finiteNumber(perf.games);
      // Never played: the number on offer is Lichess's placeholder, not a rating.
      if (games === 0) continue;

      const rd = finiteNumber(perf.rd);
      rows.push({
        timeControl: PERF_TIME_CONTROL[name],
        rating: Math.round(rating),
        // rd and games are integer columns; round rather than let Postgres decide.
        rd: rd == null ? null : Math.round(rd),
        games: games == null ? null : Math.round(games),
        // Lichess spells it `prov`; older payloads say `provisional`.
        provisional: Boolean(perf.prov ?? perf.provisional ?? false),
      });
    }
    return rows;
  }

  // Fallback: the already-normalised profile shape. Same one-row-per-time-
  // control rule, just with no deviation or game count to carry.
  const ratings = profile.ratings;
  if (!ratings || typeof ratings !== 'object') return [];
  // fetchLichessProfile writes an explicit null for every perf the account has
  // not played, so this filter is what keeps those out of the table. It only
  // works because finiteNumber refuses to coerce null into 0.
  const order = ['bullet', 'blitz', 'rapid', 'classical', 'daily', 'puzzles'];
  const rows = [];
  for (const key of order) {
    const rating = finiteNumber(ratings[key]);
    if (rating == null) continue;
    rows.push({
      timeControl: key,
      rating: Math.round(rating),
      // This shape carries no deviation or game count. Saying "not provisional"
      // is the closest honest thing available: the column is NOT NULL.
      rd: null,
      games: null,
      provisional: false,
    });
  }
  return rows;
}

/**
 * A Lichess profile's ratings as rows for player_platform_ratings.
 *
 * One row per time control, never merged, never blended with Chess.com.
 * Column names are snake_case because these rows go straight to the table.
 */
export function lichessRatingRows(playerId, profile, { fetchedAt = null } = {}) {
  if (!playerId) return [];
  const stamp = fetchedAt ?? new Date().toISOString();
  return perfRatings(profile).map((perf) => ({
    player_id: playerId,
    platform: PLATFORM,
    time_control: perf.timeControl,
    rating: perf.rating,
    rd: perf.rd,
    games: perf.games,
    provisional: perf.provisional,
    fetched_at: stamp,
  }));
}

/**
 * The id a game is filed under. Derived from the Lichess game id, so the same
 * game imported twice lands on the same id and the archive de-duplicates it
 * instead of growing a second copy. Never randomised, never time-based.
 */
function archiveId(game) {
  const external = game?.externalId;
  if (typeof external === 'string' && external.startsWith(ID_PREFIX)) return external;
  // An id already namespaced to another site is not ours to re-file. Prefixing
  // it would mint 'lichess:chesscom:<uuid>' and hide a Chess.com game inside
  // the Lichess archive under an id nothing else will ever look up.
  if (typeof external === 'string' && external.includes(':')) return null;
  const id = external || game?.id || game?.gameId;
  if (!id || typeof id !== 'string' || id.includes(':')) return null;
  return `${ID_PREFIX}${id}`;
}

/**
 * Normalised Lichess games (from normalizeLichessGame) to the records
 * gamesStore.recordExternalGames expects.
 *
 * The member is whichever side they played; the other side stays a bare name,
 * because an online opponent is not a club member and must never be given a
 * club player id.
 */
export function toArchiveRecords(playerId, games) {
  if (!Array.isArray(games)) return [];
  const records = [];
  const seen = new Set();

  for (const game of games) {
    if (!game) continue;
    if (game.platform && game.platform !== PLATFORM) continue;
    // Which side the member held decides which player id the game is filed
    // under, and colour-split stats read straight off that. A record with no
    // colour would default to black and quietly attribute the whole game to
    // the wrong side, so it is dropped instead of guessed.
    if (game.color !== 'white' && game.color !== 'black') continue;

    const id = archiveId(game);
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const white = game.color === 'white';
    records.push({
      id,
      playedAt: game.playedAt || null,
      whitePlayerId: white ? playerId : '',
      blackPlayerId: white ? '' : playerId,
      whiteName: game.whiteName || 'Anonymous',
      blackName: game.blackName || 'Anonymous',
      result: game.result || '*',
      reason: game.reason || '',
      moveCount: finiteNumber(game.moveCount) ?? 0,
      mode: PLATFORM,
      // Explicit, not omitted: gamesStore.toRow reads this key by name, and the
      // Chess.com path sets it too. An imported game has no engine strength.
      computerElo: null,
      pgn: game.pgn || '',
    });
  }

  return records;
}

/**
 * One sync in the few facts the UI shows: who was synced, how many games came
 * back, and what each rating stands at now — still one entry per time
 * control, still unmerged.
 */
export function summariseSync(profile, games) {
  const ratings = {};
  for (const perf of perfRatings(profile)) {
    ratings[perf.timeControl] = {
      rating: perf.rating,
      rd: perf.rd,
      games: perf.games,
      provisional: perf.provisional,
    };
  }

  return {
    platform: PLATFORM,
    username: profile?.username || '',
    // What actually gets filed, not what arrived. toArchiveRecords drops
    // duplicates, colourless records and games from another site; counting the
    // input instead would promise the member more games than the archive holds.
    imported: toArchiveRecords('', games).length,
    ratings,
  };
}
