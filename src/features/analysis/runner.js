/*
 * runner.js — drives analysis in the browser.
 *
 * Its own engine instance, deliberately: createEngine() spawns a fresh Web
 * Worker, so analysis never contends with the endgame trainer's opponent. Two engine
 * instances is fine; one engine serving two consumers is a bug factory.
 *
 * The queue is drained lazily while the app is open, so nobody watches a
 * progress bar, plus a coach-facing "analyze everything pending" for after
 * club night.
 */

import { createEngine } from '../../engine/stockfishClient.js';
import { analyzeGame, criticalMomentsAsPuzzles, TOURNAMENT_DEPTH, DEFAULT_DEPTH } from '../../analysis/analyzeGame.js';
import { saveAnalysis, saveSkillScores, analysesForScoring } from './analysisStore.js';
import { getGames } from '../games/gamesStore.js';
import { addOwnGamePuzzles } from '../training/ownPuzzleStore.js';
import { recordEngineAssessment } from '../coach/assessmentStore.js';
import { trackedScoresByDate } from '../../analysis/trackedScores.js';

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

/*
 * After a game overran its time limit. The engine may be wedged, so it is
 * thrown away (the next game starts a fresh one), and `busy` is released:
 * a hung analysis never settles, so its `finally` never runs, and without
 * this the queue would wait on it forever.
 */
export function resetAfterTimeout() {
  shutdownEngine();
  busy = false;
}

/**
 * Analyse one archived game and persist both sides.
 *
 * @param {object} game a row from gamesStore (needs pgn, id, player ids)
 */
export async function analyzeArchivedGame(game, opts = {}) {
  if (!game?.pgn) return { ok: false, error: 'that game has no PGN to analyze' };
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

    // The loop, part one: the player's own blunders become their own puzzles.
    const puzzles = puzzlesFrom(analysis, game);
    const queued = await addOwnGamePuzzles(puzzles);

    // The loop, part two: skill scores follow a new game on their own. Nobody
    // should have to press a button for the app to notice a game was played.
    const refreshed = [];
    if (opts.updateScores !== false) {
      for (const playerId of [game.whitePlayerId, game.blackPlayerId].filter(Boolean)) {
        const result = await refreshPlayerScoresFromStore(playerId, { gameId: game.id });
        if (result.ok) refreshed.push(playerId);
      }
    }

    return { ok: true, analysis, puzzles, puzzlesAdded: queued.added ?? 0, refreshed };
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
      gameId: game.id,
    }),
    ...criticalMomentsAsPuzzles(analysis, 'b', {
      playerId: game.blackPlayerId || null,
      playedAt: game.playedAt || null,
      gameId: game.id,
    }),
  ].filter((p) => p.playerId);
}

/**
 * Re-derive a player's tracked scores from every game of theirs analysed so
 * far, oldest to newest, then store them.
 *
 * The scores are rebuilt from the games each time rather than nudged from the
 * stored value (see trackedScores.js): the queue now works newest-first, and a
 * running average built in that order would let the oldest game, analysed
 * last, count for more than it should. Aggregating the raw metrics and scoring
 * once is not the same as averaging per-game scores, and the former is what
 * scoring.js wants.
 *
 * @param analysesForPlayer { gameId, playedAt, raw, movesPlayed, movesCounted, motifCounts }[]
 */
export async function refreshPlayerScores(playerId, analysesForPlayer, { gameId = null } = {}) {
  if (!playerId || !analysesForPlayer?.length) return { ok: false, error: 'nothing to score' };

  // The oversight denominator (movesPlayed) and the motif counts sit at the TOP
  // of each report, not inside `raw`; trackedScoresByDate carries them across.
  const { tracked, scores } = trackedScoresByDate(analysesForPlayer);

  // updatePlayerScores carries score/games/trend/confidence but not the
  // observation count, and the coach view labels a score by how much evidence
  // sits behind it. Carry n across from the scoring pass.
  const withCounts = Object.fromEntries(
    Object.entries(tracked).map(([key, entry]) => [
      key,
      { ...entry, n: scores[key]?.n ?? 0 },
    ]),
  );

  const result = await saveSkillScores(playerId, withCounts, { gameId });

  /*
   * And write the assessment itself.
   *
   * Storing scores was never the missing piece - the Coach page's "Last
   * assessed" column read "—" for every player because an assessment only
   * existed if a human typed one. This produces a dated assessment from the
   * games, capped at one per player per day, marked source 'engine' so a
   * coach's own entry always outranks it.
   */
  await recordEngineAssessment(playerId, withCounts, {
    gamesAnalysed: analysesForPlayer.length,
  });

  return { ...result, scores, tracked: withCounts };
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
    if (!game) continue; // archived game has gone
    const result = await analyzeArchivedGame(game, { signal });
    onGame?.(game, result);
    if (result.ok) done.push(gameId);
  }
  return done;
}

/**
 * Recompute one player's tracked scores from every analysis of theirs. Called
 * automatically after each game is analysed, so a coach never has to press
 * anything for the numbers to move.
 */
export async function refreshPlayerScoresFromStore(playerId, { gameId = null } = {}) {
  const dates = new Map(getGames().map((g) => [g.id, g.playedAt]));
  const mine = await analysesForScoring(playerId, { playedAtOf: (id) => dates.get(id) ?? null });
  if (!mine.length) return { ok: false, error: 'no analyses for that player' };
  return refreshPlayerScores(playerId, mine, { gameId });
}
