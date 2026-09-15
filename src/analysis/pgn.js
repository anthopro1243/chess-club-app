/**
 * PGN importer for the game analyzer.
 *
 * Implements the `parsePgn()` contract in docs/ANALYZER-SPEC.md:
 *   - multiple games per file
 *   - `{ }` comments (including nested braces) with [%clk] / [%eval] markers
 *   - `;` rest-of-line comments
 *   - NAGs ($1) and the inline glyphs ! ? !? ?! !! ??
 *   - recursive variations `( ... )`, arbitrarily nested — skipped entirely
 *   - move numbers with and without the `...` continuation
 *   - results 1-0 / 0-1 / 1/2-1/2 / *
 *   - null moves (`--`, `Z0`) bail the game out instead of mis-parsing it
 *   - SAN with check/mate suffixes, promotion, castling in `O-O` and `0-0`
 *     spellings, and disambiguation
 *
 * Dependency-free apart from the local engine, which is only used by
 * `parseAndValidate()`.
 */

import { Chess, PAWN, START_FEN } from '../engine/chess.js';

/** Inline glyph -> standard NAG number. */
const GLYPH_NAGS = Object.freeze({
  '!': 1,
  '?': 2,
  '!!': 3,
  '??': 4,
  '!?': 5,
  '?!': 6,
});

/** Tokens that stand for "no move was played here". */
const NULL_MOVE_TOKENS = new Set(['--', '––', '—', 'Z0', 'z0', '0000', '<>', '@@@@']);

const RESULTS = new Set(['1-0', '0-1', '1/2-1/2', '*']);

const WHITESPACE = new Set([' ', '\t', '\r', '\n', '\f', '\v']);

/** Round away binary-float dust from clock arithmetic. */
function round3(n) {
  return Math.round(n * 1000) / 1000;
}

/**
 * `[%clk H:MM:SS]`, `[%clk M:SS]`, `[%clk H:MM:SS.f]` or a bare second count.
 * @returns {number|null} seconds remaining, or null when unparseable.
 */
export function parseClockToSeconds(raw) {
  if (typeof raw !== 'string') return null;
  const parts = raw.trim().split(':');
  if (parts.length === 0 || parts.length > 3) return null;
  const nums = parts.map((p) => Number.parseFloat(p.trim()));
  if (nums.some((v) => !Number.isFinite(v) || v < 0)) return null;
  let seconds;
  if (nums.length === 1) seconds = nums[0];
  else if (nums.length === 2) seconds = nums[0] * 60 + nums[1];
  else seconds = nums[0] * 3600 + nums[1] * 60 + nums[2];
  return round3(seconds);
}

/**
 * `[%eval -1.24]` -> -124 centipawns. Mate scores (`#3`, `#-2`, `-#3`) are not
 * centipawns and come back as null.
 * @returns {number|null}
 */
export function parseEvalToCp(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;
  if (s.includes('#') || /^[+-]?M/i.test(s)) return null;
  const v = Number.parseFloat(s);
  if (!Number.isFinite(v)) return null;
  return Math.round(v * 100);
}

/**
 * Increment in seconds from a TimeControl tag: "600+5" -> 5, "300" -> 0,
 * "-" -> 0, "40/7200:1800+30" -> 30, missing/unknown -> 0.
 * @returns {number}
 */
export function parseIncrement(timeControl) {
  if (typeof timeControl !== 'string') return 0;
  const tc = timeControl.trim();
  if (!tc || tc === '-' || tc === '?') return 0;
  // Multi-period controls are colon-separated; the last period is the one in
  // force for the bulk of the game.
  const period = tc.split(':').pop();
  const m = /\+(\d+(?:\.\d+)?)/.exec(period);
  if (!m) return 0;
  const inc = Number.parseFloat(m[1]);
  return Number.isFinite(inc) ? inc : 0;
}

/** Map a run of `!`/`?` characters to NAG numbers. */
function glyphsToNags(glyphs) {
  const out = [];
  let rest = glyphs;
  while (rest.length > 0) {
    const pair = rest.slice(0, 2);
    if (pair.length === 2 && GLYPH_NAGS[pair] !== undefined) {
      out.push(GLYPH_NAGS[pair]);
      rest = rest.slice(2);
      continue;
    }
    const single = rest[0];
    if (GLYPH_NAGS[single] !== undefined) out.push(GLYPH_NAGS[single]);
    rest = rest.slice(1);
  }
  return out;
}

/** Normalise digit-zero castling to the letter-O form the engine generates. */
function normaliseCastling(san) {
  return san
    .replace(/^0-0-0/, 'O-O-O')
    .replace(/^0-0(?!-)/, 'O-O')
    .replace(/^o-o-o/, 'O-O-O')
    .replace(/^o-o(?!-)/, 'O-O');
}

/**
 * Split a raw move token into SAN plus any trailing glyph NAGs.
 * @returns {{san: string, nags: number[]}}
 */
function cleanSanToken(token) {
  let san = token.trim();
  // Chess.com / Lichess occasionally emit a trailing "e.p." marker.
  san = san.replace(/\s*e\.p\.$/i, '');
  const glyphMatch = /([!?]+)$/.exec(san);
  let nags = [];
  if (glyphMatch) {
    nags = glyphsToNags(glyphMatch[1]);
    san = san.slice(0, san.length - glyphMatch[1].length);
  }
  san = normaliseCastling(san);
  return { san, nags };
}

function makeMove(san, nags) {
  return {
    san,
    nags,
    comment: null,
    clockSeconds: null,
    evalCp: null,
    moveSeconds: null,
  };
}

function newGame() {
  return {
    tags: {},
    result: '*',
    moves: [],
    /** Set when the game could not be parsed safely (e.g. a null move). */
    invalid: false,
    /** Human-readable reason when `invalid` is true. */
    error: null,
  };
}

/**
 * Parse a PGN file into games.
 *
 * @param {string} text
 * @returns {Array<{
 *   tags: Record<string,string>,
 *   result: '1-0'|'0-1'|'1/2-1/2'|'*',
 *   invalid: boolean,
 *   error: string|null,
 *   moves: Array<{
 *     san: string,
 *     nags: number[],
 *     comment: string|null,
 *     clockSeconds: number|null,
 *     evalCp: number|null,
 *     moveSeconds: number|null,
 *   }>
 * }>}
 */
export function parsePgn(text) {
  if (typeof text !== 'string') {
    throw new TypeError('parsePgn: expected a string of PGN text');
  }

  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const n = src.length;

  /** @type {ReturnType<typeof newGame>[]} */
  const games = [];
  let game = null;
  let inMovetext = false;
  let sawResultToken = false;

  const startGame = () => {
    game = newGame();
    games.push(game);
    inMovetext = false;
    sawResultToken = false;
  };
  const ensureGame = () => {
    if (!game) startGame();
  };

  // --- small readers -------------------------------------------------------

  /** Read a `{ ... }` comment with nested-brace support. */
  const readBraceComment = (start) => {
    let depth = 0;
    let j = start;
    let body = '';
    while (j < n) {
      const c = src[j];
      if (c === '{') {
        depth += 1;
        if (depth > 1) body += c;
        j += 1;
        continue;
      }
      if (c === '}') {
        depth -= 1;
        j += 1;
        if (depth <= 0) return { body, end: j };
        body += c;
        continue;
      }
      body += c;
      j += 1;
    }
    return { body, end: n }; // unterminated comment: take the rest of the file
  };

  /** Skip `( ... )` recursive variations, honouring comments inside them. */
  const skipVariation = (start) => {
    let depth = 0;
    let j = start;
    while (j < n) {
      const c = src[j];
      if (c === '{') {
        j = readBraceComment(j).end;
        continue;
      }
      if (c === ';') {
        while (j < n && src[j] !== '\n') j += 1;
        continue;
      }
      if (c === '(') {
        depth += 1;
        j += 1;
        continue;
      }
      if (c === ')') {
        depth -= 1;
        j += 1;
        if (depth <= 0) return j;
        continue;
      }
      j += 1;
    }
    return n; // unterminated variation
  };

  // --- attachment helpers --------------------------------------------------

  const lastMove = () => (game && game.moves.length ? game.moves[game.moves.length - 1] : null);

  const applyComment = (body) => {
    const move = lastMove();

    let clock = null;
    const clkRe = /\[%clk\s+([^\]]*)\]/gi;
    let m;
    while ((m = clkRe.exec(body)) !== null) {
      const parsed = parseClockToSeconds(m[1]);
      if (parsed !== null) clock = parsed;
    }

    let evalCp = null;
    let sawEval = false;
    const evalRe = /\[%eval\s+([^\]]*)\]/gi;
    while ((m = evalRe.exec(body)) !== null) {
      sawEval = true;
      evalCp = parseEvalToCp(m[1]);
    }

    const prose = body
      .replace(/\[%(?:clk|eval)\s+[^\]]*\]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!move) return; // a comment before the first move annotates nothing
    if (clock !== null) move.clockSeconds = clock;
    if (sawEval) move.evalCp = evalCp;
    if (prose) move.comment = move.comment ? `${move.comment} ${prose}` : prose;
  };

  const addNags = (nags) => {
    const move = lastMove();
    if (!move || nags.length === 0) return;
    for (const nag of nags) if (!move.nags.includes(nag)) move.nags.push(nag);
  };

  const setResult = (result) => {
    ensureGame();
    game.result = result;
    sawResultToken = true;
    inMovetext = true;
  };

  const bailOut = (reason) => {
    ensureGame();
    if (!game.invalid) {
      game.invalid = true;
      game.error = reason;
    }
  };

  const pushMove = (token) => {
    ensureGame();
    inMovetext = true;
    if (game.invalid) return;
    const { san, nags } = cleanSanToken(token);
    if (!san) return;
    game.moves.push(makeMove(san, nags));
  };

  // --- main scan -----------------------------------------------------------

  let i = 0;
  while (i < n) {
    const ch = src[i];

    if (WHITESPACE.has(ch)) {
      i += 1;
      continue;
    }

    // PGN escape mechanism: '%' in column 1 comments out the whole line.
    if (ch === '%' && (i === 0 || src[i - 1] === '\n')) {
      while (i < n && src[i] !== '\n') i += 1;
      continue;
    }

    if (ch === '[') {
      // A tag pair after movetext means the previous game ended.
      if (game && inMovetext) startGame();
      else ensureGame();

      const slice = src.slice(i);
      let m = /^\[\s*([A-Za-z0-9_+#=:-]+)\s+"((?:[^"\\]|\\.)*)"\s*\]/.exec(slice);
      if (m) {
        game.tags[m[1]] = m[2].replace(/\\(["\\])/g, '$1');
        i += m[0].length;
        continue;
      }
      m = /^\[\s*([A-Za-z0-9_+#=:-]+)\s+([^\]\n]*)\]/.exec(slice);
      if (m) {
        game.tags[m[1]] = m[2].trim().replace(/^"|"$/g, '');
        i += m[0].length;
        continue;
      }
      // Malformed tag: skip to the end of the line rather than looping.
      while (i < n && src[i] !== '\n') i += 1;
      continue;
    }

    if (ch === '{') {
      ensureGame();
      const { body, end } = readBraceComment(i);
      i = end;
      applyComment(body);
      continue;
    }

    if (ch === ';') {
      ensureGame();
      let j = i + 1;
      while (j < n && src[j] !== '\n') j += 1;
      applyComment(src.slice(i + 1, j));
      i = j;
      continue;
    }

    if (ch === '(') {
      ensureGame();
      i = skipVariation(i);
      continue;
    }

    if (ch === ')' || ch === '}') {
      i += 1; // stray closer — ignore
      continue;
    }

    if (ch === '$') {
      const m = /^\$(\d+)/.exec(src.slice(i));
      if (m) {
        addNags([Number.parseInt(m[1], 10)]);
        i += m[0].length;
      } else {
        i += 1;
      }
      continue;
    }

    if (ch === '!' || ch === '?') {
      const m = /^[!?]+/.exec(src.slice(i));
      addNags(glyphsToNags(m[0]));
      i += m[0].length;
      continue;
    }

    if (ch === '*') {
      setResult('*');
      i += 1;
      continue;
    }

    if (ch >= '0' && ch <= '9') {
      const slice = src.slice(i, i + 24);

      // Castling written with digit zero must win over the '0-1' result.
      let m = /^(0-0-0|0-0)(?!-)([+#!?]*)/.exec(slice);
      if (m) {
        pushMove(m[0]);
        i += m[0].length;
        continue;
      }

      m = /^(1\/2-1\/2|1-0|0-1)/.exec(slice);
      if (m) {
        setResult(m[1]);
        i += m[0].length;
        continue;
      }

      // Move number, with or without trailing dots.
      m = /^\d+[\s]*\.*/.exec(slice);
      if (m && m[0].length > 0) {
        i += m[0].length;
        continue;
      }
      i += 1;
      continue;
    }

    if (ch === '-') {
      const m = /^[^\s{};()$]+/.exec(src.slice(i));
      const token = m ? m[0] : '-';
      if (NULL_MOVE_TOKENS.has(token)) {
        bailOut(`null move "${token}" is not supported; game ${games.length} abandoned`);
      }
      i += token.length;
      continue;
    }

    // Anything else: a SAN token (or a null move spelt with letters).
    {
      const m = /^[^\s{};()$!?]+[!?]*/.exec(src.slice(i));
      if (!m) {
        i += 1;
        continue;
      }
      const token = m[0];
      if (NULL_MOVE_TOKENS.has(token)) {
        bailOut(`null move "${token}" is not supported; game ${games.length} abandoned`);
        i += token.length;
        continue;
      }
      if (RESULTS.has(token)) {
        setResult(token);
        i += token.length;
        continue;
      }
      pushMove(token);
      i += token.length;
      continue;
    }
  }

  // Fall back to the Result tag when no result token closed the movetext.
  for (const g of games) {
    if (!RESULTS.has(g.result)) g.result = '*';
    computeMoveSeconds(g);
  }
  // `sawResultToken` only matters for the game currently being built.
  void sawResultToken;

  for (const g of games) {
    if (g.result === '*' && RESULTS.has(g.tags.Result)) g.result = g.tags.Result;
  }

  return games;
}

/**
 * Seconds spent on ply n = clk[n-2] - clk[n] + increment (same player).
 * The first move of each side has no prior reading and stays null — never 0.
 */
function computeMoveSeconds(game) {
  const increment = parseIncrement(game.tags.TimeControl);
  for (let i = 0; i < game.moves.length; i += 1) {
    const move = game.moves[i];
    if (i < 2) {
      move.moveSeconds = null; // first move of each side: not measurable
      continue;
    }
    const prev = game.moves[i - 2];
    if (prev.clockSeconds === null || move.clockSeconds === null) {
      move.moveSeconds = null;
      continue;
    }
    move.moveSeconds = round3(prev.clockSeconds - move.clockSeconds + increment);
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const SAN_PATTERN = /^([PNBRQK])?([a-h])?([1-8])?(x)?([a-h][1-8])(?:=([QRBNqrbn]))?[+#]?$/;

/**
 * Play a SAN string on `chess`, tolerating over-disambiguated notation such as
 * `Qh4xe1` which the engine itself would render as `Qxe1`.
 * @returns {object|null} the decorated move, or null if it is not legal.
 */
function playSan(chess, san) {
  const direct = chess.move(san);
  if (direct) return direct;

  const bare = san.replace(/[+#?!]+$/, '');
  if (bare !== san) {
    const retry = chess.move(bare);
    if (retry) return retry;
  }

  const m = SAN_PATTERN.exec(bare);
  if (!m) return null;
  const [, pieceLetter, fromFile, fromRank, , toSquare, promotion] = m;
  const piece = pieceLetter ? pieceLetter.toLowerCase() : PAWN;
  const promo = promotion ? promotion.toLowerCase() : null;

  const candidates = chess.moves({ verbose: true }).filter((mv) => {
    if (mv.piece !== piece) return false;
    if (mv.to !== toSquare) return false;
    if (fromFile && mv.from[0] !== fromFile) return false;
    if (fromRank && mv.from[1] !== fromRank) return false;
    if (promo && mv.promotion !== promo) return false;
    return true;
  });

  if (candidates.length === 0) return null;
  const first = candidates[0];
  const allSame = candidates.every(
    (mv) => mv.from === first.from && mv.to === first.to && mv.promotion === first.promotion,
  );
  if (!allSame) return null; // genuinely ambiguous — refuse to guess

  return chess.move({ from: first.from, to: first.to, promotion: first.promotion || undefined });
}

/** "12. Nf6" / "12... Nf6" style label for error messages. */
function moveLabel(moveNumber, turn, san) {
  return turn === 'w' ? `${moveNumber}. ${san}` : `${moveNumber}... ${san}`;
}

/**
 * Parse `text`, then replay every mainline SAN through the engine.
 *
 * Throws on the first illegal move, naming the move number and the SAN, and on
 * any game that `parsePgn()` marked invalid (null moves). On success each move
 * record gains a `fenBefore` field — the FEN of the position the move was
 * played from, which the analyzer needs.
 *
 * @param {string} text
 * @returns {ReturnType<typeof parsePgn>} games, with `fenBefore` on each move
 */
export function parseAndValidate(text) {
  const games = parsePgn(text);

  games.forEach((game, index) => {
    const label = `game ${index + 1}`;
    if (game.invalid) {
      throw new Error(`PGN ${label}: ${game.error}`);
    }

    const startFen =
      typeof game.tags.FEN === 'string' && game.tags.FEN.trim() ? game.tags.FEN.trim() : START_FEN;

    let chess;
    try {
      chess = new Chess(startFen);
    } catch (cause) {
      throw new Error(`PGN ${label}: unusable FEN tag "${startFen}": ${cause.message}`);
    }

    for (const move of game.moves) {
      const moveNumber = chess.moveNumber;
      const turn = chess.turn;
      move.fenBefore = chess.fen();
      const played = playSan(chess, move.san);
      if (!played) {
        throw new Error(
          `PGN ${label}: illegal move ${moveLabel(moveNumber, turn, move.san)} ` +
            `(ply ${game.moves.indexOf(move) + 1}) in position ${move.fenBefore}`,
        );
      }
    }
  });

  return games;
}

export default parsePgn;
