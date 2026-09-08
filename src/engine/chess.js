/*
 * chess.js — dependency-free chess rules engine for the Chess Club app.
 *
 * 0x88 board representation. Provides full legal move generation, castling,
 * en passant, promotion, check / checkmate / stalemate, the draw rules
 * (50-move, threefold repetition, insufficient material), FEN parsing and
 * generation, SAN notation with correct disambiguation, and PGN export.
 *
 * No npm dependencies. Verified against standard perft node counts.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const WHITE = 'w';
export const BLACK = 'b';

export const PAWN = 'p';
export const KNIGHT = 'n';
export const BISHOP = 'b';
export const ROOK = 'r';
export const QUEEN = 'q';
export const KING = 'k';

export const START_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// 0x88 board: a8 = 0, h8 = 7, a1 = 112, h1 = 119.
// A square index is on the board iff (index & 0x88) === 0.
const SQUARES = {};
(function buildSquareTable() {
  const files = 'abcdefgh';
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      SQUARES[files[file] + (8 - rank)] = rank * 16 + file;
    }
  }
})();
export { SQUARES };

const PIECE_OFFSETS = {
  n: [-18, -33, -31, -14, 18, 33, 31, 14],
  b: [-17, -15, 17, 15],
  r: [-16, 1, 16, -1],
  q: [-17, -16, -15, 1, 17, 16, 15, -1],
  k: [-17, -16, -15, 1, 17, 16, 15, -1],
};

const PAWN_PUSH = { w: -16, b: 16 };
const PAWN_CAPTURES = { w: [-17, -15], b: [17, 15] };
const SECOND_RANK = { w: 6, b: 1 }; // 0-indexed rank rows in 0x88 terms
const PROMOTION_RANK = { w: 0, b: 7 };

// Castling rights bit flags
const CASTLE_WK = 1;
const CASTLE_WQ = 2;
const CASTLE_BK = 4;
const CASTLE_BQ = 8;

// Move flags
export const FLAGS = {
  NORMAL: 'n',
  CAPTURE: 'c',
  BIG_PAWN: 'b',
  EP_CAPTURE: 'e',
  PROMOTION: 'p',
  KSIDE_CASTLE: 'k',
  QSIDE_CASTLE: 'q',
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const rankOf = (sq) => sq >> 4;
const fileOf = (sq) => sq & 15;
const onBoard = (sq) => (sq & 0x88) === 0;

export function algebraic(sq) {
  return 'abcdefgh'[fileOf(sq)] + (8 - rankOf(sq));
}

function swapColor(c) {
  return c === WHITE ? BLACK : WHITE;
}

function isUpper(ch) {
  return ch >= 'A' && ch <= 'Z';
}

/** Turn a board character ('P', 'n', ...) into { type, color }. */
function decode(ch) {
  if (!ch) return null;
  return { type: ch.toLowerCase(), color: isUpper(ch) ? WHITE : BLACK };
}

function encode(type, color) {
  return color === WHITE ? type.toUpperCase() : type.toLowerCase();
}

// ---------------------------------------------------------------------------
// The Chess class
// ---------------------------------------------------------------------------

export class Chess {
  constructor(fen = START_FEN) {
    this.load(fen);
  }

  // -- setup ---------------------------------------------------------------

  load(fen) {
    const parts = fen.trim().split(/\s+/);
    if (parts.length < 4) throw new Error('Invalid FEN: not enough fields');

    const board = new Array(128).fill(null);
    let sq = 0;
    for (const ch of parts[0]) {
      if (ch === '/') {
        sq += 8; // skip the off-board half of the 0x88 row
      } else if (ch >= '1' && ch <= '8') {
        sq += Number(ch);
      } else {
        if (!onBoard(sq)) throw new Error('Invalid FEN: board overflow');
        board[sq] = ch;
        sq += 1;
      }
    }

    this.board = board;
    this.turn = parts[1] === 'b' ? BLACK : WHITE;

    let castling = 0;
    if (parts[2].includes('K')) castling |= CASTLE_WK;
    if (parts[2].includes('Q')) castling |= CASTLE_WQ;
    if (parts[2].includes('k')) castling |= CASTLE_BK;
    if (parts[2].includes('q')) castling |= CASTLE_BQ;
    this.castling = castling;

    this.epSquare = parts[3] === '-' ? -1 : SQUARES[parts[3]];
    this.halfMoves = parts.length > 4 ? Number(parts[4]) : 0;
    this.moveNumber = parts.length > 5 ? Number(parts[5]) : 1;

    // Track king squares incrementally — legality filtering asks for them on
    // every generated move, so scanning the board each time is wasteful.
    this.kings = { w: -1, b: -1 };
    for (let i = 0; i <= 119; i++) {
      if (i & 0x88) {
        i += 7;
        continue;
      }
      if (board[i] === 'K') this.kings.w = i;
      else if (board[i] === 'k') this.kings.b = i;
    }

    this.history = [];
    this.positionCounts = new Map();
    this._countPosition();
    return this;
  }

  reset() {
    return this.load(START_FEN);
  }

  clone() {
    const copy = new Chess(this.fen());
    // Carry repetition history across so draw detection stays accurate.
    copy.positionCounts = new Map(this.positionCounts);
    return copy;
  }

  // -- reading the position ------------------------------------------------

  /** Piece at a square, e.g. get('e4') -> { type: 'p', color: 'w' } or null. */
  get(square) {
    const sq = typeof square === 'number' ? square : SQUARES[square];
    if (sq === undefined || !onBoard(sq)) return null;
    return decode(this.board[sq]);
  }

  /** 8x8 array of rows from rank 8 down to rank 1, for rendering. */
  boardArray() {
    const rows = [];
    for (let r = 0; r < 8; r++) {
      const row = [];
      for (let f = 0; f < 8; f++) {
        const sq = r * 16 + f;
        const piece = decode(this.board[sq]);
        row.push(piece ? { ...piece, square: algebraic(sq) } : null);
      }
      rows.push(row);
    }
    return rows;
  }

  fen() {
    let empty = 0;
    let out = '';
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const piece = this.board[r * 16 + f];
        if (!piece) {
          empty += 1;
        } else {
          if (empty > 0) {
            out += empty;
            empty = 0;
          }
          out += piece;
        }
      }
      if (empty > 0) {
        out += empty;
        empty = 0;
      }
      if (r < 7) out += '/';
    }

    let rights = '';
    if (this.castling & CASTLE_WK) rights += 'K';
    if (this.castling & CASTLE_WQ) rights += 'Q';
    if (this.castling & CASTLE_BK) rights += 'k';
    if (this.castling & CASTLE_BQ) rights += 'q';
    if (!rights) rights = '-';

    const ep = this.epSquare === -1 ? '-' : algebraic(this.epSquare);
    return `${out} ${this.turn} ${rights} ${ep} ${this.halfMoves} ${this.moveNumber}`;
  }

  /** FEN without the move counters — the key used for repetition detection. */
  positionKey() {
    return this.fen().split(' ').slice(0, 4).join(' ');
  }

  // -- attack and check detection -----------------------------------------

  /**
   * Does `color` attack `square`?
   *
   * Radiates outward from the target square rather than scanning the whole
   * board, which keeps legality filtering (and therefore perft) fast.
   */
  isAttacked(color, square) {
    const enemyPawn = encode(PAWN, color);
    const enemyKnight = encode(KNIGHT, color);
    const enemyKing = encode(KING, color);
    const enemyBishop = encode(BISHOP, color);
    const enemyRook = encode(ROOK, color);
    const enemyQueen = encode(QUEEN, color);

    // Pawns. A white pawn attacks "up" the board, so to be attacked BY white
    // the pawn must sit on the squares black pawns would capture toward.
    for (const offset of PAWN_CAPTURES[swapColor(color)]) {
      const sq = square + offset;
      if (onBoard(sq) && this.board[sq] === enemyPawn) return true;
    }

    // Knights
    for (const offset of PIECE_OFFSETS.n) {
      const sq = square + offset;
      if (onBoard(sq) && this.board[sq] === enemyKnight) return true;
    }

    // King
    for (const offset of PIECE_OFFSETS.k) {
      const sq = square + offset;
      if (onBoard(sq) && this.board[sq] === enemyKing) return true;
    }

    // Diagonal sliders: bishop / queen
    for (const offset of PIECE_OFFSETS.b) {
      let sq = square + offset;
      while (onBoard(sq)) {
        const ch = this.board[sq];
        if (ch) {
          if (ch === enemyBishop || ch === enemyQueen) return true;
          break;
        }
        sq += offset;
      }
    }

    // Straight sliders: rook / queen
    for (const offset of PIECE_OFFSETS.r) {
      let sq = square + offset;
      while (onBoard(sq)) {
        const ch = this.board[sq];
        if (ch) {
          if (ch === enemyRook || ch === enemyQueen) return true;
          break;
        }
        sq += offset;
      }
    }

    return false;
  }

  kingSquare(color) {
    if (this.kings && this.kings[color] !== -1) return this.kings[color];
    const target = encode(KING, color);
    for (let sq = 0; sq <= 119; sq++) {
      if (sq & 0x88) {
        sq += 7;
        continue;
      }
      if (this.board[sq] === target) return sq;
    }
    return -1;
  }

  isKingAttacked(color) {
    const king = this.kingSquare(color);
    if (king === -1) return false;
    return this.isAttacked(swapColor(color), king);
  }

  inCheck() {
    return this.isKingAttacked(this.turn);
  }

  // -- move generation -----------------------------------------------------

  /**
   * Legal moves.
   * options.square — restrict to moves originating from that square.
   * options.verbose — return move objects instead of SAN strings.
   */
  moves({ square = null, verbose = false } = {}) {
    const legal = this._generateMoves({
      from: square == null ? null : (typeof square === 'number' ? square : SQUARES[square]),
    });
    if (verbose) {
      return legal.map((m) => this._decorate(m));
    }
    return legal.map((m) => this._toSan(m));
  }

  _generateMoves({ from = null, legalOnly = true } = {}) {
    const us = this.turn;
    const them = swapColor(us);
    const moves = [];

    const addMove = (fromSq, toSq, flags) => {
      const piece = decode(this.board[fromSq]);
      const captured = this.board[toSq] ? decode(this.board[toSq]).type : null;

      if (piece.type === PAWN && rankOf(toSq) === PROMOTION_RANK[us]) {
        for (const promo of [QUEEN, ROOK, BISHOP, KNIGHT]) {
          moves.push({
            color: us,
            from: fromSq,
            to: toSq,
            piece: piece.type,
            captured,
            promotion: promo,
            flags: flags + FLAGS.PROMOTION,
          });
        }
        return;
      }

      moves.push({
        color: us,
        from: fromSq,
        to: toSq,
        piece: piece.type,
        captured: flags.includes(FLAGS.EP_CAPTURE) ? PAWN : captured,
        promotion: null,
        flags,
      });
    };

    const first = from == null ? 0 : from;
    const last = from == null ? 119 : from;

    for (let sq = first; sq <= last; sq++) {
      if (sq & 0x88) {
        sq += 7;
        continue;
      }
      const ch = this.board[sq];
      if (!ch) continue;
      const piece = decode(ch);
      if (piece.color !== us) continue;

      if (piece.type === PAWN) {
        const push = sq + PAWN_PUSH[us];
        if (onBoard(push) && !this.board[push]) {
          addMove(sq, push, FLAGS.NORMAL);
          const double = sq + 2 * PAWN_PUSH[us];
          if (rankOf(sq) === SECOND_RANK[us] && onBoard(double) && !this.board[double]) {
            addMove(sq, double, FLAGS.BIG_PAWN);
          }
        }
        for (const offset of PAWN_CAPTURES[us]) {
          const target = sq + offset;
          if (!onBoard(target)) continue;
          if (this.board[target]) {
            if (decode(this.board[target]).color === them) {
              addMove(sq, target, FLAGS.CAPTURE);
            }
          } else if (target === this.epSquare) {
            addMove(sq, target, FLAGS.EP_CAPTURE);
          }
        }
        continue;
      }

      const single = piece.type === KNIGHT || piece.type === KING;
      for (const offset of PIECE_OFFSETS[piece.type]) {
        let cursor = sq;
        for (;;) {
          cursor += offset;
          if (!onBoard(cursor)) break;
          if (!this.board[cursor]) {
            addMove(sq, cursor, FLAGS.NORMAL);
          } else {
            if (decode(this.board[cursor]).color === them) {
              addMove(sq, cursor, FLAGS.CAPTURE);
            }
            break;
          }
          if (single) break;
        }
      }
    }

    // Castling. Generated whenever the king is included in the scan.
    const kingSq = this.kingSquare(us);
    if (kingSq !== -1 && (from == null || from === kingSq)) {
      const kingSideFlag = us === WHITE ? CASTLE_WK : CASTLE_BK;
      const queenSideFlag = us === WHITE ? CASTLE_WQ : CASTLE_BQ;

      if (this.castling & kingSideFlag) {
        const f1 = kingSq + 1;
        const g1 = kingSq + 2;
        const rookSq = kingSq + 3;
        if (
          !this.board[f1] &&
          !this.board[g1] &&
          this.board[rookSq] === encode(ROOK, us) &&
          !this.isAttacked(them, kingSq) &&
          !this.isAttacked(them, f1) &&
          !this.isAttacked(them, g1)
        ) {
          moves.push({
            color: us,
            from: kingSq,
            to: g1,
            piece: KING,
            captured: null,
            promotion: null,
            flags: FLAGS.KSIDE_CASTLE,
          });
        }
      }

      if (this.castling & queenSideFlag) {
        const d1 = kingSq - 1;
        const c1 = kingSq - 2;
        const b1 = kingSq - 3;
        const rookSq = kingSq - 4;
        if (
          !this.board[d1] &&
          !this.board[c1] &&
          !this.board[b1] &&
          this.board[rookSq] === encode(ROOK, us) &&
          !this.isAttacked(them, kingSq) &&
          !this.isAttacked(them, d1) &&
          !this.isAttacked(them, c1)
        ) {
          moves.push({
            color: us,
            from: kingSq,
            to: c1,
            piece: KING,
            captured: null,
            promotion: null,
            flags: FLAGS.QSIDE_CASTLE,
          });
        }
      }
    }

    if (!legalOnly) return moves;

    // Filter out anything that leaves our own king in check.
    const legal = [];
    for (const move of moves) {
      this._applyMove(move);
      if (!this.isKingAttacked(us)) legal.push(move);
      this._undoMove();
    }
    return legal;
  }

  // -- making moves --------------------------------------------------------

  /**
   * Play a move. Accepts SAN ('Nf3', 'O-O', 'exd8=Q+') or an object
   * { from: 'e2', to: 'e4', promotion: 'q' }. Returns the decorated move,
   * or null if the move is not legal in this position.
   */
  move(input) {
    const legal = this._generateMoves({});

    let chosen = null;
    if (typeof input === 'string') {
      const wanted = input.replace(/[+#?!]+$/, '');
      chosen =
        legal.find((m) => this._toSan(m).replace(/[+#]+$/, '') === wanted) || null;
    } else if (input && typeof input === 'object') {
      const from = typeof input.from === 'number' ? input.from : SQUARES[input.from];
      const to = typeof input.to === 'number' ? input.to : SQUARES[input.to];
      const promotion = input.promotion ? input.promotion.toLowerCase() : null;
      chosen =
        legal.find(
          (m) =>
            m.from === from &&
            m.to === to &&
            (!m.promotion || !promotion || m.promotion === promotion),
        ) || null;
      // A promotion move must specify which piece; default to queen.
      if (chosen && chosen.promotion && !promotion) {
        chosen = legal.find((m) => m.from === from && m.to === to && m.promotion === QUEEN);
      }
    }

    if (!chosen) return null;

    const san = this._toSan(chosen);
    const decorated = this._decorate(chosen, san);
    this._applyMove(chosen, { san, record: true });
    this._countPosition();
    return decorated;
  }

  /** Take back the last move. Returns the undone move, or null. */
  undo() {
    if (!this.history.length) return null;
    const key = this.positionKey();
    const count = this.positionCounts.get(key);
    if (count !== undefined) {
      if (count <= 1) this.positionCounts.delete(key);
      else this.positionCounts.set(key, count - 1);
    }
    const entry = this._undoMove();
    return entry ? this._decorate(entry.move, entry.san) : null;
  }

  _applyMove(move, { san = null, record = false } = {}) {
    const us = move.color;
    const them = swapColor(us);

    this.history.push({
      move,
      san,
      recorded: record,
      castling: this.castling,
      epSquare: this.epSquare,
      halfMoves: this.halfMoves,
      moveNumber: this.moveNumber,
      turn: this.turn,
      capturedChar: this.board[move.to],
      epCapturedSquare: null,
    });
    const entry = this.history[this.history.length - 1];

    this.board[move.to] = this.board[move.from];
    this.board[move.from] = null;

    if (move.flags.includes(FLAGS.EP_CAPTURE)) {
      const capturedSq = move.to + (us === WHITE ? 16 : -16);
      entry.epCapturedSquare = capturedSq;
      entry.capturedChar = this.board[capturedSq];
      this.board[capturedSq] = null;
    }

    if (move.promotion) {
      this.board[move.to] = encode(move.promotion, us);
    }

    if (move.flags === FLAGS.KSIDE_CASTLE) {
      this.board[move.to - 1] = this.board[move.to + 1];
      this.board[move.to + 1] = null;
    } else if (move.flags === FLAGS.QSIDE_CASTLE) {
      this.board[move.to + 1] = this.board[move.to - 2];
      this.board[move.to - 2] = null;
    }

    // Castling rights: lose them when king or rook moves, or a rook is captured.
    if (move.piece === KING) {
      this.kings[us] = move.to;
      this.castling &= us === WHITE ? ~(CASTLE_WK | CASTLE_WQ) : ~(CASTLE_BK | CASTLE_BQ);
    }
    if (move.from === SQUARES.h1 || move.to === SQUARES.h1) this.castling &= ~CASTLE_WK;
    if (move.from === SQUARES.a1 || move.to === SQUARES.a1) this.castling &= ~CASTLE_WQ;
    if (move.from === SQUARES.h8 || move.to === SQUARES.h8) this.castling &= ~CASTLE_BK;
    if (move.from === SQUARES.a8 || move.to === SQUARES.a8) this.castling &= ~CASTLE_BQ;

    // En passant target square
    if (move.flags.includes(FLAGS.BIG_PAWN)) {
      this.epSquare = move.to + (us === WHITE ? 16 : -16);
    } else {
      this.epSquare = -1;
    }

    // Halfmove clock
    if (move.piece === PAWN || move.captured) this.halfMoves = 0;
    else this.halfMoves += 1;

    if (us === BLACK) this.moveNumber += 1;
    this.turn = them;
  }

  _undoMove() {
    const entry = this.history.pop();
    if (!entry) return null;
    const { move } = entry;

    this.turn = entry.turn;
    this.castling = entry.castling;
    this.epSquare = entry.epSquare;
    this.halfMoves = entry.halfMoves;
    this.moveNumber = entry.moveNumber;

    const us = move.color;
    if (move.piece === KING) this.kings[us] = move.from;

    this.board[move.from] = move.promotion ? encode(PAWN, us) : this.board[move.to];
    this.board[move.to] = null;

    if (entry.epCapturedSquare != null) {
      this.board[entry.epCapturedSquare] = entry.capturedChar;
    } else if (entry.capturedChar) {
      this.board[move.to] = entry.capturedChar;
    }

    if (move.flags === FLAGS.KSIDE_CASTLE) {
      this.board[move.to + 1] = this.board[move.to - 1];
      this.board[move.to - 1] = null;
    } else if (move.flags === FLAGS.QSIDE_CASTLE) {
      this.board[move.to - 2] = this.board[move.to + 1];
      this.board[move.to + 1] = null;
    }

    return entry;
  }

  // -- notation ------------------------------------------------------------

  _toSan(move) {
    if (move.flags === FLAGS.KSIDE_CASTLE) return this._withCheck(move, 'O-O');
    if (move.flags === FLAGS.QSIDE_CASTLE) return this._withCheck(move, 'O-O-O');

    let out = '';
    if (move.piece !== PAWN) {
      out += move.piece.toUpperCase();
      out += this._disambiguate(move);
    }

    if (move.captured) {
      if (move.piece === PAWN) out += 'abcdefgh'[fileOf(move.from)];
      out += 'x';
    }

    out += algebraic(move.to);

    if (move.promotion) out += '=' + move.promotion.toUpperCase();

    return this._withCheck(move, out);
  }

  _withCheck(move, san) {
    this._applyMove(move);
    const opponentInCheck = this.isKingAttacked(this.turn);
    let suffix = '';
    if (opponentInCheck) {
      const replies = this._generateMoves({});
      suffix = replies.length === 0 ? '#' : '+';
    }
    this._undoMove();
    return san + suffix;
  }

  _disambiguate(move) {
    const others = this._generateMoves({}).filter(
      (m) => m.piece === move.piece && m.to === move.to && m.from !== move.from,
    );
    if (others.length === 0) return '';

    const sameFile = others.some((m) => fileOf(m.from) === fileOf(move.from));
    const sameRank = others.some((m) => rankOf(m.from) === rankOf(move.from));

    if (!sameFile) return 'abcdefgh'[fileOf(move.from)];
    if (!sameRank) return String(8 - rankOf(move.from));
    return algebraic(move.from);
  }

  _decorate(move, san = null) {
    return {
      color: move.color,
      from: algebraic(move.from),
      to: algebraic(move.to),
      fromIndex: move.from,
      toIndex: move.to,
      piece: move.piece,
      captured: move.captured,
      promotion: move.promotion,
      flags: move.flags,
      san: san || this._toSan(move),
    };
  }

  /** Every move played so far, as SAN strings (or verbose objects). */
  moveHistory({ verbose = false } = {}) {
    const played = this.history.filter((h) => h.recorded);
    if (!verbose) return played.map((h) => h.san);
    return played.map((h) => this._decorate(h.move, h.san));
  }

  // -- game state ----------------------------------------------------------

  isCheckmate() {
    return this.inCheck() && this._generateMoves({}).length === 0;
  }

  isStalemate() {
    return !this.inCheck() && this._generateMoves({}).length === 0;
  }

  isInsufficientMaterial() {
    const counts = { w: [], b: [] };
    for (let sq = 0; sq <= 119; sq++) {
      if (sq & 0x88) {
        sq += 7;
        continue;
      }
      const ch = this.board[sq];
      if (!ch) continue;
      const piece = decode(ch);
      if (piece.type !== KING) counts[piece.color].push({ type: piece.type, sq });
    }
    const all = [...counts.w, ...counts.b];
    if (all.length === 0) return true; // K vs K
    if (all.length === 1 && (all[0].type === BISHOP || all[0].type === KNIGHT)) return true;
    // K+B vs K+B with all bishops on the same colour complex
    if (all.length > 0 && all.every((p) => p.type === BISHOP)) {
      const colors = new Set(all.map((p) => (rankOf(p.sq) + fileOf(p.sq)) % 2));
      if (colors.size === 1) return true;
    }
    return false;
  }

  isThreefoldRepetition() {
    return (this.positionCounts.get(this.positionKey()) || 0) >= 3;
  }

  isFiftyMoveRule() {
    return this.halfMoves >= 100;
  }

  isDraw() {
    return (
      this.isStalemate() ||
      this.isInsufficientMaterial() ||
      this.isThreefoldRepetition() ||
      this.isFiftyMoveRule()
    );
  }

  isGameOver() {
    return this.isCheckmate() || this.isDraw();
  }

  /** Human-readable result state for the UI. */
  status() {
    if (this.isCheckmate()) {
      return {
        over: true,
        result: this.turn === WHITE ? '0-1' : '1-0',
        reason: 'checkmate',
        text: `Checkmate — ${this.turn === WHITE ? 'Black' : 'White'} wins`,
      };
    }
    if (this.isStalemate()) {
      return { over: true, result: '1/2-1/2', reason: 'stalemate', text: 'Draw by stalemate' };
    }
    if (this.isInsufficientMaterial()) {
      return {
        over: true,
        result: '1/2-1/2',
        reason: 'insufficient material',
        text: 'Draw — insufficient material',
      };
    }
    if (this.isThreefoldRepetition()) {
      return {
        over: true,
        result: '1/2-1/2',
        reason: 'threefold repetition',
        text: 'Draw by threefold repetition',
      };
    }
    if (this.isFiftyMoveRule()) {
      return {
        over: true,
        result: '1/2-1/2',
        reason: 'fifty-move rule',
        text: 'Draw by the fifty-move rule',
      };
    }
    return {
      over: false,
      result: '*',
      reason: this.inCheck() ? 'check' : null,
      text: this.inCheck()
        ? `${this.turn === WHITE ? 'White' : 'Black'} is in check`
        : `${this.turn === WHITE ? 'White' : 'Black'} to move`,
    };
  }

  _countPosition() {
    const key = this.positionKey();
    this.positionCounts.set(key, (this.positionCounts.get(key) || 0) + 1);
  }

  // -- PGN -----------------------------------------------------------------

  pgn(headers = {}) {
    const defaults = {
      Event: 'Chess Club',
      Site: 'Chess Club App',
      Date: new Date().toISOString().slice(0, 10).replace(/-/g, '.'),
      Round: '-',
      White: 'White',
      Black: 'Black',
      Result: this.status().result,
    };
    const merged = { ...defaults, ...headers };
    const tagOrder = ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result'];
    const tags = tagOrder
      .concat(Object.keys(merged).filter((k) => !tagOrder.includes(k)))
      .map((k) => `[${k} "${merged[k]}"]`)
      .join('\n');

    const sans = this.moveHistory();
    const startedBlack = this.history.length > 0 && this.history[0].move.color === BLACK;

    const tokens = [];
    let moveNo = this.history.length ? this._startingMoveNumber() : 1;
    let i = 0;
    if (startedBlack && sans.length) {
      tokens.push(`${moveNo}...${sans[0]}`);
      i = 1;
      moveNo += 1;
    }
    for (; i < sans.length; i += 2) {
      const white = sans[i];
      const black = sans[i + 1];
      tokens.push(`${moveNo}. ${white}${black ? ' ' + black : ''}`);
      moveNo += 1;
    }

    // Wrap the movetext at 80 columns, as PGN readers expect.
    const lines = [];
    let line = '';
    for (const token of tokens.concat([merged.Result])) {
      if (line.length + token.length + 1 > 80) {
        lines.push(line);
        line = token;
      } else {
        line = line ? `${line} ${token}` : token;
      }
    }
    if (line) lines.push(line);

    return `${tags}\n\n${lines.join('\n')}\n`;
  }

  _startingMoveNumber() {
    const first = this.history[0];
    return first ? first.moveNumber : 1;
  }
}

// ---------------------------------------------------------------------------
// perft — move-generation correctness test used by the test suite
// ---------------------------------------------------------------------------

export function perft(chess, depth) {
  if (depth === 0) return 1;
  const moves = chess._generateMoves({});
  if (depth === 1) return moves.length;
  let nodes = 0;
  for (const move of moves) {
    chess._applyMove(move);
    nodes += perft(chess, depth - 1);
    chess._undoMove();
  }
  return nodes;
}

export default Chess;
