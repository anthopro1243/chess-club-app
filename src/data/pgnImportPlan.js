/*
 * pgnImportPlan.js — between `importPgnText()` and the archive.
 *
 * pgnImport.js turns a file into archive-shaped records and matches names
 * conservatively. What it cannot know is who actually sat at the board: an
 * over-the-board scoresheet typed up on a Tuesday says "Ada" or nothing at
 * all. So the Games page shows a preview with a player picker per side, and
 * this module owns the rules for turning those choices into rows:
 *
 *   - a game already in the archive is marked, not re-imported (same stable
 *     id from pgnImport.js, so importing a file twice is harmless);
 *   - the same member cannot play both sides;
 *   - a picked member's roster name replaces a placeholder tag ("?",
 *     "White"), but a real tag name is kept — it is what the scoresheet says;
 *   - a game with no usable date is not given one silently: the caller must
 *     pass the date the coach chose, and without one the game is held back.
 *
 * Pure: no React, no store writes, no network.
 */

import { importPgnText } from './pgnImport.js';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse a file into preview rows.
 *
 * @param {string} text
 * @param {{roster?: Array<{playerId: string, name: string}>, existingIds?: Iterable<string>, playerId?: string|null}} options
 * @returns {{rows: Array<object>, errors: Array<{index: number, message: string}>}}
 */
export function planPgnImport(text, { roster = [], existingIds = [], playerId = null } = {}) {
  const known = new Set(existingIds || []);
  const { games, errors } = importPgnText(text, { roster, playerId });
  const rows = games.map((game) => ({
    game,
    whitePlayerId: game.whitePlayerId || '',
    blackPlayerId: game.blackPlayerId || '',
    playedOn: game.playedAt ? game.playedAt.slice(0, 10) : '',
    needsDate: !game.playedAt,
    alreadyArchived: known.has(game.id),
    include: !known.has(game.id),
  }));
  return { rows, errors };
}

/** Why a preview row cannot be imported as it stands, or null if it can. */
export function rowProblem(row) {
  if (!row || !row.game) return 'Nothing to import.';
  if (row.alreadyArchived) return 'Already in the archive.';
  if (row.whitePlayerId && row.whitePlayerId === row.blackPlayerId) {
    return 'The same member cannot play both sides.';
  }
  if (row.needsDate && !DATE_ONLY.test(row.playedOn || '')) {
    return 'The PGN has no date — pick the day it was played.';
  }
  return null;
}

function isPlaceholder(name, side) {
  const trimmed = String(name ?? '').trim();
  return !trimmed || trimmed === side || trimmed === '?';
}

function sideName(tagName, pickedId, roster, fallback) {
  const player = pickedId ? roster.find((p) => p.playerId === pickedId) : null;
  if (player && isPlaceholder(tagName, fallback)) return player.name;
  return tagName || fallback;
}

/**
 * The archive records to write, from the rows the coach left ticked.
 * Rows with a problem are never returned, whatever their tick says.
 */
export function recordsToImport(rows = [], roster = []) {
  const out = [];
  for (const row of rows || []) {
    if (!row?.include || rowProblem(row)) continue;
    const { game } = row;
    out.push({
      ...game,
      whitePlayerId: row.whitePlayerId || '',
      blackPlayerId: row.blackPlayerId || '',
      whiteName: sideName(game.whiteName, row.whitePlayerId, roster, 'White'),
      blackName: sideName(game.blackName, row.blackPlayerId, roster, 'Black'),
      // Noon UTC, so the chosen day reads the same in every US time zone.
      playedAt: game.playedAt || `${row.playedOn}T12:00:00.000Z`,
    });
  }
  return out;
}

/** Counts for the preview's summary line. */
export function summarise(rows = [], errors = []) {
  let ready = 0;
  let archived = 0;
  let blocked = 0;
  for (const row of rows) {
    if (row.alreadyArchived) archived += 1;
    else if (rowProblem(row)) blocked += 1;
    else if (row.include) ready += 1;
  }
  return { ready, archived, blocked, errors: errors.length };
}
