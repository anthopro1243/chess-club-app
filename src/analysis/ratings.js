/*
 * ratings.js — making Lichess, Chess.com and USCF numbers comparable without
 * pretending they are the same number.
 *
 * THE DECISION, AND WHY.
 *
 * There is no official conversion between Lichess, Chess.com, FIDE and USCF,
 * and no unofficial one worth hard-coding. Three separate problems stack up:
 *
 *   1. Different scales. Both sites use Glicko variants, but each seeds and
 *      inflates its own pool independently. The same player is typically
 *      several hundred points higher on Lichess than on Chess.com, and the gap
 *      is not constant - it varies by rating band.
 *   2. Different time controls. Each platform keeps a separate rating per
 *      speed. A player's bullet and rapid numbers are not interchangeable,
 *      and averaging them describes nobody.
 *   3. Different populations. A rating is a position within a pool. Two pools
 *      with different memberships cannot be related by a constant offset.
 *
 * Community regressions exist. They are fitted on self-selected samples, they
 * disagree with each other by more than the effect they claim to measure, and
 * they drift as each site re-rates its pool. Baking one in would manufacture
 * precision this club cannot check and would quietly corrupt every downstream
 * score - which is precisely the class of error scoring.js exists to avoid.
 *
 * So: every raw number is stored per (platform, time control) and NEVER
 * merged. When something genuinely needs one comparable number - a leaderboard,
 * a rating anchor, recalibrationReport - we normalise the only honest way
 * available, which is CLUB-RELATIVE: where does this player sit among the
 * club members measured on the SAME platform and time control? That is the
 * same club-relative logic recalibrationReport already applies to skill
 * scores, and it needs no cross-platform constant to be true.
 *
 * A coach can override the result outright, the same way coach_note overrides
 * engine commentary and a manual rubric score overrides a suggestion.
 */

/** Time controls each platform reports. Kept apart on purpose. */
export const TIME_CONTROLS = ['bullet', 'blitz', 'rapid', 'classical', 'daily', 'puzzles'];

export const PLATFORMS = ['chesscom', 'lichess', 'uscf', 'fide'];

/**
 * The club's canonical basis for a single comparable number.
 *
 * A platform rating is not comparable ACROSS platforms or time controls - but
 * two players measured on the SAME platform at the SAME speed are in the same
 * pool, and that IS a fair comparison. So the club names one basis, everyone
 * measured on it is ranked together, and everyone else is listed separately
 * with their own number labelled rather than silently ranked against a
 * different scale.
 *
 * Coach-configurable; this is only the default.
 */
export const DEFAULT_CLUB_BASIS = Object.freeze({ platform: 'chesscom', timeControl: 'rapid' });

/** Where a resolved rating came from, most trusted first. */
export const PROVENANCE = ['coach', 'uscf', 'fide', 'club', 'platform', 'none'];

/**
 * Flatten a platform profile's ratings block into storable rows.
 * One row per (platform, time control). Nothing is combined.
 */
export function toRatingRows(playerId, platform, ratings, { fetchedAt = null } = {}) {
  if (!playerId || !platform || !ratings) return [];
  return Object.entries(ratings)
    .filter(([, value]) => value != null && Number.isFinite(Number(value)))
    .map(([timeControl, value]) => ({
      player_id: playerId,
      platform,
      time_control: timeControl,
      rating: Math.round(Number(value)),
      fetched_at: fetchedAt ?? new Date().toISOString(),
    }));
}

/**
 * Percentile of `value` within `population` (0-100). The honest way to make
 * two different scales comparable: not "1500 Lichess equals 1200 Chess.com",
 * but "this player is in the 60th percentile of the club members we can
 * measure the same way".
 */
export function percentileOf(value, population) {
  const xs = (population || []).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!xs.length || !Number.isFinite(value)) return null;
  if (xs.length === 1) return 50;
  let below = 0;
  let equal = 0;
  for (const x of xs) {
    if (x < value) below += 1;
    else if (x === value) equal += 1;
  }
  return Math.round(((below + equal / 2) / xs.length) * 100);
}

/**
 * A club-relative index for one player on one (platform, time control),
 * computed only against club members measured the same way.
 *
 * @param {{platform: string, timeControl: string, rating: number}} entry
 * @param {Array<{playerId: string, platform: string, timeControl: string, rating: number}>} clubRows
 */
export function clubRelativeIndex(entry, clubRows) {
  if (!entry || !Number.isFinite(entry.rating)) return null;
  const peers = (clubRows || [])
    .filter((r) => r.platform === entry.platform && r.timeControl === entry.timeControl)
    .map((r) => Number(r.rating))
    .filter(Number.isFinite);
  // One data point is not a distribution. Saying "50th percentile of one" would
  // be a number with no information in it.
  if (peers.length < 2) return null;
  return {
    percentile: percentileOf(entry.rating, peers),
    peers: peers.length,
    platform: entry.platform,
    timeControl: entry.timeControl,
  };
}

/**
 * The single number to show for a player, with where it came from.
 *
 * Precedence is deliberate and never averages across sources:
 *   1. a coach override            - a human looked at this player
 *   2. an official rating (USCF/FIDE) - an actual federation pool
 *   3. the club's own Glicko       - earned inside this club, same pool
 *   4. a platform rating           - labelled with platform AND time control
 *
 * Returns { rating, provenance, label, comparable } where `comparable` says
 * whether this number may be ranked against other players' numbers. A platform
 * rating is NOT comparable across platforms, and the leaderboard must respect
 * that rather than sorting them into one column.
 */
export function resolveRating({
  override = null,
  official = null,
  clubRating = null,
  platformRatings = [],
  basis = DEFAULT_CLUB_BASIS,
  preferredOrder = ['rapid', 'blitz', 'classical', 'bullet', 'daily'],
} = {}) {
  if (override?.clubRating != null) {
    return {
      rating: override.clubRating,
      provenance: 'coach',
      label: 'set by coach',
      comparable: true,
      note: override.note ?? null,
    };
  }
  if (official?.rating != null) {
    return {
      rating: official.rating,
      provenance: official.platform === 'fide' ? 'fide' : 'uscf',
      label: official.platform === 'fide' ? 'FIDE' : 'USCF',
      comparable: true,
    };
  }
  if (clubRating != null) {
    return { rating: Math.round(clubRating), provenance: 'club', label: 'club rating', comparable: true };
  }
  const usable = (platformRatings || []).filter((r) => r.rating != null && r.timeControl !== 'puzzles');

  // The club's chosen basis: same platform, same speed, same pool - so these
  // players may legitimately be ranked against one another.
  const onBasis = basis
    ? usable.find((r) => r.platform === basis.platform && r.timeControl === basis.timeControl)
    : null;
  if (onBasis) {
    return {
      rating: onBasis.rating,
      provenance: 'platform',
      label: `${onBasis.platform === 'lichess' ? 'Lichess' : 'Chess.com'} ${onBasis.timeControl}`,
      comparable: true,
      basis: true,
    };
  }

  if (usable.length) {
    // Pick ONE, by a stated preference. Never blend two.
    const pick =
      preferredOrder.map((tc) => usable.find((r) => r.timeControl === tc)).find(Boolean) ?? usable[0];
    return {
      rating: pick.rating,
      provenance: 'platform',
      label: `${pick.platform === 'lichess' ? 'Lichess' : 'Chess.com'} ${pick.timeControl}`,
      // The crucial flag: this number means something about the player, but
      // nothing when ranked against a different platform or speed.
      comparable: false,
    };
  }
  return { rating: null, provenance: 'none', label: 'unrated', comparable: false };
}

/**
 * Rank a set of players for a leaderboard without ever comparing across
 * incomparable scales. Players with a comparable rating are ranked normally;
 * the rest are returned separately, labelled, rather than silently interleaved.
 */
export function rankForLeaderboard(entries) {
  const ranked = [];
  const unranked = [];
  for (const entry of entries || []) {
    const resolved = entry.resolved ?? resolveRating(entry);
    const row = { ...entry, resolved };
    if (resolved.rating != null && resolved.comparable) ranked.push(row);
    else unranked.push(row);
  }
  ranked.sort((a, b) => b.resolved.rating - a.resolved.rating);
  return { ranked, unranked };
}

/**
 * Whether a rating may be used as an anchor inside scoring. Only ratings from
 * one shared pool qualify: a Lichess blitz number cannot calibrate a club
 * whose other members are measured on Chess.com rapid.
 */
export function usableAsScoringAnchor(resolved) {
  return !!resolved && resolved.rating != null && resolved.comparable;
}
