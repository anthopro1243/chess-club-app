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
 * printName() uses privacy.js's publicName(): a full name only with a media
 * release on file (player.mediaRelease === true), initials otherwise. A
 * player who has left the roster has no release on record, so initials.
 */

import { publicName } from '../../data/privacy.js';

/** Name for on-screen use. `entrant` is an entrant row (name snapshot + playerId). */
export function screenName(entrant) {
  return entrant?.name || entrant?.playerId || '—';
}

/**
 * Name for printed sheets. `player` is the live roster row for the entrant
 * (carries mediaRelease once privacy.js lands), or null if they left the roster.
 */
export function printName(entrant, player) {
  return publicName(player ? { ...player, name: player.name || screenName(entrant) } : { name: screenName(entrant) });
}
