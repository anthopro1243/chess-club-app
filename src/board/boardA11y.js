/*
 * boardA11y.js — what the chessboard says to someone who cannot see it, and
 * how its keyboard focus moves.
 *
 * Kept out of Board.jsx on purpose: every sentence a screen reader speaks is
 * decided here, as a pure function of the move or square, so the wording can
 * be pinned in node:test without a browser. The board component only decides
 * WHEN to speak.
 *
 * Wording rules, in the order they matter to a player listening at speed:
 *   1. Say who moved before what moved ("White knight", not "Knight, white"),
 *      because a player tracking the game needs the side first.
 *   2. Name the captured piece. "captures on e5" alone makes a listener
 *      reconstruct the position to learn what was lost.
 *   3. Check and mate come last, after a comma, where a listener expects them.
 * Squares are spoken as written ("e4"). Screen readers pronounce that well,
 * and it is the same notation the player types into the move box.
 */

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

export const PIECE_WORDS = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

const COLOR_WORDS = { w: 'white', b: 'black' };

const capitalise = (text) => text.charAt(0).toUpperCase() + text.slice(1);

export function isSquare(value) {
  return typeof value === 'string' && /^[a-h][1-8]$/.test(value);
}

/** "White" or "Black", for the start of a sentence. */
export function sideName(color) {
  return color === 'b' ? 'Black' : 'White';
}

/** "white knight", or '' when there is no piece. */
export function pieceName(piece) {
  if (!piece || !PIECE_WORDS[piece.type] || !COLOR_WORDS[piece.color]) return '';
  return `${COLOR_WORDS[piece.color]} ${PIECE_WORDS[piece.type]}`;
}

/**
 * The accessible name of one square, e.g. "e4, white knight".
 *
 * An empty square says "empty" rather than just its name, so a listener
 * arrowing across the board hears a definite answer on every square instead
 * of having to notice that nothing followed the coordinate.
 *
 * @param {string} square
 * @param {{type: string, color: string} | null} piece
 * @param {{selected?: boolean, target?: 'move' | 'capture' | null,
 *          check?: boolean, lastMoveFrom?: boolean, lastMoveTo?: boolean}} state
 */
export function describeSquare(square, piece, state = {}) {
  const parts = [square, piece ? pieceName(piece) : 'empty'];
  if (state.check) parts.push('in check');
  if (state.selected) parts.push('selected');
  // Decided by the move, not by whether the square is occupied: an en
  // passant capture lands on an empty square and is still a capture.
  if (state.target === 'capture') parts.push('legal capture');
  else if (state.target === 'move') parts.push('legal move');
  if (state.lastMoveTo) parts.push('last move ended here');
  else if (state.lastMoveFrom) parts.push('last move started here');
  return parts.join(', ');
}

const NAV_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']);

const clamp = (n) => Math.min(7, Math.max(0, n));

/**
 * Where keyboard focus goes from `square` when `key` is pressed.
 *
 * Arrows follow the SCREEN, not the rank numbers: with Black at the bottom,
 * ArrowUp goes from e5 to e4, because that is the square above it on the
 * screen. A sighted helper pointing at the board and a keyboard player must
 * agree on what "up" means. Focus stops at the edge instead of wrapping,
 * which is the ARIA grid convention and stops a8 silently becoming h1.
 *
 * @returns {string|null} the new square, or null if `key` is not a
 *   navigation key (so the caller knows not to swallow it).
 */
export function stepSquare(square, key, orientation = 'w') {
  if (!isSquare(square) || !NAV_KEYS.has(key)) return null;
  let file = FILES.indexOf(square[0]);
  let rank = Number(square[1]) - 1;
  const flip = orientation === 'b' ? -1 : 1;
  switch (key) {
    case 'ArrowUp':
      rank += flip;
      break;
    case 'ArrowDown':
      rank -= flip;
      break;
    case 'ArrowRight':
      file += flip;
      break;
    case 'ArrowLeft':
      file -= flip;
      break;
    case 'Home':
      file = orientation === 'b' ? 7 : 0;
      break;
    case 'End':
      file = orientation === 'b' ? 0 : 7;
      break;
    default:
      return null;
  }
  return FILES[clamp(file)] + (clamp(rank) + 1);
}

/**
 * The square that takes the board's single tab stop before the player has
 * moved focus anywhere: the last move's destination if there is one (that is
 * what they will want to inspect after the opponent moves), otherwise the
 * bottom-left corner as they see the board.
 */
export function defaultFocusSquare(orientation = 'w', lastMove = null) {
  if (lastMove && isSquare(lastMove.to)) return lastMove.to;
  return orientation === 'b' ? 'h8' : 'a1';
}

const isCastle = (move) => move.flags === 'k' || move.flags === 'q';

/**
 * One move as a spoken sentence, e.g. "White knight to f3." or
 * "Black knight captures pawn on e5, check."
 *
 * @param {object} move a verbose move from the engine ({color, piece, to,
 *   captured, promotion, flags, san}).
 * @param {object|null} status the engine's status() AFTER the move. Used for
 *   draws, which the move's SAN cannot express; checkmate and check are read
 *   from the SAN suffix and cross-checked against it.
 * @returns {string} a complete sentence ending in a full stop, or '' for no move.
 */
export function describeMove(move, status = null) {
  if (!move || !PIECE_WORDS[move.piece]) return '';
  const side = sideName(move.color);
  let text;
  if (isCastle(move)) {
    text = `${side} castles ${move.flags === 'k' ? 'kingside' : 'queenside'}`;
  } else {
    const mover = `${side} ${PIECE_WORDS[move.piece]}`;
    if (move.captured) {
      const enPassant = typeof move.flags === 'string' && move.flags.includes('e');
      text = `${mover} captures ${PIECE_WORDS[move.captured]} on ${move.to}${enPassant ? ' en passant' : ''}`;
    } else {
      text = `${mover} to ${move.to}`;
    }
    if (move.promotion) text += `, promotes to ${PIECE_WORDS[move.promotion]}`;
  }

  const san = move.san || '';
  const mate = san.endsWith('#') || status?.reason === 'checkmate';
  if (mate) return `${text}, checkmate. ${side} wins.`;
  if (san.endsWith('+') || status?.reason === 'check') text += ', check';

  let sentence = `${text}.`;
  // Stalemate, repetition and the rest end the game without any mark in the
  // SAN, so without this a listener would never learn the game was over.
  if (status?.over && status.text) sentence += ` ${status.text}.`;
  return sentence;
}

/** A list read the way people say it: "a", "a or b", "a, b or c". */
export function joinOr(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

/**
 * What the board says when a piece is picked up: which piece, and where it
 * can go. Listing the destinations is the keyboard equivalent of the dots a
 * sighted player sees, and saves arrowing over every square to find them.
 *
 * @param {string} square
 * @param {{type, color}} piece
 * @param {object[]} moves the piece's legal verbose moves.
 */
export function describeSelection(square, piece, moves) {
  const who = capitalise(pieceName(piece));
  // A promotion appears four times, once per piece; the square is one choice.
  const seen = new Set();
  const destinations = [];
  for (const move of moves) {
    if (seen.has(move.to)) continue;
    seen.add(move.to);
    if (isCastle(move)) destinations.push(`${move.to} (castles)`);
    else if (move.captured) destinations.push(`takes ${move.to}`);
    else destinations.push(move.to);
  }
  if (destinations.length === 0) return `${who} on ${square} selected. It has no legal moves.`;
  const count = destinations.length;
  return `${who} on ${square} selected. ${count} legal move${count === 1 ? '' : 's'}: ${destinations.join(', ')}.`;
}

/** Why pressing Enter on this square picked nothing up. */
export function describeCannotSelect(square, piece, turn) {
  const side = sideName(turn);
  if (!piece) return `${square} is empty. Pick one of ${side}'s pieces.`;
  return `${square} has a ${pieceName(piece)}. It is ${side}'s move.`;
}

/** Why the chosen destination was refused. The selection is cleared, as a click would. */
export function describeIllegalTarget(from, piece, to) {
  return `${capitalise(pieceName(piece))} on ${from} can't move to ${to}. Selection cleared.`;
}

export const SELECTION_CLEARED = 'Selection cleared.';

export const BOARD_INSTRUCTIONS =
  'Arrow keys move around the board. Enter or Space picks up a piece, and again on a square puts it down. Escape cancels.';
