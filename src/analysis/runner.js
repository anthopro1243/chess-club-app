/*
 * runner.js — drives analysis in the browser.
 *
 * Its own engine instance, deliberately: createEngine() spawns a fresh Web
 * Worker, so analysis never contends with the Play page's opponent. Two engine
 * instances is fine; one engine serving two consumers is a bug factory.
 *
 * The queue is drained lazily while the app is open, so nobody watches a
 * progress bar, plus a coach-facing "analyze everything pending" for after
 * club night.
 */

import { createEngine } from '../engine/stockfishClient.js';
import { analyzeGame, criticalMomentsAsPuzzles, TOURNAMENT_DEPTH, DEFAULT_DEPTH } from './analyzeGame.js';
import { saveAnalysis, saveSkillScores, dequeueGame } from '../data/analysisStore.js';
import { aggregateRaw, rubricScores, updatePlayerScores } from './scoring.js';

let engine = null;
let busy = false;

/** Lazily start the analysis engine; reused across games. */
function getEngine() {
  if (!engine) engine = createEngine();
  return engine;
}

export function shutdownEngine() {
  if (engine) {
    engine.terminate();
    engine = null;
  }
}

export const isBusy = () => busy;

/**
 * Analyse one archived game and persist both sides.
 *
 * @param {object} game a row from gamesStore (needs pgn, id, player ids)
 */
export async function analyzeArchivedGame(game, opts = {}) {
  if (!game?.pgn) return { ok: false, error: 'that game has no PGN to analyse' };
  busy = true;
  try {
    const analysis = await analyzeGame(game.pgn, getEngine(), {
      depth: opts.depth ?? (game.tournament ? TOURNAMENT_DEPTH : DEFAULT_DEPTH),
      gameId: game.id,
      whitePlayerId: game.whitePlayerId || null,
      blackPlayerId: game.blackPlayerId || null,
      signal: opts.signal,
      onProgress: opts.onProgress,
    });

    const saved = await saveAnalysis(analysis.rows);
    if (!saved.ok) return { ok: false, error: saved.error };

    return { ok: true, analysis, puzzles: puzzlesFrom(analysis, game) };
  } catch (error) {
    return { ok: false, error: error.message };
  } finally {
    busy = false;
  }
}

/** Every critical moment on both sides, as own-game puzzles for that player. */
export function puzzlesFrom(analysis, game) {
  return [
    ...criticalMomentsAsPuzzles(analysis, 'w', {
      playerId: game.whitePlayerId || null,
      playedAt: game.playedAt || null,
    }),
    ...criticalMomentsAsPuzzles(analysis, 'b', {
      playerId: game.blackPlayerId || null,
      playedAt: game.playedAt || null,
    }),
  ].filter((p) => p.playerId);
}

/**
 * Re-derive a player's tracked scores from every game of theirs analysed so
 * far, then store them. Aggregating the raw metrics and scoring once is not the
 * same as averaging per-game scores, and the former is what scoring.js wants.
 */
export async function refreshPlayerScores(playerId, analysesForPlayer, previous = null) {
  if (!playerId || !analysesForPlayer?.length) return { ok: false, error: 'nothing to score' };
  const raw = aggregateRaw(analysesForPlayer.map((a) => ({ raw: a.raw })));
  const scores = rubricScores(raw);
  const tracked = updatePlayerScores(previous, scores);
  const result = await saveSkillScores(playerId, tracked, {
    gameId: analysesForPlayer[0]?.gameId ?? null,
  });
  return { ...result, scores, tracked };
}

/**
 * Drain the queue one game at a time. Sequential on purpose: a single-threaded
 * WASM engine gains nothing from being asked two questions at once, and the
 * page stays responsive between games.
 */
export async function drainQueue(games, queue, { signal, onGame } = {}) {
  const byId = new Map(games.map((g) => [g.id, g]));
  const done = [];
  for (const gameId of queue) {
    if (signal?.aborted) break;
    const game = byId.get(gameId);
    if (!game) {
      dequeueGame(gameId); // archived game has gone; stop asking for it
      continue;
    }
    const result = await analyzeArchivedGame(game, { signal });
    onGame?.(game, result);
    if (result.ok) done.push(gameId);
  }
  return done;
}
