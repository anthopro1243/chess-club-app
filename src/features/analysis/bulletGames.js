/*
 * bulletGames.js — which games the engine should not spend time on.
 *
 * Bullet (a minute or two a side) is mostly premoves and flagging: the
 * engine's verdict on a scramble says little about how someone plays, and a
 * month of bullet would swamp the in-browser queue. Bullet games are still
 * imported and still count towards the club rating; they are just marked
 * 'skipped' with this reason, the way a retired member's games are.
 *
 * The games table has no time-class column, so a game already in the queue is
 * recognised from its own PGN TimeControl tag, using each site's own rule:
 * Chess.com calls anything under three minutes of base time bullet; Lichess
 * counts the base plus 40 moves of increment, under 180 seconds.
 *
 * Pure: no React, no Supabase.
 */

import { parsePgnTimeControl, ESTIMATE_MOVES } from '../games/timeControl.js';

export const BULLET_SKIP_REASON = 'skipped: bullet games are not analysed automatically';

const BULLET_BELOW_SECONDS = 180;
const TAG_RE = /\[TimeControl\s+"([^"]*)"\]/;

/**
 * True for a bullet game from Chess.com or Lichess. Accepts either the
 * store's shape (`mode`, `pgn`) or a table row (the same two names), and
 * trusts an explicit `timeClass` when the sync has just told us one.
 */
export function isBulletGame(game) {
  if (!game) return false;
  if (game.timeClass) return game.timeClass === 'bullet';
  const mode = game.mode;
  if (mode !== 'chesscom' && mode !== 'lichess') return false;
  const tag = TAG_RE.exec(String(game.pgn || ''));
  const tc = tag ? parsePgnTimeControl(tag[1]) : null;
  if (!tc || tc.daily) return false;
  const seconds = mode === 'lichess'
    ? tc.baseSeconds + ESTIMATE_MOVES * (tc.incrementSeconds || 0)
    : tc.baseSeconds;
  return seconds < BULLET_BELOW_SECONDS;
}

/** Split queue candidates into ones to analyse and bullet games to mark skipped. */
export function partitionBulletGames(candidates = []) {
  const analyse = [];
  const skip = [];
  for (const game of candidates || []) {
    (isBulletGame(game) ? skip : analyse).push(game);
  }
  return { analyse, skip };
}
