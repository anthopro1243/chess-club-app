/*
 * ai.js — a computer opponent for the Chess Club app.
 *
 * Negamax with alpha-beta pruning, iterative deepening under a time budget,
 * MVV-LVA move ordering, and a capture-only quiescence search at the leaves
 * so the engine doesn't hang pieces one ply past the horizon. Evaluation is
 * material plus the standard piece-square tables.
 *
 * No dependencies beyond chess.js. Runs equally well on the main thread or
 * inside aiWorker.js — it only touches the Chess instance it's given.
 */

import { Chess, WHITE, algebraic } from './chess.js';

const PIECE_VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

// Tables read top row first (rank 8) to bottom row last (rank 1), from
// White's point of view. Black looks up the mirrored row.
const PST = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0,
    5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -20, -20, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, 10, 10, 10, 10, 5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    0, 0, 0, 5, 5, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20,
    20, 30, 10, 0, 0, 10, 30, 20,
  ],
  kEndgame: [
    -50, -40, -30, -20, -20, -30, -40, -50,
    -30, -20, -10, 0, 0, -10, -20, -30,
    -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -30, 0, 0, 0, 0, -30, -30,
    -50, -30, -30, -30, -30, -30, -30, -50,
  ],
};

const ENDGAME_MATERIAL_THRESHOLD = 3200;
const MATE_VALUE = 100000;
const QUIESCENCE_MAX_PLY = 6;
const TIME_UP = Symbol('time-up');

const DIFFICULTY = {
  easy: { maxDepth: 2, timeBudgetMs: 300, randomness: 40 },
  medium: { maxDepth: 3, timeBudgetMs: 700, randomness: 15 },
  hard: { maxDepth: 5, timeBudgetMs: 1800, randomness: 0 },
};

let nodeCount = 0;
let deadlineAt = Infinity;

function checkTime() {
  nodeCount += 1;
  if ((nodeCount & 1023) === 0 && performance.now() > deadlineAt) {
    throw TIME_UP;
  }
}

function isEndgame(chess) {
  let nonPawnMaterial = 0;
  for (let sq = 0; sq <= 119; sq += 1) {
    if (sq & 0x88) {
      sq += 7;
      continue;
    }
    const ch = chess.board[sq];
    if (!ch) continue;
    const type = ch.toLowerCase();
    if (type !== 'p' && type !== 'k') nonPawnMaterial += PIECE_VALUE[type] || 0;
  }
  return nonPawnMaterial <= ENDGAME_MATERIAL_THRESHOLD;
}

function evaluate(chess) {
  const endgame = isEndgame(chess);
  let score = 0;
  for (let sq = 0; sq <= 119; sq += 1) {
    if (sq & 0x88) {
      sq += 7;
      continue;
    }
    const ch = chess.board[sq];
    if (!ch) continue;
    const color = ch === ch.toUpperCase() ? WHITE : 'b';
    const type = ch.toLowerCase();
    const rank = sq >> 4;
    const file = sq & 15;
    const row = color === WHITE ? rank : 7 - rank;
    const table = type === 'k' ? (endgame ? PST.kEndgame : PST.k) : PST[type];
    const value = PIECE_VALUE[type] + table[row * 8 + file];
    score += color === WHITE ? value : -value;
  }
  return score;
}

function moveOrderScore(move) {
  let score = 0;
  if (move.captured) score += 10 * (PIECE_VALUE[move.captured] || 0) - (PIECE_VALUE[move.piece] || 0);
  if (move.promotion) score += PIECE_VALUE[move.promotion] || 0;
  return score;
}

function orderMoves(moves) {
  return [...moves].sort((a, b) => moveOrderScore(b) - moveOrderScore(a));
}

function quiescence(chess, alpha, beta, ply) {
  checkTime();
  const standPat = (chess.turn === WHITE ? 1 : -1) * evaluate(chess);
  if (standPat >= beta) return beta;
  if (standPat > alpha) alpha = standPat;
  if (ply >= QUIESCENCE_MAX_PLY) return alpha;

  const captures = orderMoves(chess._generateMoves({}).filter((m) => m.captured || m.promotion));
  for (const move of captures) {
    chess._applyMove(move);
    const score = -quiescence(chess, -beta, -alpha, ply + 1);
    chess._undoMove();
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(chess, depth, alpha, beta, ply) {
  checkTime();
  const moves = chess._generateMoves({});
  if (moves.length === 0) {
    return chess.isKingAttacked(chess.turn) ? -(MATE_VALUE - ply) : 0;
  }
  if (depth === 0) return quiescence(chess, alpha, beta, 0);

  let best = -Infinity;
  for (const move of orderMoves(moves)) {
    chess._applyMove(move);
    const score = -negamax(chess, depth - 1, -beta, -alpha, ply + 1);
    chess._undoMove();
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

function searchRoot(chess, depth, deadline) {
  deadlineAt = deadline;
  const moves = orderMoves(chess._generateMoves({}));
  let alpha = -Infinity;
  const beta = Infinity;
  const ranked = [];

  for (const move of moves) {
    chess._applyMove(move);
    const score = -negamax(chess, depth - 1, -beta, -alpha, 1);
    chess._undoMove();
    ranked.push({ move, score });
    if (score > alpha) alpha = score;
  }

  ranked.sort((a, b) => b.score - a.score);
  return { ranked };
}

function toResult(move) {
  return {
    from: algebraic(move.from),
    to: algebraic(move.to),
    promotion: move.promotion || undefined,
  };
}

/**
 * Pick a move for the side to move in `fen`.
 * Returns { from, to, promotion } in algebraic notation, or null if there is
 * no legal move (the caller should not have asked in that position).
 */
export function chooseMove(fen, { difficulty = 'medium' } = {}) {
  const chess = new Chess(fen);
  const config = DIFFICULTY[difficulty] || DIFFICULTY.medium;
  const deadline = performance.now() + config.timeBudgetMs;

  const legalMoves = chess._generateMoves({});
  if (legalMoves.length === 0) return null;
  if (legalMoves.length === 1) return toResult(legalMoves[0]);

  let result = null;
  for (let depth = 1; depth <= config.maxDepth; depth += 1) {
    try {
      result = searchRoot(chess, depth, deadline);
    } catch (error) {
      if (error !== TIME_UP) throw error;
      break;
    }
    if (performance.now() >= deadline) break;
  }

  if (!result) result = { ranked: legalMoves.map((move) => ({ move, score: 0 })) };

  let chosen = result.ranked[0].move;
  if (config.randomness > 0 && result.ranked.length > 1) {
    const top = result.ranked[0].score;
    const pool = result.ranked.filter((r) => top - r.score <= config.randomness);
    chosen = pool[Math.floor(Math.random() * pool.length)].move;
  }

  return toResult(chosen);
}

export const DIFFICULTIES = Object.keys(DIFFICULTY);
