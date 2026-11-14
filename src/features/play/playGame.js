/*
 * playGame.js — the Play page's pure helpers: rebuilding a game from saved
 * moves, replaying to a ply, and counting material. No React, so tested in
 * Node (playGame.test.js).
 */
import { Chess } from '../../engine/chess.js';

const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const START_COUNTS = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };

/** Rebuild a game from a saved move list, stopping early if storage is corrupt. */
export function buildGame(savedMoves) {
  const game = new Chess();
  if (!Array.isArray(savedMoves)) return game;
  for (const m of savedMoves) {
    if (!game.move({ from: m.from, to: m.to, promotion: m.promotion })) break;
  }
  return game;
}

/** Rebuild the position as it stood after `ply` half-moves. */
export function replay(moves, ply) {
  const game = new Chess();
  for (let i = 0; i < ply; i += 1) {
    const move = moves[i];
    game.move({ from: move.from, to: move.to, promotion: move.promotion });
  }
  return game;
}

/** What each side has captured, and who is up on material. */
export function materialSummary(game) {
  const remaining = { w: {}, b: {} };
  for (const row of game.boardArray()) {
    for (const cell of row) {
      if (!cell) continue;
      remaining[cell.color][cell.type] = (remaining[cell.color][cell.type] || 0) + 1;
    }
  }
  const captured = { w: [], b: [] };
  let score = 0;
  for (const color of ['w', 'b']) {
    for (const [type, start] of Object.entries(START_COUNTS)) {
      const missing = start - (remaining[color][type] || 0);
      for (let i = 0; i < missing; i += 1) captured[color === 'w' ? 'b' : 'w'].push(type);
      score += (color === 'w' ? -1 : 1) * missing * PIECE_VALUES[type];
    }
  }
  return { captured, score };
}
