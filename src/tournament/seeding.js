/*
 * seeding.js — which rating a club event seeds by, and saying so.
 *
 * ratings.js explains why the app never blends Lichess, Chess.com and US
 * Chess numbers: they are different pools and no honest conversion exists.
 * A Swiss still needs ONE ordered list, so the coach picks ONE source per
 * event (F083) and every entrant is seeded on that source alone. A player
 * with no rating on that source is "unrated" for this event and seeds below
 * everyone rated — they are not quietly given a number from another scale.
 *
 * The rating is snapshotted onto the entrant when they are entered, as US
 * Chess does: seeding must not shift mid-event because somebody played a
 * blitz game online on Wednesday.
 *
 * Pure: no React, no Supabase.
 */

export const RATING_SOURCES = [
  { id: 'club', label: 'Club rating' },
  { id: 'uscf', label: 'US Chess' },
  { id: 'chesscomRapid', label: 'Chess.com rapid' },
  { id: 'lichessRapid', label: 'Lichess rapid' },
];

// Club rating is the default because it is the one number every member has a
// chance of owning; most of the club has no US Chess rating yet.
export const DEFAULT_RATING_SOURCE = 'club';

export function ratingSourceLabel(sourceId) {
  return RATING_SOURCES.find((s) => s.id === sourceId)?.label || 'Unknown source';
}

function asRating(value) {
  const n = Number(value);
  return value != null && value !== '' && Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/**
 * A roster player's rating on one source, or null.
 *
 * The club Glicko rating starts every member at 1500 with no games behind it
 * (glicko2.js DEFAULT_RATING). That 1500 is a placeholder, not a measurement,
 * so a club rating with no rated games counts as unrated here — otherwise a
 * brand-new member would be seeded in the top half on a number nobody earned.
 */
export function ratingFor(player, sourceId) {
  if (!player) return null;
  switch (sourceId) {
    case 'uscf':
      return asRating(player.ratings?.uscf);
    case 'club': {
      const club = player.clubRating;
      if (!club || club.rating == null) return null;
      const count = club.count ?? null;
      if (count === 0) return null;
      if (count == null && Math.round(club.rating) === 1500) return null;
      return asRating(club.rating);
    }
    case 'chesscomRapid':
      return asRating(player.ratings?.chesscomRapid ?? player.connections?.chesscom?.ratings?.rapid);
    case 'lichessRapid':
      return asRating(player.ratings?.lichessRapid ?? player.connections?.lichess?.ratings?.rapid);
    default:
      return null;
  }
}

/** "1234 Club rating" or "unrated (US Chess)" — the label every seeding number carries. */
export function describeRating(rating, sourceId) {
  const label = ratingSourceLabel(sourceId);
  return rating == null ? `unrated (${label})` : `${rating} ${label}`;
}

/**
 * Seed order: rating high to low, unrated last, then name, then id, so two
 * runs over the same entrants always produce the same list.
 */
export function compareSeeds(a, b) {
  const ra = a.rating ?? -Infinity;
  const rb = b.rating ?? -Infinity;
  if (ra !== rb) return rb - ra;
  const byName = String(a.name || '').localeCompare(String(b.name || ''));
  if (byName) return byName;
  return String(a.playerId).localeCompare(String(b.playerId));
}

/** Entrant snapshots for a list of roster players, seeded on one source. */
export function seedEntrants(players, sourceId) {
  return (players || [])
    .filter((p) => p && p.playerId)
    .map((p) => ({
      playerId: p.playerId,
      name: p.name || p.playerId,
      rating: ratingFor(p, sourceId),
      ratingSource: sourceId,
    }))
    .sort(compareSeeds);
}

/** How many of these players have a rating on the source — shown next to the picker. */
export function coverage(players, sourceId) {
  const list = (players || []).filter(Boolean);
  const rated = list.filter((p) => ratingFor(p, sourceId) != null).length;
  return { rated, total: list.length };
}
