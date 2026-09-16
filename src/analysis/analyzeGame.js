/*
 * analyzeGame.js — the orchestrator.
 *
 * PGN in, one analysis row per side out, shaped for the `game_analyses` table
 * in supabase/migrations/0009_game_analysis.sql. Everything numeric comes from
 * scoring.js; nothing here recomputes a formula.
 */

import { parseAndValidate } from './pgn.js';
import { buildPlyRecords } from './buildPlyRecords.js';
import {
  analyseGameForSide,
  rubricScores,
  improvementPlan,
  CATEGORY_KEYS,
} from './scoring.js';

export const ENGINE_NAME = 'stockfish-18-lite-single';
export const SCHEMA_VERSION = 1;
export const DEFAULT_DEPTH = 14;
/** Tournament games get the deeper pass; see Decision 2 in the spec. */
export const TOURNAMENT_DEPTH = 16;
export const DEFAULT_MULTIPV = 3;
export const DEFAULT_MAX_NODES = 400000;

/** How many of a side's blunders carried each motif. */
export function countMotifs(plies, side) {
  const counts = {};
  for (const ply of plies) {
    if (ply.side !== side) continue;
    for (const motif of ply.motifs || []) counts[motif] = (counts[motif] || 0) + 1;
  }
  return counts;
}

/**
 * Analyse one game for both sides.
 *
 * @param {string} pgnText
 * @param {{evaluate: Function}} engine
 * @param {{gameIndex?: number, depth?: number, tournament?: boolean, multiPV?: number,
 *          maxNodes?: number, signal?: AbortSignal, onProgress?: Function,
 *          gameId?: string, whitePlayerId?: string, blackPlayerId?: string}} opts
 */
export async function analyzeGame(pgnText, engine, opts = {}) {
  const games = parseAndValidate(pgnText);
  const game = games[opts.gameIndex ?? 0];
  if (!game) throw new Error('analyzeGame: no game at that index');

  const depth = opts.depth ?? (opts.tournament ? TOURNAMENT_DEPTH : DEFAULT_DEPTH);
  const multiPV = opts.multiPV ?? DEFAULT_MULTIPV;
  const maxNodes = opts.maxNodes ?? DEFAULT_MAX_NODES;

  const { plies, meta } = await buildPlyRecords(game, engine, {
    depth,
    multiPV,
    maxNodes,
    signal: opts.signal,
    onProgress: opts.onProgress,
  });

  const perSide = {};
  for (const side of ['w', 'b']) {
    const report = analyseGameForSide(plies, side, meta);
    const scores = rubricScores(report.raw);
    const motifCounts = countMotifs(plies, side);
    perSide[side] = {
      side,
      report,
      scores,
      motifCounts,
      plan: improvementPlan(scores, motifCounts),
    };
  }

  return {
    game,
    meta: { ...meta, depth, multiPV, maxNodes, engine: ENGINE_NAME },
    plies,
    white: perSide.w,
    black: perSide.b,
    rows: ['w', 'b'].map((side) =>
      toAnalysisRow(perSide[side], {
        depth,
        multiPV,
        gameId: opts.gameId ?? null,
        playerId: side === 'w' ? opts.whitePlayerId ?? null : opts.blackPlayerId ?? null,
        plies,
      }),
    ),
  };
}

/**
 * Shape one side's results into a `game_analyses` row. Column names follow the
 * committed migration, which is the source of truth when it and the spec
 * disagree.
 */
export function toAnalysisRow(sideResult, { depth, multiPV, gameId, playerId, plies }) {
  const { report, scores, motifCounts, side } = sideResult;
  return {
    game_id: gameId,
    player_id: playerId,
    side,
    engine: ENGINE_NAME,
    depth,
    multipv: multiPV,
    schema_version: SCHEMA_VERSION,
    accuracy: report.accuracy,
    acpl: report.acpl,
    mean_win_loss: report.meanWinLoss,
    moves_played: report.movesPlayed,
    moves_counted: report.movesCounted,
    counts: report.counts ?? {},
    by_phase: report.byPhase ?? {},
    raw: report.raw ?? {},
    scores: Object.fromEntries(CATEGORY_KEYS.map((k) => [k, scores[k]])),
    critical: report.critical ?? [],
    motif_counts: motifCounts,
    plies: (plies || []).filter((p) => p.side === side),
  };
}

/**
 * Every critical moment is already a position plus the move that should have
 * been played — which is the definition of a puzzle. This is the cheap half of
 * "the loop": a player re-solving the position they dropped a rook in.
 */
export function criticalMomentsAsPuzzles(
  analysis,
  side,
  { playerId = null, playedAt = null, gameId = null } = {},
) {
  const sideResult = side === 'w' ? analysis.white : analysis.black;
  const byPly = new Map(analysis.plies.map((p) => [p.ply, p]));
  return (sideResult.report.critical ?? [])
    .filter((c) => c.better)
    .map((c) => {
      const ply = byPly.get(c.ply);
      return {
        fen: ply?.fen ?? null,
        solution: c.better,
        played: c.played,
        san: c.san,
        fullmove: c.fullmove ?? ply?.fullmove ?? null,
        themes: c.motifs?.length ? c.motifs : ['ownGame'],
        source: 'own-game',
        playerId,
        playedAt,
        gameId,
        winPercentLost: c.winPercentLost,
        label: c.label,
      };
    })
    .filter((p) => p.fen);
}

export default analyzeGame;
