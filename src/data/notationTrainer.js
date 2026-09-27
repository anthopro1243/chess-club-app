/*
 * notationTrainer.js — practise writing and reading algebraic notation (F033).
 *
 * Pure logic on top of the club's own rules engine (src/engine/chess.js,
 * which is READ ONLY: this module only calls its public API). Two drills:
 *
 *   type — a move is shown on the board; write it the way a scoresheet
 *          needs it (Nbd7, exd8=Q+, O-O-O).
 *   play — a move is written; play it on the board.
 *
 * Why the grading is strict: a scoresheet is evidence. A triple-occurrence
 * or time claim is decided from it, and a sheet with "Nd7" where two knights
 * could go is a sheet a director cannot use. So the drill wants the exact
 * standard form, and when an answer is wrong it says WHY in words a
 * 700-rated player can act on ("two knights can reach d7: write Nbd7").
 *
 * The few things accepted as equal to the standard form are the ones real
 * scoresheets use: 0-0 for O-O, e8Q for e8=Q, a trailing "e.p." or "!?".
 */

import { Chess, START_FEN } from '../engine/chess.js';

// ---------------------------------------------------------------------------
// Reading what the player typed
// ---------------------------------------------------------------------------

/** Tidy a typed move into standard SAN spelling without changing what it says. */
export function normaliseSanInput(text) {
  let s = String(text ?? '').replace(/\s+/g, '');
  s = s.replace(/[!?]+$/, '');
  s = s.replace(/e\.?p\.?(?=[+#]?$)/i, '');
  const castle = /^([0oO])-\1(-\1)?([+#]?)$/.exec(s);
  if (castle) return `${castle[2] ? 'O-O-O' : 'O-O'}${castle[3]}`;
  // e8Q / e8=q / exd8(Q) -> e8=Q: all three appear on real scoresheets.
  s = s.replace(/^([a-h](?:x[a-h])?[18])(?:=|\()?([qrbnQRBN])\)?([+#]?)$/, (_, head, piece, check) => `${head}=${piece.toUpperCase()}${check}`);
  return s;
}

const PIECE_RE = /^([KQRBN])([a-h])?([1-8])?(x)?([a-h][1-8])([+#])?$/;
// The x is optional here so that "ed5" is understood (and then corrected to
// exd5) rather than rejected as gibberish.
const PAWN_RE = /^(?:([a-h])(x?))?([a-h][1-8])(?:=([QRBN]))?([+#])?$/;
const CASTLE_RE = /^O-O(-O)?([+#])?$/;

/**
 * Split a (normalised) SAN string into its parts, or return
 * `{ malformed: true, lowercase }` when it is not a move at all.
 */
export function parseSan(text) {
  const s = normaliseSanInput(text);
  let m = CASTLE_RE.exec(s);
  if (m) return { castle: m[1] ? 'q' : 'k', check: m[2] || '', text: s };

  m = PIECE_RE.exec(s);
  if (m) {
    return {
      piece: m[1].toLowerCase(),
      fromFile: m[2] || null,
      fromRank: m[3] || null,
      capture: !!m[4],
      to: m[5],
      promotion: null,
      check: m[6] || '',
      text: s,
    };
  }

  m = PAWN_RE.exec(s);
  if (m) {
    const to = m[3];
    return {
      piece: 'p',
      fromFile: m[1] || to[0],
      fromRank: null,
      capture: !!m[2],
      to,
      promotion: m[4] ? m[4].toLowerCase() : null,
      check: m[5] || '',
      text: s,
    };
  }

  // "nf3" is the commonest beginner slip. A lowercase b is left alone:
  // "bxc3" is a pawn capture, and guessing otherwise would be wrong.
  const lowercase = /^[kqrn]/.test(s) && PIECE_RE.test(s[0].toUpperCase() + s.slice(1));
  return { malformed: true, lowercase, text: s };
}

/**
 * Every legal move in `chess` that the parsed SAN could mean. Capture marks
 * and check marks are ignored here on purpose, so that "Nf3" for a knight
 * capture still finds the knight — the grader then explains the missing x.
 */
function candidatesFor(chess, parsed) {
  const legal = chess.moves({ verbose: true });
  if (parsed.castle) return legal.filter((m) => m.flags === (parsed.castle === 'k' ? 'k' : 'q'));
  return legal.filter(
    (m) =>
      m.piece === parsed.piece &&
      m.to === parsed.to &&
      (!parsed.fromFile || m.from[0] === parsed.fromFile) &&
      (!parsed.fromRank || m.from[1] === parsed.fromRank) &&
      (m.promotion || null) === (parsed.promotion || null),
  );
}

/**
 * What a typed move means in a position:
 *   { status: 'ok', move }            exactly one legal move
 *   { status: 'ambiguous', moves }    more than one (e.g. "Nd7" with two knights)
 *   { status: 'illegal' }             none
 *   { status: 'malformed', lowercase }not written as a move
 */
export function resolveSan(fen, text) {
  const parsed = parseSan(text);
  if (parsed.malformed) return { status: 'malformed', lowercase: parsed.lowercase, parsed };
  const chess = new Chess(fen);
  const moves = candidatesFor(chess, parsed);
  if (moves.length === 1) return { status: 'ok', move: moves[0], parsed };
  if (moves.length > 1) return { status: 'ambiguous', moves, parsed };
  return { status: 'illegal', parsed };
}

const stripCheck = (san) => san.replace(/[+#]$/, '');
const checkMark = (san) => (/[+#]$/.test(san) ? san.slice(-1) : '');
const sameMove = (a, b) =>
  !!a && !!b && a.from === b.from && a.to === b.to && (a.promotion || null) === (b.promotion || null);

/** The standard SAN of a move in a position, or throws if it is not legal there. */
export function canonicalSan(fen, move) {
  const chess = new Chess(fen);
  const played = chess.move(move);
  if (!played) throw new Error(`Not a legal move in ${fen}: ${JSON.stringify(move)}`);
  return played.san;
}

function disambiguationOf(parsed) {
  return `${parsed.fromFile && parsed.piece !== 'p' ? parsed.fromFile : ''}${parsed.fromRank || ''}`;
}

/**
 * Grade a typed answer against the move that was shown.
 *
 * Returns `{ correct, code, message, canonical }`. `code` is one of: ok,
 * empty, malformed, lowercase-piece, illegal, ambiguous, wrong-move,
 * missing-capture, extra-capture, over-disambiguated, wrong-disambiguation,
 * missing-check, extra-check, mate-mark, missing-promotion.
 */
export function gradeTypedSan(fen, expectedSan, typed) {
  const expected = new Chess(fen).move(expectedSan);
  if (!expected) throw new Error(`Expected move ${expectedSan} is not legal in ${fen}`);
  const canonical = expected.san;
  const answer = normaliseSanInput(typed);
  const verdict = (code, message) => ({ correct: code === 'ok', code, message, canonical });

  if (!answer) return verdict('empty', `Write the move, e.g. ${canonical}.`);
  if (answer === canonical) return verdict('ok', 'Correct.');

  const resolved = resolveSan(fen, answer);
  if (resolved.status === 'malformed') {
    if (resolved.lowercase) {
      return verdict('lowercase-piece', `Piece letters are capitals (K Q R B N); pawns have none. Write ${canonical}.`);
    }
    return verdict('malformed', `That is not written as a move. Write ${canonical}.`);
  }
  if (resolved.status === 'ambiguous') {
    const piece = resolved.parsed.piece.toUpperCase();
    return verdict(
      'ambiguous',
      `More than one ${piece === 'P' ? 'pawn' : 'piece'} can go to ${resolved.parsed.to}, so say which: ${resolved.moves
        .map((m) => m.san)
        .join(' or ')}. The move shown is ${canonical}.`,
    );
  }
  if (resolved.status === 'illegal') {
    const parsed = resolved.parsed;
    if (parsed.piece === 'p' && !parsed.promotion && /[18]$/.test(parsed.to) && expected.promotion) {
      return verdict('missing-promotion', `A pawn reaching the last rank must say what it becomes: ${canonical}.`);
    }
    return verdict('illegal', `No legal move matches ${answer} here. The move shown is ${canonical}.`);
  }
  if (!sameMove(resolved.move, expected)) {
    return verdict('wrong-move', `${resolved.move.san} is a legal move, but not the one shown. It was ${canonical}.`);
  }

  // Right move, wrong spelling. Say the most important difference first.
  const parsed = resolved.parsed;
  const isCapture = !!expected.captured;
  if (isCapture && !parsed.capture && !parsed.castle) {
    return verdict('missing-capture', `Right move, but it is a capture, so it needs an x: ${canonical}.`);
  }
  if (!isCapture && parsed.capture) {
    return verdict('extra-capture', `Right move, but nothing is captured, so no x: ${canonical}.`);
  }
  if (!parsed.castle && parsed.piece !== 'p') {
    const typedDis = disambiguationOf(parsed);
    const neededDis = stripCheck(canonical).replace(/^[KQRBN]/, '').replace(/x?[a-h][1-8]$/, '');
    if (typedDis !== neededDis) {
      if (!neededDis) {
        return verdict('over-disambiguated', `Right move, but only one ${parsed.piece.toUpperCase()} can go there, so write ${canonical}.`);
      }
      return verdict(
        'wrong-disambiguation',
        `Right move, but write it ${canonical}: use the file letter when it tells the pieces apart, the rank when it does not, and the full square only when neither does.`,
      );
    }
  }
  const want = checkMark(canonical);
  const got = parsed.check;
  if (want === '#' && got !== '#') return verdict('mate-mark', `Right move, and it is checkmate: write ${canonical}.`);
  if (want === '+' && !got) return verdict('missing-check', `Right move, but it gives check: write ${canonical}.`);
  if (!want && got) return verdict('extra-check', `Right move, but it is not check: write ${canonical}.`);
  if (want === '+' && got === '#') return verdict('extra-check', `Right move, but it is check, not mate: write ${canonical}.`);
  return verdict('wrong-disambiguation', `Write it exactly as ${canonical}.`);
}

/**
 * Grade a move played on the board against the SAN that was shown.
 * `played` is `{ from, to, promotion }`. Returns `{ correct, canonical, playedSan }`.
 */
export function gradePlayedMove(fen, expectedSan, played) {
  const expected = new Chess(fen).move(expectedSan);
  if (!expected) throw new Error(`Expected move ${expectedSan} is not legal in ${fen}`);
  const actual = new Chess(fen).move(played || {});
  return {
    correct: sameMove(actual, expected),
    canonical: expected.san,
    playedSan: actual ? actual.san : null,
  };
}

// ---------------------------------------------------------------------------
// Drills
// ---------------------------------------------------------------------------

/**
 * Replay a list of SAN moves and return one step per move: the position
 * before it, and the move in standard form. Throws on an illegal move, naming
 * it, so a bad sample game fails its test instead of a player's drill.
 */
export function replaySans(sans, startFen = START_FEN) {
  const chess = new Chess(startFen);
  return sans.map((san, i) => {
    const fen = chess.fen();
    const moveNumber = chess.moveNumber;
    const color = chess.turn;
    const move = chess.move(san);
    if (!move) throw new Error(`Move ${i + 1} (${san}) is illegal in ${fen}`);
    return {
      fen,
      san: move.san,
      from: move.from,
      to: move.to,
      promotion: move.promotion || null,
      color,
      moveNumber,
      label: color === 'w' ? `${moveNumber}.` : `${moveNumber}...`,
    };
  });
}

/** The first `plies` half-moves of a game as drill steps. */
export function buildGameDrill(game, plies) {
  const steps = replaySans(game.moves, game.startFen || START_FEN);
  return plies ? steps.slice(0, plies) : steps;
}

/** Skill positions as drill steps, in the order given (shuffle with `shuffle`). */
export function buildSkillsDrill(positions = SKILL_POSITIONS) {
  return positions.map((p) => {
    const fen = p.fen || positionAfter(p.setup || []);
    const [step] = replaySans([p.san], fen);
    return { ...step, id: p.id, category: p.category };
  });
}

/** The FEN after a list of SAN moves from the start. */
export function positionAfter(sans, startFen = START_FEN) {
  const chess = new Chess(startFen);
  sans.forEach((san, i) => {
    if (!chess.move(san)) throw new Error(`Setup move ${i + 1} (${san}) is illegal`);
  });
  return chess.fen();
}

/** Fisher-Yates with an injectable random source, so tests can pin the order. */
export function shuffle(list, random = Math.random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Totals for a finished drill: `results` is one boolean per step. */
export function summariseDrill(results, seconds) {
  const total = results.length;
  const score = results.filter(Boolean).length;
  return { score, total, accuracy: total ? score / total : 0, seconds: Math.max(0, Math.round(seconds || 0)) };
}

/**
 * Positions that each isolate one thing scoresheets get wrong. A setup is a
 * list of moves from the start (so the position is guaranteed reachable);
 * a few endgame positions are given as FEN. Every one is checked by the tests.
 */
export const SKILL_POSITIONS = [
  { id: 'castle-short', category: 'Castling', setup: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'], san: 'O-O' },
  {
    id: 'castle-long-black',
    category: 'Castling',
    setup: ['e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qa5', 'd4', 'Nc6', 'Nf3', 'Bg4', 'Be2'],
    san: 'O-O-O',
  },
  { id: 'castle-long-white', category: 'Castling', setup: ['d4', 'd5', 'Nc3', 'Nc6', 'Bf4', 'Bf5', 'Qd2', 'Qd7'], san: 'O-O-O' },
  { id: 'pawn-capture', category: 'Captures', setup: ['e4', 'd5'], san: 'exd5' },
  { id: 'piece-capture', category: 'Captures', setup: ['e4', 'e5', 'Nf3', 'Nf6'], san: 'Nxe5' },
  { id: 'bishop-takes-knight', category: 'Captures', setup: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'], san: 'Bxc6' },
  { id: 'en-passant', category: 'Captures', setup: ['e4', 'Nf6', 'e5', 'd5'], san: 'exd6' },
  { id: 'check', category: 'Checks', setup: ['e4', 'd6'], san: 'Bb5+' },
  { id: 'capture-check', category: 'Checks', setup: ['e4', 'e5', 'Bc4', 'Nc6'], san: 'Bxf7+' },
  { id: 'mate', category: 'Checks', setup: ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6'], san: 'Qxf7#' },
  { id: 'promote', category: 'Promotion', fen: '8/4P3/8/8/8/k7/8/4K3 w - - 0 1', san: 'e8=Q' },
  { id: 'promote-capture-check', category: 'Promotion', fen: '3r3k/4P3/8/8/8/8/8/4K3 w - - 0 1', san: 'exd8=Q+' },
  { id: 'underpromote', category: 'Promotion', fen: '8/5P1k/8/8/8/8/8/4K3 w - - 0 1', san: 'f8=N+' },
  {
    id: 'knights-file',
    category: 'Disambiguation',
    setup: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5'],
    san: 'Nbd7',
  },
  { id: 'rooks-file', category: 'Disambiguation', fen: '6k1/5ppp/8/8/8/8/5PPP/R4RK1 w - - 0 1', san: 'Rad1' },
  { id: 'rooks-rank', category: 'Disambiguation', fen: '6k1/5ppp/8/R7/8/8/5PPP/R5K1 w - - 0 1', san: 'R1a3' },
  { id: 'queens-square', category: 'Disambiguation', fen: '8/2k5/8/8/4Q2Q/8/8/K6Q w - - 0 1', san: 'Qh4e1' },
];

/*
 * Two real, complete games of 41+ moves, so the 40-move drill is a whole
 * scoresheet's worth. Chosen for the notation they exercise: both castle
 * (Fischer both ways, Kasparov long), and between them they need file AND
 * rank disambiguation (Rcf1, R1f2, R2f3, Rbb7, Nbxd5), captures and checks.
 * Moves are standard SAN; the tests replay every one through the engine.
 */
export const SAMPLE_GAMES = [
  {
    id: 'fischer-spassky-1972-g6',
    title: 'Fischer vs Spassky, Reykjavik 1972, game 6',
    moves: [
      'c4', 'e6', 'Nf3', 'd5', 'd4', 'Nf6', 'Nc3', 'Be7', 'Bg5', 'O-O',
      'e3', 'h6', 'Bh4', 'b6', 'cxd5', 'Nxd5', 'Bxe7', 'Qxe7', 'Nxd5', 'exd5',
      'Rc1', 'Be6', 'Qa4', 'c5', 'Qa3', 'Rc8', 'Bb5', 'a6', 'dxc5', 'bxc5',
      'O-O', 'Ra7', 'Be2', 'Nd7', 'Nd4', 'Qf8', 'Nxe6', 'fxe6', 'e4', 'd4',
      'f4', 'Qe7', 'e5', 'Rb8', 'Bc4', 'Kh8', 'Qh3', 'Nf8', 'b3', 'a5',
      'f5', 'exf5', 'Rxf5', 'Nh7', 'Rcf1', 'Qd8', 'Qg3', 'Re7', 'h4', 'Rbb7',
      'e6', 'Rbc7', 'Qe5', 'Qe8', 'a4', 'Qd8', 'R1f2', 'Qe8', 'R2f3', 'Qd8',
      'Bd3', 'Qe8', 'Qe4', 'Nf6', 'Rxf6', 'gxf6', 'Rxf6', 'Kg8', 'Bc4', 'Kh8',
      'Qf4',
    ],
  },
  {
    id: 'kasparov-topalov-1999',
    title: 'Kasparov vs Topalov, Wijk aan Zee 1999',
    moves: [
      'e4', 'd6', 'd4', 'Nf6', 'Nc3', 'g6', 'Be3', 'Bg7', 'Qd2', 'c6',
      'f3', 'b5', 'Nge2', 'Nbd7', 'Bh6', 'Bxh6', 'Qxh6', 'Bb7', 'a3', 'e5',
      'O-O-O', 'Qe7', 'Kb1', 'a6', 'Nc1', 'O-O-O', 'Nb3', 'exd4', 'Rxd4', 'c5',
      'Rd1', 'Nb6', 'g3', 'Kb8', 'Na5', 'Ba8', 'Bh3', 'd5', 'Qf4+', 'Ka7',
      'Rhe1', 'd4', 'Nd5', 'Nbxd5', 'exd5', 'Qd6', 'Rxd4', 'cxd4', 'Re7+', 'Kb6',
      'Qxd4+', 'Kxa5', 'b4+', 'Ka4', 'Qc3', 'Qxd5', 'Ra7', 'Bb7', 'Rxb7', 'Qc4',
      'Qxf6', 'Kxa3', 'Qxa6+', 'Kxb4', 'c3+', 'Kxc3', 'Qa1+', 'Kd2', 'Qb2+', 'Kd1',
      'Bf1', 'Rd2', 'Rd7', 'Rxd7', 'Bxc4', 'bxc4', 'Qxh8', 'Rd3', 'Qa8', 'c3',
      'Qa4+', 'Ke1', 'f4', 'f5', 'Kc1', 'Rd2', 'Qa7',
    ],
  },
];
