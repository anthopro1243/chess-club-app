/*
 * gameAccess.js — who may log a game. Mirrors the database rule in migration
 * 0026: a coach logs anything; a member logs games they played in, or games
 * with no club player on either side. Checked in the forms first, so a
 * member hears why before the server refuses.
 */

/** null when allowed, otherwise the sentence to show. */
export function gameEntryProblem({ cloud = true, isCoach = false, myPlayerId = null, whitePlayerId = '', blackPlayerId = '' }) {
  if (!cloud || isCoach) return null;
  if (!whitePlayerId && !blackPlayerId) return null;
  if (myPlayerId && (whitePlayerId === myPlayerId || blackPlayerId === myPlayerId)) return null;
  return 'You can log games you played in. For other members’ games, ask the coach.';
}
