/*
 * endgames.js — the endgame curriculum by rating band (research F028) and
 * the rules for "play it out against the engine" (F029).
 *
 * Bands follow Silman's rating-class order, as the research recommends:
 *   under 1000   basic mates
 *   1000–1199    opposition and the rook pawn
 *   1200–1399    king-and-pawn endings
 *   1400–1599    Lucena, Philidor, opposite-coloured bishops
 *
 * Every position here was checked with Stockfish 18 (depth 24) before it was
 * added, and its goal is what the engine says with best play: "win" drills
 * are won for the side to move, "draw" drills are held. The player always
 * plays the side to move; the engine plays the other side at full strength.
 */

export const BANDS = Object.freeze([
  { key: 'basic', label: 'Basic mates', max: 999 },
  { key: 'opposition', label: 'Opposition and the rook pawn', max: 1199 },
  { key: 'kingpawn', label: 'King-and-pawn endings', max: 1399 },
  { key: 'rook', label: 'Rook endings and bishops', max: Infinity },
]);

/*
 * successWhen:
 *   mate     — checkmate the engine's king
 *   promote  — promote to a queen while the engine still rates it winning
 *   hold     — reach a draw, or survive `holdMoves` without the position going
 *              lost (checked with the engine at the end)
 */
export const POSITIONS = Object.freeze([
  { id: 'kqk', band: 'basic', title: 'Queen and king vs king', fen: '8/8/8/4k3/8/8/8/4K2Q w - - 0 1', goal: 'win', successWhen: 'mate', maxMoves: 20,
    idea: 'Box the king in with the queen a knight\'s move away, then bring your own king up to help mate.' },
  { id: 'krk', band: 'basic', title: 'Rook and king vs king', fen: '8/8/8/4k3/8/8/8/R3K3 w - - 0 1', goal: 'win', successWhen: 'mate', maxMoves: 30,
    idea: 'Use the rook to cut the king off, shrink the box a rank at a time, and bring your king to face theirs.' },
  { id: 'krrk', band: 'basic', title: 'The two-rook ladder', fen: '8/8/3k4/8/8/8/8/R3K2R w - - 0 1', goal: 'win', successWhen: 'mate', maxMoves: 12,
    idea: 'The rooks take turns checking and guarding, pushing the king to the edge one rank at a time.' },
  { id: 'kqk-stalemate', band: 'basic', title: 'Mate without stalemating', fen: 'k7/8/2K5/8/8/8/8/6Q1 w - - 0 1', goal: 'win', successWhen: 'mate', maxMoves: 6,
    idea: 'The king is almost trapped already. Before every quiet queen move, check the king still has a square — or it\'s stalemate.' },
  { id: 'opposition', band: 'opposition', title: 'Take the opposition', fen: '8/8/4k3/8/8/4K3/4P3/8 w - - 0 1', goal: 'win', successWhen: 'promote', maxMoves: 25,
    idea: 'Lead with the king, not the pawn. Get your king in front of the pawn and take the opposition.' },
  { id: 'king-in-front', band: 'opposition', title: 'King in front of the pawn', fen: '4k3/8/4K3/4P3/8/8/8/8 w - - 0 1', goal: 'win', successWhen: 'promote', maxMoves: 15,
    idea: 'With your king on the sixth rank in front of the pawn, the pawn queens whoever is to move. Don\'t rush the pawn.' },
  { id: 'rook-pawn', band: 'opposition', title: 'Hold the rook pawn', fen: '7k/8/6K1/7P/8/8/8/8 b - - 0 1', goal: 'draw', successWhen: 'hold', holdMoves: 15,
    idea: 'A king in the corner in front of a rook pawn can\'t be forced out. Shuffle between the corner squares.' },
  { id: 'square', band: 'kingpawn', title: 'The rule of the square', fen: '7k/8/8/8/p7/8/8/4K3 w - - 0 1', goal: 'draw', successWhen: 'hold', holdMoves: 8,
    idea: 'Picture the square from the pawn to its queening rank. If your king can step into it, you catch the pawn.' },
  { id: 'outside-pawn', band: 'kingpawn', title: 'The outside passed pawn', fen: '8/6k1/6p1/8/P7/6P1/6K1/8 w - - 0 1', goal: 'win', successWhen: 'promote', maxMoves: 30,
    idea: 'Push the far pawn to drag their king away, then march your king to eat the pawns it left behind.' },
  { id: 'wrong-bishop', band: 'kingpawn', title: 'The wrong-coloured bishop', fen: '7k/8/8/7P/8/8/8/1B4K1 b - - 0 1', goal: 'draw', successWhen: 'hold', holdMoves: 15,
    idea: 'Their bishop can\'t control h8. Keep your king in the corner and they can never force it out.' },
  { id: 'lucena', band: 'rook', title: 'The Lucena position (build a bridge)', fen: '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1', goal: 'win', successWhen: 'promote', maxMoves: 20,
    idea: 'Cut their king off, bring your rook to the fourth rank, then use it as a bridge to block the checks.' },
  { id: 'philidor', band: 'rook', title: 'The Philidor defence', fen: '3k4/8/r7/3PK3/8/8/8/7R b - - 0 1', goal: 'draw', successWhen: 'hold', holdMoves: 20,
    idea: 'Keep your rook on your third rank until their pawn advances, then check from behind.' },
  { id: 'opposite-bishops', band: 'rook', title: 'Opposite-coloured bishops', fen: '8/8/4k3/3p4/3P1P2/4K3/2B5/5b2 b - - 0 1', goal: 'draw', successWhen: 'hold', holdMoves: 20,
    idea: 'Blockade on the squares your bishop controls. A pawn down is still a draw if their pawns can\'t pass.' },
]);

/** The band for a rating; an unknown rating starts at the beginning. */
export function bandForRating(rating) {
  if (!Number.isFinite(rating)) return BANDS[0].key;
  return BANDS.find((b) => rating <= b.max).key;
}

export const positionsForBand = (band) => POSITIONS.filter((p) => p.band === band);
export const positionById = (id) => POSITIONS.find((p) => p.id === id) ?? null;

/** Engine score from the player's side; positive is good for the player. */
const WINNING_CP = 500;
const HOLDING_CP = -150;
const isWinning = (e) => e != null && (e.mate != null ? e.mate > 0 : e.cp >= WINNING_CP);
const isHeld = (e) => e != null && (e.mate != null ? e.mate > 0 : e.cp >= HOLDING_CP);

/**
 * Has the drill been passed, failed, or is it still going?
 *
 * @param {object} args
 *   chess         the position after the latest move (engine/chess.js Chess)
 *   position      the drill (from POSITIONS)
 *   playerColor   'w' | 'b' — the side the player plays
 *   playerMoves   how many moves the player has made
 *   lastMove      the latest move object ({color, promotion, ...}) or null
 *   evalForPlayer {cp, mate} from the player's side, when one is available
 * @returns {{status: 'playing'|'success'|'fail', reason?: string, needsEval?: boolean}}
 */
export function judge({ chess, position, playerColor, playerMoves = 0, lastMove = null, evalForPlayer = null }) {
  if (!chess || !position) return { status: 'playing' };
  const toMove = typeof chess.turn === 'function' ? chess.turn() : chess.turn;

  if (chess.isCheckmate()) {
    const winner = toMove === 'w' ? 'b' : 'w';
    return winner === playerColor
      ? { status: 'success', reason: 'Checkmate.' }
      : { status: 'fail', reason: 'You were checkmated. Try again.' };
  }

  const drawReason = chess.isStalemate() ? 'Stalemate: the king had no move but wasn\'t in check.'
    : chess.isInsufficientMaterial() ? 'Not enough material left to mate.'
      : chess.isThreefoldRepetition() ? 'Draw by repetition.'
        : chess.isFiftyMoveRule() ? 'Fifty-move rule.' : null;
  if (drawReason) {
    return position.goal === 'draw'
      ? { status: 'success', reason: `${drawReason} You held the draw.` }
      : { status: 'fail', reason: `${drawReason} That lets them off. Try again.` };
  }

  if (position.successWhen === 'promote' && lastMove?.color === playerColor && lastMove?.promotion) {
    if (lastMove.promotion !== 'q') return { status: 'playing' };
    if (evalForPlayer == null) return { status: 'playing', needsEval: true };
    return isWinning(evalForPlayer)
      ? { status: 'success', reason: 'Promoted, and the win is there.' }
      : { status: 'fail', reason: 'You promoted, but the new queen can\'t hold the win. Try again.' };
  }

  if (position.goal === 'win' && position.maxMoves && playerMoves >= position.maxMoves) {
    return { status: 'fail', reason: `Not done within ${position.maxMoves} moves. Try again, a little more directly.` };
  }

  if (position.goal === 'draw' && position.holdMoves && playerMoves >= position.holdMoves && toMove === playerColor) {
    if (evalForPlayer == null) return { status: 'playing', needsEval: true };
    return isHeld(evalForPlayer)
      ? { status: 'success', reason: `You held it for ${position.holdMoves} moves.` }
      : { status: 'fail', reason: 'The position slipped. Try again.' };
  }

  return { status: 'playing' };
}

/** The id recorded in puzzle_attempts for a drill, so completion syncs with no schema change. */
export const attemptIdFor = (position) => `endgame:${position.id}`;

/** Which drills a player has passed, from their puzzle attempts. */
export function passedDrills(attempts = [], playerId) {
  return new Set(
    (attempts || [])
      .filter((a) => a.playerId === playerId && a.correct && String(a.puzzleId).startsWith('endgame:'))
      .map((a) => String(a.puzzleId).slice('endgame:'.length)),
  );
}

/** Progress through the player's band: {passed, total, done}. */
export function bandProgress(attempts, playerId, band) {
  const passed = passedDrills(attempts, playerId);
  const drills = positionsForBand(band);
  const count = drills.filter((d) => passed.has(d.id)).length;
  return { passed: count, total: drills.length, done: drills.length > 0 && count === drills.length };
}
