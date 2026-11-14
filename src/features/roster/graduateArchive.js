/*
 * graduateArchive.js — archive a graduating member (research F120).
 *
 * The SCOPE Act asks schools' tools to "limit the collection and use of a
 * minor's personally identifiable information". Once a student graduates the
 * club has no reason to keep who they were, but their games, ratings and
 * analyses still count toward the club's history and statistics.
 *
 * So archiving keeps the numbers and removes the person:
 *   - removed: name (replaced by "Graduate CC-0xx"), linked accounts and the
 *     US Chess ID (`connections`), guardian email, goal, style, training
 *     focus, the coach's note, and the private student ID and school email;
 *   - replaced in their games: the name in white_name / black_name and in the
 *     PGN's White / Black headers;
 *   - kept: ratings, rating history, skill scores, analyses, puzzle stats,
 *     grade and join date.
 * The member is then retired (soft-deleted) as before.
 *
 * Pure: this returns the changes; rosterStore / gamesStore apply them.
 */

/** The name an archived member is shown under from now on. */
export const archivedName = (playerId) => `Graduate ${playerId}`;

/** Already archived? (Archiving twice is harmless, but the UI says so.) */
export const isArchived = (player) => !!player && player.name === archivedName(player.playerId);

/** The fields to write onto the player row. */
export function archivedPlayerPatch(player) {
  return {
    name: archivedName(player.playerId),
    guardianEmail: '',
    connections: {},
    goal: '',
    style: '',
    trainingFocus: '',
    coachNotes: '',
  };
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Replace the White / Black header value `name` with `label` in a PGN. */
export function scrubPgnName(pgn, name, label) {
  if (!pgn || !name) return pgn || '';
  const safeLabel = label.replace(/"/g, "'");
  return pgn.replace(
    new RegExp(`^\\[(White|Black)\\s+"${escapeRegExp(name)}"\\]`, 'gm'),
    (_, side) => `[${side} "${safeLabel}"]`,
  );
}

/**
 * The game rows to rewrite: every game this member played, with their name
 * replaced on their own side only. The opponent's name is left alone.
 *
 * @returns {{ id, whiteName?, blackName?, pgn }[]}
 */
export function archivedGameUpdates(player, games = []) {
  const label = archivedName(player.playerId);
  const updates = [];
  for (const game of games) {
    if (!game) continue;
    const isWhite = game.whitePlayerId === player.playerId;
    const isBlack = game.blackPlayerId === player.playerId;
    if (!isWhite && !isBlack) continue;
    const update = { id: game.id };
    let pgn = game.pgn || '';
    if (isWhite) {
      update.whiteName = label;
      pgn = scrubPgnName(pgn, game.whiteName, label);
    }
    if (isBlack) {
      update.blackName = label;
      pgn = scrubPgnName(pgn, game.blackName, label);
    }
    // Also catch the roster name if the game stored a differently-spelled one.
    if (player.name && player.name !== game.whiteName && player.name !== game.blackName) {
      pgn = scrubPgnName(pgn, player.name, label);
    }
    update.pgn = pgn;
    updates.push(update);
  }
  return updates;
}

/** Everything the archive will change, for the confirmation screen and the stores. */
export function archivePlan(player, games = []) {
  if (!player?.playerId) return null;
  return {
    playerId: player.playerId,
    label: archivedName(player.playerId),
    playerPatch: archivedPlayerPatch(player),
    gameUpdates: archivedGameUpdates(player, games),
  };
}

/** The confirmation must be the member's name, exactly (ignoring case and outer spaces). */
export const confirmsArchive = (player, typed) =>
  !!player?.name && String(typed || '').trim().toLowerCase() === player.name.trim().toLowerCase();
