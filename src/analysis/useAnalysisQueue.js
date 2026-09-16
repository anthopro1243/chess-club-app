/*
 * useAnalysisQueue.js — drains the analysis queue while the app is open.
 *
 * Decision 3 in the spec: archiving a game marks it pending and a worker
 * drains the queue whenever the app is open and idle. The point is that no
 * game ever sits waiting for a human to notice it: a coach's "Analyze all
 * pending" button stays as a fallback for a batch after club night, but it is
 * not how the work normally gets done.
 *
 * Deliberately unhurried:
 *   - one game at a time, because the engine is single-threaded
 *   - only while the tab is visible, so a backgrounded tab is not burning
 *     someone's battery on a Chromebook
 *   - a short settle delay after load, so the first paint is never competing
 *     with a WASM engine starting up
 *   - permission is the database's business: a player may analyse their own
 *     games and the RLS policy refuses anything else, so this needs no role
 *     check of its own
 */

import { useEffect, useRef, useState } from 'react';
import { useGames } from '../data/gamesStore.js';
import { usePendingQueue, dequeueGame, enqueueGame, getAnalyses } from '../data/analysisStore.js';
import { analyzeArchivedGame, isBusy } from './runner.js';

/** Wait this long after mount before starting, so the UI settles first. */
const SETTLE_MS = 4000;
/** Breathing room between games. */
const BETWEEN_MS = 1500;

export function useAnalysisQueue({ enabled = true } = {}) {
  const games = useGames();
  const queue = usePendingQueue();
  const [current, setCurrent] = useState(null);
  const [progress, setProgress] = useState(null);
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;
    return () => {
      stopped.current = true;
    };
  }, []);

  useEffect(() => {
    if (!enabled || !queue.length || current) return undefined;

    let timer = null;
    const run = async () => {
      if (stopped.current || isBusy()) return;
      if (typeof document !== 'undefined' && document.hidden) return;

      const gameId = queue[0];
      const game = games.find((g) => g.id === gameId);
      if (!game) {
        // The game is gone from the archive. Stop asking for it.
        dequeueGame(gameId);
        return;
      }
      // Already analysed by someone else (another device, or the coach).
      if (getAnalyses().some((a) => a.gameId === gameId)) {
        dequeueGame(gameId);
        return;
      }

      setCurrent(gameId);
      setProgress(null);
      await analyzeArchivedGame(game, { onProgress: setProgress });
      // analyzeArchivedGame dequeues on success; drop it either way so one
      // unanalysable game cannot wedge the queue forever.
      dequeueGame(gameId);
      setCurrent(null);
      setProgress(null);
    };

    timer = setTimeout(run, current === null && queue.length ? SETTLE_MS : BETWEEN_MS);
    return () => clearTimeout(timer);
  }, [enabled, queue, games, current]);

  return {
    pending: queue.length,
    current,
    progress,
    running: current !== null,
  };
}

/**
 * Backfill: queue every archived game that has never been analysed. This is
 * what makes auto-analysis apply to games imported before it existed, rather
 * than only to games played from now on.
 */
export function enqueueUnanalysed(games, { playerId = null } = {}) {
  const done = new Set(getAnalyses().map((a) => a.gameId));
  let queued = 0;
  for (const game of games) {
    if (done.has(game.id) || !game.pgn) continue;
    if (playerId && game.whitePlayerId !== playerId && game.blackPlayerId !== playerId) continue;
    enqueueGame(game.id);
    queued += 1;
  }
  return queued;
}
