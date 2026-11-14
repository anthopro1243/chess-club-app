/*
 * sanInput.js — turn a move somebody typed into exactly one legal move, or
 * say precisely why it isn't one.
 *
 * The engine's own move('Nf3') accepts SAN only as it would write it and
 * answers null for anything else. That is right for replaying a PGN and
 * useless to a player at a keyboard, who needs to hear "ambiguous: Nbd2 or
 * Nfd2", not silence. This module matches typed text against the engine's
 * legal move list (it never edits or second-guesses chess.js) and explains
 * every refusal.
 *
 * What is ACCEPTED, and why each tolerance is safe (none can mean two moves):
 *   - Standard SAN: Nf3, exd5, Rae1, N1c3, Qh4xe1, e8=Q, O-O-O.
 *   - Check/mate marks and !/? glyphs, present or absent. They describe the
 *     position, they do not choose the move, and PGN readers ignore them too.
 *   - "x" left out of a capture: Ne5 for Nxe5, ed5 for exd5.
 *   - Castling with digit zero or lowercase o: 0-0, o-o-o.
 *   - Promotion without "=" (e8Q) or with a lowercase piece (e8=q): after
 *     the destination square a letter can only be the promotion piece.
 *   - Lowercase n, r, q, k as piece letters. No file is called n, r, q or
 *     k, so "nf3" cannot mean anything but the knight.
 *   - Coordinates: e2e4, g1-f3, e7e8q. That is how the board's square
 *     announcements speak, so it is what a screen-reader user will type.
 *   - A leading move number copied from a book: "1. e4", "12...Nf6".
 *
 * What is REFUSED, on purpose, with a suggestion where one is certain:
 *   - Lowercase b as a bishop. "bc4" is how b-pawn moves are written, and
 *     guessing would play a move nobody asked for. The error offers Bc4.
 *   - "x" on a move that captures nothing. The player has misread the
 *     board, and playing the quiet move anyway could be a blunder they
 *     never meant. Tournament scoresheets are SAN, so saying so also teaches.
 *   - A promotion with no piece named. The engine would quietly default to
 *     a queen, and choosing the piece is the whole point of asking.
 *   - Kg1 meaning castling. SAN writes castling as O-O; "Kg1" is a king step.
 *   - A "P" in front of a pawn move, and capital square letters (E4): both
 *     are refused with the corrected spelling, since a scoresheet needs it.
 */

import { joinOr } from './boardA11y.js';

const PROMOTABLE = new Set(['q', 'r', 'b', 'n']);

const PIECE_RE = /^([KQRBNkqrn])([a-h])?([1-8])?([x-])?([a-h][1-8])$/;
const PAWN_PUSH_RE = /^([a-h][1-8])(?:=?([A-Za-z]))?$/;
const PAWN_CAPTURE_RE = /^([a-h])(x)?([a-h][1-8])(?:=?([A-Za-z]))?$/;
const COORD_RE = /^([a-h][1-8])([x-])?([a-h][1-8])(?:=?([A-Za-z]))?$/;
const CASTLE_RE = /^[O0o]-[O0o](-[O0o])?$/;

/** Strip what carries no information about WHICH move: spaces, numbers, marks. */
function clean(raw) {
  return String(raw ?? '')
    .replace(/\s+/g, '')
    .replace(/^\d+\.+/, '')
    .replace(/[+#!?]+$/, '')
    .replace(/e\.p\.$/i, '')
    .replace(/[+#!?]+$/, '');
}

/** Validate an optional promotion letter; returns the parse or an invalid marker. */
function promotionOf(letter) {
  if (!letter) return { promotion: null };
  const lower = letter.toLowerCase();
  if (PROMOTABLE.has(lower)) return { promotion: lower };
  if (lower === 'k' || lower === 'p') return { invalid: 'bad-promotion' };
  return { invalid: 'unreadable' };
}

function parsePawnOrCoord(body) {
  let m = COORD_RE.exec(body);
  if (m) {
    const promo = promotionOf(m[4]);
    if (promo.invalid) return { kind: 'invalid', reason: promo.invalid };
    return { kind: 'coord', from: m[1], to: m[3], capture: m[2] === 'x', promotion: promo.promotion };
  }
  m = PAWN_PUSH_RE.exec(body);
  if (m) {
    const promo = promotionOf(m[2]);
    if (promo.invalid) return { kind: 'invalid', reason: promo.invalid };
    return { kind: 'pawn', fromFile: null, to: m[1], capture: false, promotion: promo.promotion };
  }
  m = PAWN_CAPTURE_RE.exec(body);
  if (m) {
    const promo = promotionOf(m[4]);
    if (promo.invalid) return { kind: 'invalid', reason: promo.invalid };
    return { kind: 'pawn', fromFile: m[1], to: m[3], capture: true, promotion: promo.promotion };
  }
  return null;
}

/**
 * Read typed text into a structured move description, without looking at
 * any position. Split from matching so the grammar can be tested on its own.
 *
 * @returns {{kind: 'empty'} |
 *   {kind: 'castle', side: 'k'|'q'} |
 *   {kind: 'piece', piece, fromFile, fromRank, capture, to} |
 *   {kind: 'pawn', fromFile, capture, to, promotion} |
 *   {kind: 'coord', from, to, capture, promotion} |
 *   {kind: 'invalid', reason, suggestion?}}
 */
export function parseSanInput(raw) {
  const body = clean(raw);
  if (!body) return { kind: 'empty' };

  if (CASTLE_RE.test(body)) return { kind: 'castle', side: body.length > 3 ? 'q' : 'k' };

  let m = PIECE_RE.exec(body);
  if (m) {
    return {
      kind: 'piece',
      piece: m[1].toLowerCase(),
      fromFile: m[2] || null,
      fromRank: m[3] || null,
      capture: m[4] === 'x',
      to: m[5],
    };
  }

  const pawn = parsePawnOrCoord(body);
  if (pawn) return pawn;

  // Near misses that have exactly one correct spelling get it suggested.
  if (/^[Pp]/.test(body) && parsePawnOrCoord(body.slice(1))) {
    return { kind: 'invalid', reason: 'pawn-letter', suggestion: body.slice(1) };
  }
  if (/^[A-H]/.test(body) && parsePawnOrCoord(body.toLowerCase())) {
    return { kind: 'invalid', reason: 'uppercase-square', suggestion: body.toLowerCase() };
  }
  const pieceFirst = body[0] + body.slice(1).toLowerCase();
  if (/^[KQRBN]/.test(body) && pieceFirst !== body && PIECE_RE.test(pieceFirst)) {
    return { kind: 'invalid', reason: 'uppercase-square', suggestion: pieceFirst };
  }
  return { kind: 'invalid', reason: 'unreadable' };
}

const sideName = (color) => (color === 'b' ? 'Black' : 'White');
const stripSuffix = (san) => san.replace(/[+#]+$/, '');
const fail = (code, message) => ({ ok: false, code, message });

const PIECE_WORDS = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const COLOR_WORDS = { w: 'white', b: 'black' };

/** One move per origin square: a promotion is listed four times by the engine. */
function distinctByOrigin(moves) {
  const seen = new Set();
  return moves.filter((m) => (seen.has(m.from) ? false : (seen.add(m.from), true)));
}

/**
 * Apply the promotion and capture claims the player typed to a set of
 * candidate moves, and pick one. Shared by every notation.
 *
 * @param {object[]} candidates legal verbose moves consistent with the text
 * @param {object} parsed the parse (for `capture` and `promotion`)
 * @param {{shown: string, example: (piece: string) => string}} spelling how
 *   to echo the player's own notation back in a message
 */
function resolve(candidates, parsed, { shown, example }) {
  if (parsed.capture && candidates.every((m) => !m.captured)) {
    const quiet = distinctByOrigin(candidates);
    const hint = quiet.length === 1 ? ` Did you mean ${stripSuffix(quiet[0].san)}?` : '';
    return fail('not-a-capture', `${shown} captures nothing: ${quiet[0].to} is empty.${hint}`);
  }

  const promotes = candidates.some((m) => m.promotion);
  if (promotes && !parsed.promotion) {
    return fail(
      'promotion-needed',
      `That move promotes a pawn: add the piece, for example ${example('q')} or ${example('n')}.`,
    );
  }
  if (!promotes && parsed.promotion) {
    return fail('not-a-promotion', `${shown}: only a pawn reaching the last rank can promote.`);
  }
  const chosen = promotes ? candidates.filter((m) => m.promotion === parsed.promotion) : candidates;

  const distinct = distinctByOrigin(chosen);
  if (distinct.length > 1) {
    return fail('ambiguous', `Ambiguous: ${joinOr(distinct.map((m) => m.san))}.`);
  }
  const move = distinct[0];
  return {
    ok: true,
    move: { from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) },
    san: move.san,
  };
}

/**
 * Match typed text against the legal moves in `game`. Never changes `game`.
 *
 * @param {import('../engine/chess.js').Chess} game
 * @param {string} raw what the player typed
 * @returns {{ok: true, move: {from, to, promotion?}, san: string} |
 *           {ok: false, code: string, message: string}}
 */
export function matchSanInput(game, raw) {
  const parsed = parseSanInput(raw);
  const shown = clean(raw);
  const side = sideName(game.turn);

  switch (parsed.kind) {
    case 'empty':
      return fail('empty', 'Type a move first, for example Nf3.');
    case 'invalid':
      if (parsed.reason === 'pawn-letter') {
        return fail('pawn-letter', `Pawn moves are written without a P: try ${parsed.suggestion}.`);
      }
      if (parsed.reason === 'uppercase-square') {
        return fail('uppercase-square', `Squares are lowercase: try ${parsed.suggestion}.`);
      }
      if (parsed.reason === 'bad-promotion') {
        return fail('bad-promotion', 'A pawn promotes to a queen, rook, bishop or knight.');
      }
      return fail(
        'unreadable',
        `Couldn't read "${shown}" as a move. Try something like Nf3, exd5, O-O or e8=Q.`,
      );
    default:
      break;
  }

  const legal = game.moves({ verbose: true });
  const checkNote = game.inCheck() ? ` ${side} is in check.` : '';
  const noMatch = () => fail('no-match', `No legal move matches ${shown}.${checkNote}`);

  if (parsed.kind === 'castle') {
    const move = legal.find((m) => m.flags === parsed.side);
    if (!move) {
      return fail(
        'castle-illegal',
        `Castling ${parsed.side === 'k' ? 'kingside' : 'queenside'} isn't legal right now.${checkNote}`,
      );
    }
    return { ok: true, move: { from: move.from, to: move.to }, san: move.san };
  }

  if (parsed.kind === 'piece') {
    const candidates = legal.filter(
      (m) =>
        m.piece === parsed.piece &&
        m.to === parsed.to &&
        m.flags !== 'k' &&
        m.flags !== 'q' &&
        (!parsed.fromFile || m.from[0] === parsed.fromFile) &&
        (!parsed.fromRank || m.from[1] === parsed.fromRank),
    );
    if (candidates.length === 0) {
      const castle = parsed.piece === 'k' && legal.find((m) => (m.flags === 'k' || m.flags === 'q') && m.to === parsed.to);
      if (castle) return fail('castle-notation', `To castle, type ${castle.flags === 'k' ? 'O-O' : 'O-O-O'}.`);
      return noMatch();
    }
    return resolve(candidates, parsed, { shown, example: () => shown });
  }

  if (parsed.kind === 'pawn') {
    const candidates = legal.filter(
      (m) =>
        m.piece === 'p' &&
        m.to === parsed.to &&
        (parsed.fromFile
          ? m.from[0] === parsed.fromFile && m.from[0] !== parsed.to[0]
          : m.from[0] === parsed.to[0]),
    );
    if (candidates.length === 0) {
      // "bc4" is b-pawn notation. If only a bishop could have been meant,
      // say so, but never play it: the player may have meant the pawn.
      if (parsed.fromFile === 'b') {
        const bishops = distinctByOrigin(legal.filter((m) => m.piece === 'b' && m.to === parsed.to));
        if (bishops.length) {
          return fail(
            'lowercase-bishop',
            `No pawn move matches ${shown}. A bishop takes a capital B: ${joinOr(bishops.map((m) => m.san))}.`,
          );
        }
      }
      return noMatch();
    }
    const base = parsed.fromFile ? `${parsed.fromFile}x${parsed.to}` : parsed.to;
    return resolve(candidates, parsed, { shown, example: (p) => `${base}=${p.toUpperCase()}` });
  }

  // Coordinates: the origin is named, so explain what is wrong with it.
  const candidates = legal.filter((m) => m.from === parsed.from && m.to === parsed.to);
  if (candidates.length === 0) {
    const piece = game.get(parsed.from);
    if (!piece) return fail('no-piece', `There is no piece on ${parsed.from}.`);
    if (piece.color !== game.turn) {
      return fail('wrong-side', `${parsed.from} has a ${COLOR_WORDS[piece.color]} ${PIECE_WORDS[piece.type]}. It is ${side}'s move.`);
    }
    return fail(
      'no-match',
      `The ${COLOR_WORDS[piece.color]} ${PIECE_WORDS[piece.type]} on ${parsed.from} can't move to ${parsed.to}.${checkNote}`,
    );
  }
  return resolve(candidates, parsed, { shown, example: (p) => `${parsed.from}${parsed.to}${p}` });
}
