/*
 * scoresheet.js — a paper scoresheet → one archive record and its PGN.
 *
 * The app is for before and after games, never at the board (US Chess
 * scholastic device rules), so a tournament game reaches the archive from a
 * child's handwriting. Two things about those sheets shape this module:
 *
 *   1. Moves are often unreadable or missing. A game with two illegible
 *      moves is still worth keeping and still worth analysing. So a sheet is
 *      a list of SEGMENTS: the first starts from the initial position; each
 *      later one starts from a position the coach set up by hand after a gap
 *      of unknown moves. `endsUnknown` marks a sheet whose last moves could
 *      not be read at all.
 *   2. Only one segment can be the PGN's mainline, because PGN cannot jump
 *      positions mid-game. It is the LAST segment — the one that reaches the
 *      result — stored with SetUp/FEN tags so the analyser (which honours the
 *      FEN tag: pgn.js parseAndValidate, buildPlyRecords) analyses exactly
 *      the known moves from there. Earlier segments are kept word for word
 *      in a leading comment, and a ScoresheetGap tag says what is missing,
 *      so nothing written on the sheet is lost and nobody mistakes the
 *      record for a complete game.
 *
 * The finished PGN is replayed through parseAndValidate before it is
 * returned: a record the analyser would reject is never handed to the store.
 *
 * Pure: no React, no store writes, no network.
 */

import { Chess, START_FEN } from '../engine/chess.js';
import { parseAndValidate } from '../analysis/pgn.js';
import { stableGameId } from './pgnImport.js';
import { replayMoves, plyLabel } from './sanMatch.js';
import { parseUsChessTimeControl, formatUsChess, toPgnTimeControlTag } from './timeControl.js';

export const RESULTS = [
  { value: '1-0', label: 'White won (1–0)' },
  { value: '0-1', label: 'Black won (0–1)' },
  { value: '1/2-1/2', label: 'Draw (½–½)' },
];

export const REASONS = ['Resignation', 'Checkmate', 'Time', 'Agreement', 'Stalemate', 'Repetition', 'Insufficient material', 'Fifty-move rule', 'Forfeit'];

/* The controls scholastic flyers actually print, most common first. */
export const TIME_CONTROL_PRESETS = ['G/30;d5', 'G/25;d5', 'G/45;d5', 'G/60;d5', 'G/90;d5', 'G/15;d5'];

export const EVENT_MAX = 100;
export const NAME_MAX = 60;

/** Absolute ply before a move: 1. White is 0, 1... Black is 1, 20. White is 38. */
export function absolutePly(moveNumber, color) {
  return (moveNumber - 1) * 2 + (color === 'b' ? 1 : 0);
}

/** The move number and colour of an absolute ply. */
export function plyToMove(ply) {
  return { moveNumber: Math.floor(ply / 2) + 1, color: ply % 2 ? 'b' : 'w' };
}

/** "20. White" / "19... Black" — for sentences, where "20." alone reads badly. */
export function describePly(ply) {
  const { moveNumber, color } = plyToMove(ply);
  return `${plyLabel(moveNumber, color)} ${color === 'w' ? 'White' : 'Black'}`;
}

/** The absolute ply of the first move played from a FEN. */
export function startPlyOf(fen) {
  const parts = String(fen || '').trim().split(/\s+/);
  const turn = parts[1] === 'b' ? 'b' : 'w';
  const moveNumber = Number(parts[5]) > 0 ? Number(parts[5]) : 1;
  return absolutePly(moveNumber, turn);
}

// ---------------------------------------------------------------------------
// Setting up a position after a gap
// ---------------------------------------------------------------------------

const FILES = 'abcdefgh';

/** The pieces of a FEN as `{ e1: 'K', e8: 'k', … }`, plus its castling field. */
export function placementFromFen(fen) {
  const [board = '', , castling = '-'] = String(fen || '').trim().split(/\s+/);
  const squares = {};
  const ranks = board.split('/');
  ranks.forEach((row, r) => {
    let file = 0;
    for (const ch of row) {
      if (/[1-8]/.test(ch)) file += Number(ch);
      else {
        if (file < 8 && r < 8) squares[`${FILES[file]}${8 - r}`] = ch;
        file += 1;
      }
    }
  });
  return { squares, castling };
}

/*
 * Castling rights survive only where the king and that rook still stand on
 * their home squares. Anything else would let the analyser's engine castle
 * through a gap in which the king may well have moved.
 */
export function possibleCastling(squares, wanted = 'KQkq') {
  const at = (sq, piece) => squares[sq] === piece;
  let out = '';
  if (wanted.includes('K') && at('e1', 'K') && at('h1', 'R')) out += 'K';
  if (wanted.includes('Q') && at('e1', 'K') && at('a1', 'R')) out += 'Q';
  if (wanted.includes('k') && at('e8', 'k') && at('h8', 'r')) out += 'k';
  if (wanted.includes('q') && at('e8', 'k') && at('a8', 'r')) out += 'q';
  return out || '-';
}

/** A FEN from placed pieces. En passant is never set up by hand; the clock starts at 0. */
export function fenFromPlacement(squares, { turn = 'w', moveNumber = 1, castling = 'KQkq' } = {}) {
  const rows = [];
  for (let rank = 8; rank >= 1; rank -= 1) {
    let row = '';
    let empty = 0;
    for (const file of FILES) {
      const piece = squares[`${file}${rank}`];
      if (piece) {
        if (empty) row += empty;
        empty = 0;
        row += piece;
      } else empty += 1;
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return `${rows.join('/')} ${turn === 'b' ? 'b' : 'w'} ${possibleCastling(squares, castling)} - 0 ${Math.max(1, moveNumber)}`;
}

/**
 * The editor's starting point for the position after a gap: the last known
 * position, with the side to move and move number of the first known ply
 * after the gap. The coach then moves the pieces the gap moved.
 */
export function setupAfterGap(lastKnownFen, resumePly) {
  const { squares, castling } = placementFromFen(lastKnownFen);
  const { moveNumber, color } = plyToMove(resumePly);
  return fenFromPlacement(squares, { turn: color, moveNumber, castling });
}

/**
 * Why a set-up position cannot be played from, or [] when it can. The
 * engine loads nearly anything; these are the checks it does not make.
 */
export function validateSetup(fen) {
  const { squares } = placementFromFen(fen);
  const pieces = Object.entries(squares);
  const count = (ch) => pieces.filter(([, p]) => p === ch).length;
  const errors = [];
  if (count('K') !== 1) errors.push('White needs exactly one king.');
  if (count('k') !== 1) errors.push('Black needs exactly one king.');
  if (pieces.some(([sq, p]) => /p/i.test(p) && (sq[1] === '1' || sq[1] === '8'))) {
    errors.push('A pawn can’t be on the first or last rank.');
  }
  for (const [side, isSide] of [['White', (p) => p === p.toUpperCase()], ['Black', (p) => p === p.toLowerCase()]]) {
    const mine = pieces.filter(([, p]) => isSide(p));
    if (mine.length > 16) errors.push(`${side} has more than 16 pieces.`);
    if (mine.filter(([, p]) => /p/i.test(p)).length > 8) errors.push(`${side} has more than 8 pawns.`);
  }
  if (errors.length) return errors;

  let chess;
  try {
    chess = new Chess(fen);
  } catch (cause) {
    return [`Can’t read that position: ${cause.message}`];
  }
  const waiting = chess.turn === 'w' ? 'b' : 'w';
  if (chess.isKingAttacked(waiting)) {
    errors.push(`${waiting === 'w' ? 'White' : 'Black'} is in check but it is not their move. Check whose move it is.`);
  }
  return errors;
}

// ---------------------------------------------------------------------------
// The sheet
// ---------------------------------------------------------------------------

/** An empty sheet, dated `date` (YYYY-MM-DD). */
export function blankSheet(date = '') {
  return {
    whiteId: '',
    whiteName: '',
    blackId: '',
    blackName: '',
    event: '',
    round: '',
    board: '',
    timeControl: TIME_CONTROL_PRESETS[0],
    date,
    result: '',
    reason: '',
    segments: [{ fen: START_FEN, tokens: [] }],
    endsUnknown: false,
  };
}

/**
 * Replay every segment. Returns each segment with its replay and the
 * absolute plies it covers, plus the first problem anywhere on the sheet —
 * which is what the entry screen highlights.
 */
export function checkSheet(sheet) {
  const segments = (sheet?.segments || []).map((segment) => {
    const replay = replayMoves(segment.fen, segment.tokens || []);
    const startPly = startPlyOf(segment.fen);
    return { ...segment, replay, startPly, endPly: startPly + replay.moves.length };
  });

  let firstError = null;
  for (let i = 0; i < segments.length && !firstError; i += 1) {
    const { replay } = segments[i];
    if (replay.error) firstError = { segment: i, ...replay.error };
    else if (i < segments.length - 1 && replay.over) {
      firstError = {
        segment: i, index: replay.moves.length, code: 'after-end', options: [],
        message: `The game ended (${replay.over.reason}) before the gap. Remove the gap or the moves after it.`,
      };
    }
  }
  return { segments, firstError };
}

/** Plain-words description of what the sheet is missing, or '' for a whole game. */
export function gapNote(checked, endsUnknown) {
  const parts = [];
  const segs = checked.segments;
  for (let i = 1; i < segs.length; i += 1) {
    const from = segs[i - 1].endPly;
    const to = segs[i].startPly - 1;
    parts.push(
      from === to ? `${describePly(from)} could not be read` : `${describePly(from)} to ${describePly(to)} could not be read`,
    );
  }
  if (endsUnknown && segs.length) {
    const last = segs[segs.length - 1];
    parts.push(`the moves after ${describePly(last.endPly - 1)} could not be read`);
  }
  if (!parts.length) return '';
  const text = parts.join('; ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const escapeTag = (value) => String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const ROUND_RE = /^[0-9A-Za-z.-]{1,12}$/;

function movetext(moves) {
  const out = [];
  moves.forEach((m, i) => {
    if (m.color === 'w') out.push(`${m.moveNumber}. ${m.san}`);
    else if (i === 0) out.push(`${m.moveNumber}... ${m.san}`);
    else out.push(m.san);
  });
  return out.join(' ');
}

/** Wrap tokens at 80 columns, as PGN readers expect. Comments stay whole. */
function wrap(tokens) {
  const lines = [];
  let line = '';
  for (const token of tokens) {
    if (line && line.length + token.length + 1 > 80) {
      lines.push(line);
      line = token;
    } else line = line ? `${line} ${token}` : token;
  }
  if (line) lines.push(line);
  return lines.join('\n');
}

const localToday = (nowMs) => {
  const d = new Date(nowMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Validate a filled-in sheet and build the archive record.
 *
 * @param {object} sheet see blankSheet()
 * @param {{roster?: Array<{playerId, name}>, now?: number, checked?: object}} options
 *   `checked` is checkSheet(sheet) when the caller already has it: the entry
 *   screen does, and replaying 80 plies twice per move is felt on a phone.
 * @returns {{ok: false, errors: Array<{field, message, segment?, index?}>} |
 *           {ok: true, game: object, pgn: string, note: string, analysedFrom: string, analysedPlies: number}}
 *   `game` is shaped like every other gamesStore record, plus the OTB tags
 *   (event, round, board, timeControl) that 0022 adds as columns.
 */
export function buildScoresheetGame(sheet, { roster = [], now = Date.now(), checked: prechecked = null } = {}) {
  const errors = [];
  const fail = (field, message, extra = {}) => errors.push({ field, message, ...extra });
  const byId = new Map((roster || []).map((p) => [p.playerId, p]));

  // -- who played ----------------------------------------------------------
  const side = (idKey, nameKey, label) => {
    const id = sheet?.[idKey] || '';
    if (id && !byId.has(id)) fail(nameKey, `${label} is not on the roster.`);
    const name = id && byId.has(id) ? byId.get(id).name : String(sheet?.[nameKey] || '').trim();
    if (!name) fail(nameKey, `Who played ${label}? Pick a member or type a name (initials are enough).`);
    else if (name.length > NAME_MAX) fail(nameKey, `Keep ${label}'s name under ${NAME_MAX} characters.`);
    return { id, name };
  };
  const white = side('whiteId', 'whiteName', 'White');
  const black = side('blackId', 'blackName', 'Black');
  if (white.id && white.id === black.id) fail('blackName', 'The same player can’t be on both sides.');
  if (!white.id && !black.id && white.name && black.name) {
    fail('whiteName', 'Pick the club member who played this game.');
  }

  // -- tags ----------------------------------------------------------------
  const date = String(sheet?.date || '');
  if (!DATE_ONLY.test(date) || Number.isNaN(Date.parse(`${date}T12:00:00Z`))) fail('date', 'Choose the day it was played.');
  else if (date > localToday(now)) fail('date', 'That date is in the future.');

  const event = String(sheet?.event || '').trim();
  if (event.length > EVENT_MAX) fail('event', `Keep the event name under ${EVENT_MAX} characters.`);
  const round = String(sheet?.round || '').trim();
  if (round && !ROUND_RE.test(round)) fail('round', 'Round should be short, like 3 or 2.1.');
  const boardText = String(sheet?.board ?? '').trim();
  const board = boardText ? Number(boardText) : null;
  if (boardText && (!Number.isInteger(board) || board < 1 || board > 500)) fail('board', 'Board should be a whole number, like 4.');

  const tcText = String(sheet?.timeControl || '').trim();
  const tc = tcText ? parseUsChessTimeControl(tcText) : null;
  if (tcText && !tc) fail('timeControl', 'Write it like the flyer does, e.g. G/30;d5 or G/60+5.');

  const result = String(sheet?.result || '');
  if (!RESULTS.some((r) => r.value === result)) fail('result', 'Choose the result.');

  // -- moves ---------------------------------------------------------------
  const checked = prechecked || checkSheet(sheet);
  const segs = checked.segments;
  if (!segs.length) fail('moves', 'Enter the moves.');
  if (checked.firstError) {
    const { segment, index, message } = checked.firstError;
    fail('moves', message, { segment, index });
  }
  for (let i = 1; i < segs.length; i += 1) {
    if (segs[i].startPly <= segs[i - 1].endPly) {
      fail('moves', `The position after the gap must start after ${describePly(segs[i - 1].endPly - 1)}.`, { segment: i });
    }
    const setupProblems = validateSetup(segs[i].fen);
    if (setupProblems.length) fail('moves', `The set-up position: ${setupProblems.join(' ')}`, { segment: i });
  }
  const last = segs[segs.length - 1];
  if (last && !checked.firstError && last.replay.moves.length === 0) {
    fail(
      'moves',
      segs.length > 1 ? 'Enter at least one move after the position you set up, or remove it.' : 'Enter at least one move.',
      { segment: segs.length - 1 },
    );
  }

  // A mate or stalemate on the board settles the result; the sheet must agree.
  const over = last && !sheet?.endsUnknown ? last.replay.over : null;
  if (over && result && over.result !== result) {
    fail('result', `The moves end in ${over.reason}, so the result is ${over.result.replace('1/2-1/2', '½–½')}.`);
  }

  if (errors.length) return { ok: false, errors };

  // -- the PGN ---------------------------------------------------------------
  const note = gapNote(checked, !!sheet.endsUnknown);
  const tags = {
    Event: event || '?',
    Site: '?',
    Date: date.replace(/-/g, '.'),
    Round: round || '-',
    White: white.name,
    Black: black.name,
    Result: result,
  };
  const extra = {};
  if (board) extra.Board = String(board);
  if (tc) extra.TimeControl = toPgnTimeControlTag(tc);
  if (last.fen.trim() !== START_FEN) {
    extra.SetUp = '1';
    extra.FEN = last.fen.trim();
  }
  if (note) extra.ScoresheetGap = note;

  const header = Object.entries({ ...tags, ...extra })
    .map(([k, v]) => `[${k} "${escapeTag(v)}"]`)
    .join('\n');

  const tokens = [];
  if (segs.length > 1) {
    const earlier = segs
      .slice(0, -1)
      .map((s) => movetext(s.replay.moves))
      .filter(Boolean)
      .join(' … ');
    tokens.push(
      `{Entered from a scoresheet. ${note}. This record starts from the position set up before ${describePly(last.startPly)}.${earlier ? ` Readable moves before the gap: ${earlier}` : ''}}`,
    );
  }
  tokens.push(...movetext(last.replay.moves).split(' '));
  if (sheet.endsUnknown) tokens.push(`{The rest of the game could not be read.}`);
  tokens.push(result);
  const pgn = `${header}\n\n${wrap(tokens)}\n`;

  // Belt and braces: the analyser must accept exactly what is stored.
  let parsed;
  try {
    [parsed] = parseAndValidate(pgn);
  } catch (cause) {
    return { ok: false, errors: [{ field: 'moves', message: `Couldn’t make a PGN from these moves: ${cause.message}` }] };
  }
  if (!parsed || parsed.moves.length !== last.replay.moves.length) {
    return { ok: false, errors: [{ field: 'moves', message: 'Couldn’t make a PGN from these moves.' }] };
  }

  const finalSan = last.replay.moves[last.replay.moves.length - 1]?.san || '';
  const reason = over?.reason === 'checkmate' || finalSan.endsWith('#')
    ? 'Checkmate'
    : over?.reason === 'stalemate'
      ? 'Stalemate'
      : REASONS.includes(sheet.reason)
        ? sheet.reason
        : '';

  const game = {
    id: stableGameId({ tags: { ...tags, ...extra }, moves: last.replay.moves }),
    // Noon UTC, so the chosen day reads the same in every US time zone (the
    // same convention as PGN import).
    playedAt: `${date}T12:00:00.000Z`,
    whitePlayerId: white.id,
    blackPlayerId: black.id,
    whiteName: white.name,
    blackName: black.name,
    result,
    reason,
    // How long the game was, in plies, up to the last move anyone could read.
    moveCount: last.endPly,
    mode: 'human',
    computerElo: null,
    pgn,
    event,
    round,
    board,
    timeControl: tc ? formatUsChess(tc) : '',
  };

  return {
    ok: true,
    game,
    pgn,
    note,
    analysedFrom: describePly(last.startPly),
    analysedPlies: last.replay.moves.length,
  };
}

/** The ScoresheetGap tag from a stored PGN, for the Games page. '' if none. */
export function scoresheetGapOf(pgn) {
  const m = /\[ScoresheetGap\s+"((?:[^"\\]|\\.)*)"\]/.exec(String(pgn || ''));
  return m ? m[1].replace(/\\(.)/g, '$1') : '';
}
