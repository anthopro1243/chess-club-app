/*
 * names.js — every name the Events feature shows goes through one of these.
 *
 * On screen the audience is approved club members, who already see full
 * names on the roster, so screenName() is the entrant's name as entered.
 *
 * On PAPER it is different: pairings, standings and the wall chart are taped
 * up in a school room where anyone walking past can read them, and Dallas ISD
 * guidance is not to publish a student's name without a media release on file.
 * printName() is the single place that decides a printed name.
 *
 * MERGE POINT: the main branch has src/data/privacy.js with
 * publicName(player) (full name only when player.mediaRelease === true,
 * otherwise initials). This branch predates it, so printName() still returns
 * the full name. At merge, replace its body with
 *   return publicName(player || { name: screenName(entrant) });
 * and every printed sheet follows the media-release rule.
 */

/** Name for on-screen use. `entrant` is an entrant row (name snapshot + playerId). */
export function screenName(entrant) {
  return entrant?.name || entrant?.playerId || '—';
}

/**
 * Name for printed sheets. `player` is the live roster row for the entrant
 * (carries mediaRelease once privacy.js lands), or null if they left the roster.
 */
// `player` is unused until the merge swaps in publicName(player).
export function printName(entrant, player) {
  return screenName(entrant);
}
