/*
 * reviewQueue.js — which games a player should go over next (research F091).
 *
 * Games played in person (entered from a scoresheet with its event, round or
 * board filled in) come first: they are the games that count, and the
 * ones a player remembers least clearly. After those, the recent games with
 * the most big mistakes, since that is where the lessons are. A game leaves
 * the queue once it is marked reviewed (games.reviewed_at, 0024).
 *
 * Pure: the page passes the games and analyses it already holds.
 */

export const REVIEW_WINDOW_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

const toMs = (value) => {
  const t = Date.parse(value ?? '');
  return Number.isFinite(t) ? t : null;
};

/** A game played over the board rather than online or against the computer. */
export const isOverTheBoard = (game) =>
  !!(game?.event || game?.round || (game?.board != null && game.board !== '') || game?.mode === 'otb');

/**
 * The queue for one player, most important first.
 *
 * @returns {{ gameId, playedAt, opponent, side, otb, analysed, blunders, mistakes, reason }[]}
 */
export function reviewQueueFor(playerId, { games = [], analyses = [], now = Date.now(), windowDays = REVIEW_WINDOW_DAYS } = {}) {
  if (!playerId) return [];
  const since = now - windowDays * DAY_MS;
  const items = [];
  for (const game of games) {
    if (!game || game.deletedAt || game.reviewedAt) continue;
    const side = game.whitePlayerId === playerId ? 'w' : game.blackPlayerId === playerId ? 'b' : null;
    if (!side) continue;
    const played = toMs(game.playedAt);
    if (played == null || played < since || played > now) continue;

    const row = analyses.find((a) => a && a.gameId === game.id && a.playerId === playerId);
    const blunders = Number(row?.counts?.blunder) || 0;
    const mistakes = Number(row?.counts?.mistake) || 0;
    const otb = isOverTheBoard(game);
    // Online games only earn a place by having something to learn from.
    if (!otb && blunders === 0 && mistakes < 2) continue;

    items.push({
      gameId: game.id,
      playedAt: game.playedAt,
      opponent: side === 'w' ? game.blackName : game.whiteName,
      side,
      result: game.result,
      otb,
      event: game.event || '',
      round: game.round || '',
      analysed: !!row,
      blunders,
      mistakes,
      reason: otb
        ? `Played in person${game.event ? ` at ${game.event}${game.round ? `, round ${game.round}` : ''}` : ''}`
        : `${blunders} big mistake${blunders === 1 ? '' : 's'}${mistakes ? `, ${mistakes} smaller` : ''}`,
    });
  }
  return items.sort(
    (a, b) =>
      Number(b.otb) - Number(a.otb) ||
      b.blunders - a.blunders ||
      b.mistakes - a.mistakes ||
      (toMs(b.playedAt) ?? 0) - (toMs(a.playedAt) ?? 0),
  );
}

/** Every active player's queue, players with the most waiting first. */
export function clubReviewQueue(players = [], data = {}) {
  return players
    .filter((p) => p?.playerId && !p.deletedAt)
    .map((p) => ({ playerId: p.playerId, name: p.name || p.playerId, items: reviewQueueFor(p.playerId, data) }))
    .filter((row) => row.items.length > 0)
    .sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
}
