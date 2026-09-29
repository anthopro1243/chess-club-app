/*
 * sanMatch.js — a move written on a scoresheet → exactly one legal move, or
 * a precise reason why it is not one.
 *
 * The engine's move('Nf3') accepts SAN only exactly as it would write it and
 * answers null for anything else. That is right for replaying a PGN and no
 * help to someone copying a child's handwriting, who needs "ambiguous: Nbd7
 * or Nfd7" and the ply it happened at, not silence. This module matches text
 * against the engine's legal-move list (it never edits chess.js) and explains
 * every refusal.
 *
 * ACCEPTED, and why each tolerance cannot mean two different moves:
 *   - Standard SAN, over-disambiguated SAN (Qh4xe1), check/mate marks and
 *     !/? glyphs present or absent, a leading move number ("12...Nf6").
 *   - "x" left out of a capture: Ne5 for Nxe5, ed5 for exd5. Scholastic
 *     sheets leave it out all the time, and the destination still names one
 *     move — if it names two, that is refused as ambiguous like any other.
 *   - Castling as 0-0, o-o-o or OO.
 *   - Promotion without "=" (e8Q, e8(Q), e8/Q) or with a lowercase piece.
 *   - Lowercase n, r, q, k as piece letters: no file is called n, r, q or k.
 *   - Coordinates: e2e4, g1-f3, e7e8q.
 *   - Figurines (♘f3) from phone keyboards.
 *
 * REFUSED on purpose, with a suggestion where one is certain:
 *   - Lowercase b as a bishop. "bc4" is how b-pawn moves are written, and
 *     playing the bishop would enter a move nobody wrote. The error offers
 *     the bishop move so one tap fixes it.
 *   - "x" on a move that captures nothing: the sheet or the reading is wrong,
 *     and the person entering it should look again rather than have a quiet
 *     move substituted.
 *   - A promotion with no piece named. The engine would default to a queen,
 *     and on a scoresheet the piece is the part most worth checking.
 *   - Kg1 meaning castling, a "P" in front of a pawn move, capital squares.
 *
 * (The unmerged board-accessibility patch in docs/wip-2026-09-26 has a
 * sanInput.js with the same rules for live play. They were written apart;
 * one should absorb the other when both are merged.)
 *
 * Pure: no React, no store, no network.
 */

import { Chess } from '../engine/chess.js';

const PROMOTABLE = new Set(['q', 'r', 'b', 'n']);
const PROMO = String.raw`(?:[=/]?\(?([A-Za-z])\)?)?`;

const PIECE_RE = /^([KQRBNkqrn])([a-h])?([1-8])?([x:-])?([a-h][1-8])$/;
const PAWN_PUSH_RE = new RegExp(`^([a-h][1-8])${PROMO}$`);
const PAWN_CAPTURE_RE = new RegExp(`^([a-h])([x:])?([a-h][1-8])${PROMO}$`);
const COORD_RE = new RegExp(`^([a-h][1-8])([x:-])?([a-h][1-8])${PROMO}$`);
const CASTLE_RE = /^[O0o]-?[O0o](-?[O0o])?$/;

const FIGURINES = { '♔': 'K', '♕': 'Q', '♖': 'R', '♗': 'B', '♘': 'N', '♚': 'K', '♛': 'Q', '♜': 'R', '♝': 'B', '♞': 'N', '♙': '', '♟': '' };

export const RESULT_TOKENS = { '1-0': '1-0', '0-1': '0-1', '1/2-1/2': '1/2-1/2', '½-½': '1/2-1/2', '*': '*' };

/** Strip what says nothing about WHICH move: spaces, numbers, marks, glyphs. */
export function cleanMoveText(raw) {
  let s = String(raw ?? '')
    .replace(/[♔♕♖♗♘♚♛♜♝♞♙♟]/g, (c) => FIGURINES[c])
    .replace(/[×]/g, 'x')
    .replace(/[–—‑]/g, '-')
    .replace(/\s+/g, '');
  s = s.replace(/^\d+(?:\.+|…)/, '');
  s = s.replace(/(?:e\.?p\.?)$/i, (m, offset) => (offset > 1 ? '' : m));
  s = s.replace(/[+#!?]+$/, '');
  return s;
}

function promotionOf(letter) {
  if (!letter) return { promotion: null };
  const lower = letter.toLowerCase();
  if (PROMOTABLE.has(lower)) return { promotion: lower };
  return { invalid: lower === 'k' || lower === 'p' ? 'bad-promotion' : 'unreadable' };
}

/**
 * Read typed text into a move description, without looking at a position.
 *
 * @returns {{kind: 'empty'} | {kind: 'castle', side: 'k'|'q'} |
 *   {kind: 'piece', piece, fromFile, fromRank, capture, to} |
 *   {kind: 'pawn', fromFile, capture, to, promotion} |
 *   {kind: 'coord', from, to, capture, promotion} |
 *   {kind: 'invalid', reason, suggestion?}}
 */
export function parseMoveText(raw) {
  const body = cleanMoveText(raw);
  if (!body) return { kind: 'empty' };
  if (CASTLE_RE.test(body)) return { kind: 'castle', side: body.replace(/-/g, '').length > 2 ? 'q' : 'k' };

  let m = PIECE_RE.exec(body);
  if (m) {
    return {
      kind: 'piece',
      piece: m[1].toLowerCase(),
      fromFile: m[2] || null,
      fromRank: m[3] || null,
      capture: m[4] === 'x' || m[4] === ':',
      to: m[5],
    };
  }

  m = COORD_RE.exec(body);
  if (m) {
    const promo = promotionOf(m[4]);
    if (promo.invalid) return { kind: 'invalid', reason: promo.invalid };
    return { kind: 'coord', from: m[1], to: m[3], capture: m[2] === 'x' || m[2] === ':', promotion: promo.promotion };
  }
  m = PAWN_PUSH_RE.exec(body);
  if (m) {
    const promo = promotionOf(m[2]);
    if (promo.invalid) return { kind: 'invalid', reason: promo.invalid };
    return { kind: 'pawn', fromFile: null, capture: false, to: m[1], promotion: promo.promotion };
  }
  m = PAWN_CAPTURE_RE.exec(body);
  if (m) {
    const promo = promotionOf(m[4]);
    if (promo.invalid) return { kind: 'invalid', reason: promo.invalid };
    return { kind: 'pawn', fromFile: m[1], capture: !!m[2], to: m[3], promotion: promo.promotion };
  }

  // Near misses with exactly one correct spelling get it suggested.
  if (/^[Pp]/.test(body) && (PAWN_PUSH_RE.test(body.slice(1)) || PAWN_CAPTURE_RE.test(body.slice(1)))) {
    return { kind: 'invalid', reason: 'pawn-letter', suggestion: body.slice(1) };
  }
  const lowered = body.replace(/[A-H](?=[1-8])/g, (c) => c.toLowerCase());
  if (lowered !== body && parseMoveText(lowered).kind !== 'invalid') {
    return { kind: 'invalid', reason: 'uppercase-square', suggestion: lowered };
  }
  return { kind: 'invalid', reason: 'unreadable' };
}

const stripMarks = (san) => san.replace(/[+#]+$/, '');
const fail = (code, message, options = []) => ({ ok: false, code, message, options });

/** "Nbd7 or Nfd7", "Ra1, Rb1 or Rc1". */
function joinOr(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

/** One entry per (from, to, promotion): the engine lists each promotion separately. */
function distinct(moves) {
  const seen = new Set();
  return moves.filter((mv) => {
    const key = `${mv.from}${mv.to}${mv.promotion || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function resolve(candidates, parsed, shown) {
  if (parsed.capture && candidates.every((mv) => !mv.captured)) {
    const quiet = distinct(candidates);
    const options = quiet.length === 1 ? [quiet[0].san] : [];
    const hint = options.length ? ` Did you mean ${stripMarks(options[0])}?` : '';
    return fail('not-a-capture', `${shown} captures nothing: ${candidates[0].to} is empty.${hint}`, options);
  }

  const promotes = candidates.some((mv) => mv.promotion);
  if (promotes && !parsed.promotion) {
    const base = stripMarks(candidates[0].san).replace(/=.$/, '');
    return fail(
      'promotion-needed',
      `${shown} promotes a pawn: say which piece, e.g. ${base}=Q or ${base}=N.`,
      distinct(candidates).map((mv) => mv.san),
    );
  }
  if (!promotes && parsed.promotion) {
    return fail('not-a-promotion', `${shown}: only a pawn reaching the last rank can promote.`);
  }
  const chosen = distinct(promotes ? candidates.filter((mv) => mv.promotion === parsed.promotion) : candidates);
  if (chosen.length > 1) {
    const options = chosen.map((mv) => mv.san);
    return fail('ambiguous', `${shown} is ambiguous: ${joinOr(options.map(stripMarks))}.`, options);
  }
  const move = chosen[0];
  return {
    ok: true,
    san: move.san,
    move: { from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) },
  };
}

const PIECE_WORDS = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const sideName = (color) => (color === 'b' ? 'Black' : 'White');

/**
 * Match typed text against the legal moves in `chess`. Never changes `chess`.
 *
 * @param {Chess} chess
 * @param {string} raw
 * @param {Array<object>} [legal] the verbose legal-move list, when the caller already has it
 * @returns {{ok: true, san: string, move: {from, to, promotion?}} |
 *           {ok: false, code: string, message: string, options: string[]}}
 *   `options` are legal SAN moves that would fix the problem, for one-tap repair.
 */
export function matchMove(chess, raw, legal = null) {
  const parsed = parseMoveText(raw);
  const shown = cleanMoveText(raw) || String(raw ?? '').trim();

  if (parsed.kind === 'empty') return fail('empty', 'No move written here.');
  if (parsed.kind === 'invalid') {
    if (parsed.reason === 'pawn-letter') {
      return fail('pawn-letter', `Pawn moves are written without a P: ${parsed.suggestion}.`, []);
    }
    if (parsed.reason === 'uppercase-square') {
      return fail('uppercase-square', `Squares are lowercase: ${parsed.suggestion}.`, []);
    }
    if (parsed.reason === 'bad-promotion') {
      return fail('bad-promotion', 'A pawn promotes to a queen, rook, bishop or knight.');
    }
    return fail('unreadable', `Can't read "${shown}" as a move. Moves look like Nf3, exd5, O-O or e8=Q.`);
  }

  const moves = legal || chess.moves({ verbose: true });
  const checkNote = chess.inCheck() ? ` ${sideName(chess.turn)} is in check.` : '';
  const noMatch = () => fail('illegal', `${shown} is not a legal move for ${sideName(chess.turn)} here.${checkNote}`);

  if (parsed.kind === 'castle') {
    const move = moves.find((mv) => mv.flags === (parsed.side === 'k' ? 'k' : 'q'));
    if (!move) {
      return fail(
        'illegal',
        `Castling ${parsed.side === 'k' ? 'kingside' : 'queenside'} is not legal for ${sideName(chess.turn)} here.${checkNote}`,
      );
    }
    return { ok: true, san: move.san, move: { from: move.from, to: move.to } };
  }

  if (parsed.kind === 'piece') {
    const candidates = moves.filter(
      (mv) =>
        mv.piece === parsed.piece &&
        mv.to === parsed.to &&
        mv.flags !== 'k' &&
        mv.flags !== 'q' &&
        (!parsed.fromFile || mv.from[0] === parsed.fromFile) &&
        (!parsed.fromRank || mv.from[1] === parsed.fromRank),
    );
    if (!candidates.length) {
      const castle = parsed.piece === 'k' && moves.find((mv) => (mv.flags === 'k' || mv.flags === 'q') && mv.to === parsed.to);
      if (castle) return fail('castle-notation', `Castling is written ${castle.san}.`, [castle.san]);
      return noMatch();
    }
    return resolve(candidates, parsed, shown);
  }

  if (parsed.kind === 'pawn') {
    const candidates = moves.filter(
      (mv) =>
        mv.piece === 'p' &&
        mv.to === parsed.to &&
        (parsed.fromFile ? mv.from[0] === parsed.fromFile && mv.from[0] !== parsed.to[0] : mv.from[0] === parsed.to[0]),
    );
    if (!candidates.length) {
      // "bc4" is b-pawn notation. If a bishop could have been meant, offer it,
      // but never play it: the sheet may really mean the pawn.
      if (parsed.fromFile === 'b') {
        const bishops = distinct(moves.filter((mv) => mv.piece === 'b' && mv.to === parsed.to));
        if (bishops.length) {
          const options = bishops.map((mv) => mv.san);
          return fail(
            'lowercase-bishop',
            `No b-pawn move matches ${shown}. A bishop takes a capital B: ${joinOr(options.map(stripMarks))}.`,
            options,
          );
        }
      }
      return noMatch();
    }
    return resolve(candidates, parsed, shown);
  }

  // Coordinates name the origin, so say what is wrong with it.
  const candidates = moves.filter((mv) => mv.from === parsed.from && mv.to === parsed.to);
  if (!candidates.length) {
    const piece = chess.get(parsed.from);
    if (!piece) return fail('illegal', `There is no piece on ${parsed.from}.`);
    if (piece.color !== chess.turn) {
      return fail('illegal', `${parsed.from} holds a ${piece.color === 'w' ? 'white' : 'black'} ${PIECE_WORDS[piece.type]}; it is ${sideName(chess.turn)}'s move.`);
    }
    return fail('illegal', `The ${PIECE_WORDS[piece.type]} on ${parsed.from} can’t move to ${parsed.to}.${checkNote}`);
  }
  return resolve(candidates, parsed, shown);
}

// ---------------------------------------------------------------------------
// Autocomplete
// ---------------------------------------------------------------------------

// Case, dashes, "=", brackets and zero-for-O do not distinguish moves.
const fold = (s) => s.toLowerCase().replace(/0/g, 'o').replace(/[-:=()/]/g, '');

function spellings(mv) {
  const canonical = stripMarks(mv.san);
  const out = [canonical, canonical.replace('x', ''), `${mv.from}${mv.to}${mv.promotion || ''}`];
  if (mv.piece !== 'p' && mv.flags !== 'k' && mv.flags !== 'q') {
    // What the sheet most often says when it is ambiguous: "Nd7" with no
    // origin. Both knights are then offered, so one tap settles it.
    out.push(`${mv.piece}${mv.from}${mv.to}`, `${mv.piece}${mv.to}`, `${mv.piece}x${mv.to}`);
  }
  return out.map(fold);
}

/**
 * Legal moves the partial text could be the start of, best first, as SAN.
 *
 * Tier 0: the SAN starts with exactly what was typed ("Nf" → Nf3, Nf6…).
 * Tier 1: it does ignoring case, dashes and "=" ("nf", "o-o", "e8q").
 * Tier 2: another spelling does — "x" left out, or coordinates ("g1" → Nf3).
 *
 * Suggestions are only offered for picking. Lowercase "b" lists both the
 * b-pawn and the bishop here, because a tap on a chip is an explicit choice;
 * typed text alone never becomes a bishop move (see matchMove).
 */
export function suggestMoves(chess, raw, { limit = 8, legal = null } = {}) {
  const typed = cleanMoveText(raw);
  if (!typed) return [];
  const want = fold(typed);
  const moves = distinct(legal || chess.moves({ verbose: true }));
  const ranked = [];
  for (const mv of moves) {
    const canonical = stripMarks(mv.san);
    let tier = null;
    if (canonical.startsWith(typed)) tier = 0;
    else if (fold(canonical).startsWith(want)) tier = 1;
    else if (spellings(mv).some((s) => s.startsWith(want))) tier = 2;
    if (tier != null) ranked.push({ san: mv.san, tier, length: canonical.length });
  }
  ranked.sort((a, b) => a.tier - b.tier || a.length - b.length || a.san.localeCompare(b.san));
  return ranked.slice(0, limit).map((r) => r.san);
}

// ---------------------------------------------------------------------------
// Whole sheets
// ---------------------------------------------------------------------------

/** "17. Nf3" for White, "17... Nf3" for Black. */
export function plyLabel(moveNumber, color, text = '') {
  return `${moveNumber}${color === 'b' ? '...' : '.'}${text ? ` ${text}` : ''}`;
}

/**
 * Split pasted movetext into move tokens. Move numbers ("12.", "12...",
 * a bare "12" from a two-column sheet), comments, variations and NAGs are
 * dropped; a result token is returned separately.
 *
 * @returns {{tokens: string[], result: string|null}}
 */
export function splitMoveText(text) {
  const body = String(text ?? '')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/;[^\n]*/g, ' ')
    .replace(/\$\d+/g, ' ');
  // Variations can nest; peel the innermost until none are left.
  let stripped = body;
  for (let i = 0; i < 20 && /\([^()]*\)/.test(stripped); i += 1) stripped = stripped.replace(/\([^()]*\)/g, ' ');

  const tokens = [];
  let result = null;
  for (const piece of stripped.split(/\s+/)) {
    if (!piece) continue;
    if (RESULT_TOKENS[piece]) {
      result = RESULT_TOKENS[piece];
      continue;
    }
    const withoutNumber = piece.replace(/^\d+(?:\.+|…)/, '');
    if (!withoutNumber || /^\d+$/.test(withoutNumber) || /^\.+$/.test(withoutNumber)) continue;
    tokens.push(withoutNumber);
  }
  return { tokens, result };
}

/*
 * Only mate and stalemate end a game on the board. Threefold repetition and
 * the fifty-move rule are draws a player must CLAIM, so a scoresheet can
 * legally run past them, and refusing the moves after would block a true
 * record from being saved.
 */
function finished(chess) {
  if (chess.isCheckmate()) return { result: chess.turn === 'w' ? '0-1' : '1-0', reason: 'checkmate' };
  if (chess.isStalemate()) return { result: '1/2-1/2', reason: 'stalemate' };
  return null;
}

/**
 * Replay written moves from `startFen`, stopping at the first one that does
 * not resolve to exactly one legal move.
 *
 * @returns {{
 *   moves: Array<{token, san, from, to, promotion?, moveNumber, color, fenBefore}>,
 *   error: null | {index, moveNumber, color, token, code, message, options},
 *   fen: string,          // the position after the last good move
 *   over: null | {result, reason},  // set when the last good move ended the game
 * }}
 */
export function replayMoves(startFen, tokens = []) {
  let chess;
  try {
    chess = new Chess(startFen);
  } catch (cause) {
    return {
      moves: [],
      error: { index: 0, moveNumber: 1, color: 'w', token: '', code: 'bad-fen', message: `Can’t read that position: ${cause.message}`, options: [] },
      fen: startFen,
      over: null,
    };
  }

  const moves = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const moveNumber = chess.moveNumber;
    const color = chess.turn;
    const fenBefore = chess.fen();
    const where = plyLabel(moveNumber, color);

    const ended = moves.length ? finished(chess) : null;
    if (ended) {
      return {
        moves,
        error: {
          index, moveNumber, color, token, code: 'after-end', options: [],
          message: `${where} ${cleanMoveText(token) || token}: the game was already over (${ended.reason}) after the move before.`,
        },
        fen: fenBefore,
        over: ended,
      };
    }

    const found = matchMove(chess, token);
    if (!found.ok) {
      return {
        moves,
        error: { index, moveNumber, color, token, code: found.code, message: `${where} ${found.message}`, options: found.options },
        fen: fenBefore,
        over: null,
      };
    }
    chess.move(found.move);
    moves.push({ token, san: found.san, ...found.move, moveNumber, color, fenBefore });
  }

  return { moves, error: null, fen: chess.fen(), over: finished(chess) };
}
