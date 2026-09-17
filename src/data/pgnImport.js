/*
 * pgnImport.js — turning a PGN file into club archive records.
 *
 * A coach drops in a file exported from a tournament pairing program, a
 * phone app, or Chess.com, and gets back rows shaped exactly like the ones
 * `gamesStore` already stores. Three things matter more than convenience:
 *
 *   1. Every game is replayed through the engine before it is accepted. A
 *      move the engine will not play is a move the analyzer would either
 *      crash on or silently mis-score, so the game is rejected by name —
 *      "illegal move 5. Qh8" — instead of being quietly truncated.
 *   2. One bad game does not sink the file. Tournament exports are long and
 *      one mangled game in forty is normal; the other thirty-nine still
 *      import and the bad one comes back as an error the coach can read.
 *   3. Names are matched conservatively. Attributing a game to the wrong
 *      child corrupts that child's rating, their puzzle set and their
 *      coach report, so an uncertain match returns null and the game is
 *      stored with the names but no player id.
 *
 * Parsing itself lives in src/analysis/pgn.js and is not repeated here.
 *
 * This module is pure logic: no React, no store writes, no network.
 */

import { parseAndValidate } from '../analysis/pgn.js';

/** Tag values that mean "nobody filled this in". */
const PLACEHOLDER_NAMES = new Set(['', '?', '??', '-', 'n.n.', 'nn', 'unknown', 'tbd']);

/** Termination-tag wording -> the plain words the archive uses for `reason`. */
const TERMINATION_PATTERNS = [
  [/checkmate|mated/i, 'Checkmate'],
  [/resign/i, 'Resignation'],
  [/time\s*forfeit|on time|timeout|ran out of time/i, 'Time'],
  [/stalemate/i, 'Stalemate'],
  [/repetition/i, 'Repetition'],
  [/insufficient/i, 'Insufficient material'],
  [/fifty|50[-\s]?move/i, 'Fifty-move rule'],
  [/agree|mutual/i, 'Agreement'],
  [/abandon/i, 'Abandoned'],
  [/adjudicat/i, 'Adjudication'],
  [/forfeit|infraction|default/i, 'Forfeit'],
];

// ---------------------------------------------------------------------------
// Splitting a file into per-game chunks
// ---------------------------------------------------------------------------

const WHITESPACE = new Set([' ', '\t', '\r', '\n', '\f', '\v']);
const TAG_START = /^\[\s*[A-Za-z0-9_+#=:-]+[\s"]/;

/** End index of a `{ ... }` comment beginning at `start`, nesting allowed. */
function endOfBraceComment(src, start) {
  let depth = 0;
  let j = start;
  while (j < src.length) {
    const c = src[j];
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth <= 0) return j + 1;
    }
    j += 1;
  }
  return src.length;
}

/** End index of a `( ... )` variation beginning at `start`. */
function endOfVariation(src, start) {
  let depth = 0;
  let j = start;
  while (j < src.length) {
    const c = src[j];
    if (c === '{') {
      j = endOfBraceComment(src, j);
      continue;
    }
    if (c === ';') {
      while (j < src.length && src[j] !== '\n') j += 1;
      continue;
    }
    if (c === '(') depth += 1;
    else if (c === ')') {
      depth -= 1;
      if (depth <= 0) return j + 1;
    }
    j += 1;
  }
  return src.length;
}

/** End index of a `[Tag "value"]` pair beginning at `start`. */
function endOfTag(src, start) {
  let j = start + 1;
  let inQuotes = false;
  while (j < src.length) {
    const c = src[j];
    if (c === '\\' && inQuotes) {
      j += 2;
      continue;
    }
    if (c === '"') inQuotes = !inQuotes;
    else if (c === ']' && !inQuotes) return j + 1;
    else if (c === '\n' && !inQuotes) return j; // malformed tag: stop at the line end
    j += 1;
  }
  return src.length;
}

/**
 * Cut a multi-game PGN into one string per game, preserving the original
 * text byte for byte — comments, clocks and all — so the stored PGN is what
 * the coach's file actually said.
 *
 * The boundary rule is the same one `parsePgn()` uses internally: a tag pair
 * that appears after movetext has started opens the next game. Braces,
 * `;` comments and variations are skipped so a `[%clk ...]` marker or a
 * bracketed note inside a comment never looks like a new game header.
 *
 * @param {string} text
 * @returns {string[]} one chunk per game, each non-blank
 */
export function splitPgnGames(text) {
  if (typeof text !== 'string') return [];
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const chunks = [];
  let start = 0;
  let inMovetext = false;
  let i = 0;

  const flush = (end) => {
    const chunk = src.slice(start, end);
    if (chunk.trim()) chunks.push(chunk);
  };

  while (i < src.length) {
    const ch = src[i];

    if (WHITESPACE.has(ch)) {
      i += 1;
      continue;
    }
    // PGN escape mechanism: '%' in column 1 comments out the line.
    if (ch === '%' && (i === 0 || src[i - 1] === '\n')) {
      while (i < src.length && src[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '{') {
      inMovetext = true;
      i = endOfBraceComment(src, i);
      continue;
    }
    if (ch === ';') {
      inMovetext = true;
      while (i < src.length && src[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '(') {
      inMovetext = true;
      i = endOfVariation(src, i);
      continue;
    }
    if (ch === '[' && TAG_START.test(src.slice(i, i + 40))) {
      if (inMovetext) {
        flush(i);
        start = i;
        inMovetext = false;
      }
      i = endOfTag(src, i);
      continue;
    }
    inMovetext = true;
    i += 1;
  }

  flush(src.length);
  return chunks;
}

// ---------------------------------------------------------------------------
// Stable ids
// ---------------------------------------------------------------------------

/** FNV-1a over UTF-16 code units, both bytes mixed so accents matter. */
function fnv1a(str, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    const c = str.charCodeAt(i);
    h = Math.imul(h ^ (c & 0xff), 0x01000193) >>> 0;
    h = Math.imul(h ^ ((c >>> 8) & 0xff), 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function hex8(n) {
  return (n >>> 0).toString(16).padStart(8, '0');
}

/** The tags that identify a game. Ordered, so the key is reproducible. */
const ID_TAGS = ['Event', 'Site', 'Date', 'UTCDate', 'Round', 'White', 'Black', 'Result', 'FEN'];

/**
 * A deterministic id for a parsed game: the identifying tags plus a hash of
 * the movetext, prefixed `pgn:`. Re-importing the same file produces the
 * same ids, so `dedupe()` can drop the second copy instead of the archive
 * growing a duplicate every time someone hits import twice.
 *
 * Only the SAN of the mainline feeds the hash — re-exporting the same game
 * with different comments or clock readings is still the same game.
 *
 * @param {{tags?: Record<string,string>, moves?: Array<{san: string}>}} game
 * @returns {string} e.g. 'pgn:1f3c9a0b7d2e4511'
 */
export function stableGameId(game) {
  const tags = game?.tags || {};
  const header = ID_TAGS.map((name) => `${name}=${(tags[name] ?? '').trim()}`).join('');
  const movetext = Array.isArray(game?.moves)
    ? game.moves.map((m) => m.san).join(' ')
    : String(game?.movetext ?? '');
  const key = `${header}${movetext}`;
  return `pgn:${hex8(fnv1a(key, 0x811c9dc5))}${hex8(fnv1a(key, 0x7fffffff))}`;
}

/**
 * Drop records whose id is already in the archive, and collapse duplicates
 * inside the batch itself.
 *
 * @param {Array<{id: string}>} records
 * @param {Iterable<string>|Set<string>} [existingIds]
 * @returns {Array<{id: string}>} the records worth storing, in order
 */
export function dedupe(records, existingIds = []) {
  if (!Array.isArray(records)) return [];
  const seen = existingIds instanceof Set ? new Set(existingIds) : new Set(existingIds || []);
  const out = [];
  for (const record of records) {
    const id = record?.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(record);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Player matching
// ---------------------------------------------------------------------------

/**
 * Fold a name to a comparison key: accents stripped, punctuation dropped,
 * word order ignored. "Villanueva-Parra, Anthony" and "Anthony
 * Villanueva-Parra" both come out as "anthony villanueva parra".
 *
 * Word order is ignored rather than guessed at because PGN has no rule about
 * it: pairing programs write "Last, First", phone apps write "First Last",
 * and both spellings turn up in the same downloaded file.
 */
function nameKey(raw) {
  if (typeof raw !== 'string') return '';
  const flattened = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  if (!flattened) return '';
  return flattened.split(' ').sort().join(' ');
}

/** A roster row's id, whichever spelling the caller happens to hold. */
function rosterId(player) {
  return player?.playerId ?? player?.player_id ?? player?.id ?? null;
}

function isPlaceholderName(raw) {
  const trimmed = String(raw ?? '').trim().toLowerCase();
  return PLACEHOLDER_NAMES.has(trimmed);
}

/**
 * Map a PGN White/Black tag onto a roster player id.
 *
 * Matching is case-insensitive, accent-insensitive and tolerant of
 * "Last, First" versus "First Last". It is deliberately *not* fuzzy: no
 * nickname table, no initials, no edit distance. A wrong match files one
 * child's loss under another child's name and quietly poisons their rating
 * and their training set, so anything short of a confident match returns
 * null and the game keeps the plain text names.
 *
 * When two roster entries fold to the same key the name is ambiguous and the
 * answer is null — unless `preferId` names one of them, which is how an
 * importing player's own games get attributed to them.
 *
 * @param {string} name a PGN White/Black tag value
 * @param {Array<{playerId?: string, player_id?: string, id?: string, name?: string}>} roster
 * @param {{preferId?: string|null}} [options]
 * @returns {string|null}
 */
export function matchPlayer(name, roster, { preferId = null } = {}) {
  if (!Array.isArray(roster) || roster.length === 0) return null;
  if (isPlaceholderName(name)) return null;
  const key = nameKey(name);
  if (!key) return null;

  const matches = [];
  for (const player of roster) {
    const id = rosterId(player);
    if (!id) continue;
    if (nameKey(player?.name) !== key) continue;
    if (!matches.includes(id)) matches.push(id);
  }

  if (matches.length === 1) return matches[0];
  if (matches.length > 1 && preferId && matches.includes(preferId)) return preferId;
  return null; // unknown, or ambiguous: say so rather than guess
}

// ---------------------------------------------------------------------------
// Tag reading
// ---------------------------------------------------------------------------

/**
 * `[UTCDate]`/`[UTCTime]`, falling back to `[Date]`/`[Time]`, as an ISO
 * string. Returns null for the "????.??.??" that half the PGN files in the
 * world carry, rather than inventing a date the coach will later trust.
 */
export function playedAtFromTags(tags = {}) {
  const rawDate = (tags.UTCDate || tags.Date || '').trim();
  const m = /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/.exec(rawDate);
  if (!m) return null;
  const [, y, mo, d] = m;
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const rawTime = (tags.UTCTime || tags.Time || '').trim();
  const t = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(rawTime);
  const hh = t ? Math.min(23, Number(t[1])) : 0;
  const mm = t ? Math.min(59, Number(t[2])) : 0;
  const ss = t && t[3] ? Math.min(59, Number(t[3])) : 0;

  const stamp = Date.UTC(Number(y), month - 1, day, hh, mm, ss);
  if (!Number.isFinite(stamp)) return null;
  return new Date(stamp).toISOString();
}

/** How the game ended, in the archive's plain words. '' when the file is silent. */
export function reasonFromGame(game) {
  const moves = game?.moves || [];
  const last = moves.length ? moves[moves.length - 1].san : '';
  if (typeof last === 'string' && last.includes('#')) return 'Checkmate';

  const termination = (game?.tags?.Termination || '').trim();
  if (termination && !/^normal$/i.test(termination)) {
    for (const [pattern, label] of TERMINATION_PATTERNS) {
      if (pattern.test(termination)) return label;
    }
  }
  return '';
}

function displayName(raw, fallback) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed || isPlaceholderName(trimmed)) return fallback;
  return trimmed;
}

// ---------------------------------------------------------------------------
// The import itself
// ---------------------------------------------------------------------------

/**
 * Build one archive record from a validated game plus its original text.
 * Shape matches what `gamesStore` stores, field for field.
 */
function toArchiveRecord(game, pgnText, { playerId, roster }) {
  const tags = game.tags || {};
  return {
    id: stableGameId(game),
    playedAt: playedAtFromTags(tags),
    whitePlayerId: matchPlayer(tags.White, roster, { preferId: playerId }) || '',
    blackPlayerId: matchPlayer(tags.Black, roster, { preferId: playerId }) || '',
    whiteName: displayName(tags.White, 'White'),
    blackName: displayName(tags.Black, 'Black'),
    result: game.result,
    reason: reasonFromGame(game),
    moveCount: game.moves.length,
    mode: 'human',
    pgn: pgnText.trim(),
  };
}

/** Re-point a `parseAndValidate` message at the game's real place in the file. */
function retargetMessage(message, humanIndex) {
  return String(message).replace(/^PGN game \d+:\s*/, `game ${humanIndex}: `);
}

/**
 * Import a PGN file.
 *
 * Every game is replayed through the engine; a game with a move the engine
 * refuses is rejected whole, named by move number and SAN, and the rest of
 * the file still imports. Games that survive come back as archive records
 * ready for `gamesStore`.
 *
 * Note that `playedAt` is null when the file carries no usable Date tag —
 * the importer will not invent one.
 *
 * @param {string} text the whole file
 * @param {{playerId?: string|null, roster?: Array<object>}} [options]
 *   `playerId` is the member doing the import; it only breaks ties when two
 *   roster entries share a name. `roster` is the club roster to match against.
 * @returns {{
 *   games: Array<object>,
 *   errors: Array<{index: number, message: string}>,
 *   skipped: number,
 * }} `index` is the game's zero-based position in the file; `skipped` counts
 *   every game that did not make it into `games`, errors and in-file
 *   duplicates alike.
 */
export function importPgnText(text, { playerId = null, roster = [] } = {}) {
  const errors = [];
  const games = [];

  if (typeof text !== 'string' || !text.trim()) {
    return { games, errors: [{ index: 0, message: 'The file is empty.' }], skipped: 1 };
  }

  const chunks = splitPgnGames(text);
  if (chunks.length === 0) {
    return { games, errors: [{ index: 0, message: 'No games found in the file.' }], skipped: 1 };
  }

  chunks.forEach((chunk, index) => {
    const humanIndex = index + 1;
    let parsed;
    try {
      // Validated one chunk at a time: parseAndValidate throws on the first
      // bad game it meets, and a whole tournament must not die with it.
      parsed = parseAndValidate(chunk);
    } catch (cause) {
      errors.push({ index, message: retargetMessage(cause.message, humanIndex) });
      return;
    }

    if (parsed.length !== 1) {
      errors.push({
        index,
        message: `game ${humanIndex}: could not be separated from its neighbours in the file.`,
      });
      return;
    }

    const game = parsed[0];
    if (game.moves.length === 0) {
      errors.push({ index, message: `game ${humanIndex}: has no moves.` });
      return;
    }

    games.push(toArchiveRecord(game, chunk, { playerId, roster }));
  });

  // Two identical games inside one file are one game.
  const unique = dedupe(games);
  return { games: unique, errors, skipped: errors.length + (games.length - unique.length) };
}

export default importPgnText;
