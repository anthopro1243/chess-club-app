/*
 * useAnalysisQueue.js — drains the analysis queue while the app is open.
 *
 * Spec Decision 3: a game queues itself and a worker drains it, so nothing
 * waits for a human to notice it exists. The coach's "Analyse all pending"
 * button is an override for clearing a backlog, not the mechanism.
 *
 * Deliberately unhurried:
 *   - one game at a time, because the engine is single-threaded
 *   - only while the tab is visible, so a backgrounded tab is not burning
 *     someone's battery, and it wakes on visibilitychange rather than giving up
 *   - claims are taken in the database, so two open tabs cannot analyse the
 *     same game twice
 *   - permission is the database's business: a player may analyse their own
 *     games and RLS refuses anything else, so this needs no role check
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { claimNext, markDone, markFailed, queueCounts } from './queue.js';
import { analyzeArchivedGame, isBusy } from './runner.js';
import { DEFAULT_DEPTH } from './analyzeGame.js';

const SETTLE_MS = 3500;
const BETWEEN_MS = 1200;

export function useAnalysisQueue({ enabled = true, playerId = null } = {}) {
  const [current, setCurrent] = useState(null);
  const [progress, setProgress] = useState(null);
  const [counts, setCounts] = useState(null);
  const [tick, setTick] = useState(0);
  const stopped = useRef(false);
  const abort = useRef(null);

  useEffect(() => {
    stopped.current = false;
    return () => {
      stopped.current = true;
      // A user who closes the tab should not leave an engine spinning.
      abort.current?.abort();
    };
  }, []);

  /*
   * Skipping work while the tab is hidden is right; skipping it and never
   * looking again is a bug. The effect does not re-run on its own, so without
   * this a tab that happened to be backgrounded when the timer fired would
   * leave the queue stalled indefinitely.
   */
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const wake = () => {
      if (!document.hidden) setTick((n) => n + 1);
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    return () => {
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
    };
  }, []);

  const refreshCounts = useCallback(async () => {
    const next = await queueCounts();
    if (!stopped.current) setCounts(next);
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    let timer = null;

    const run = async () => {
      if (stopped.current || isBusy() || current) return;
      if (typeof document !== 'undefined' && document.hidden) return;

      const game = await claimNext({ playerId });
      if (!game) {
        await refreshCounts();
        return;
      }

      setCurrent(game.id);
      setProgress(null);
      const controller = new AbortController();
      abort.current = controller;

      const record = {
        id: game.id,
        pgn: game.pgn,
        whitePlayerId: game.white_player_id,
        blackPlayerId: game.black_player_id,
        playedAt: game.played_at,
        mode: game.mode,
      };

      const result = await analyzeArchivedGame(record, {
        onProgress: setProgress,
        signal: controller.signal,
      });

      if (result.ok) await markDone(game.id, DEFAULT_DEPTH);
      else await markFailed(game.id, result.error, (game.analysis_attempts ?? 0) + 1);

      abort.current = null;
      setCurrent(null);
      setProgress(null);
      await refreshCounts();
      // Look again immediately so a backlog drains in one sitting.
      setTick((n) => n + 1);
    };

    timer = setTimeout(run, tick === 0 ? SETTLE_MS : BETWEEN_MS);
    return () => clearTimeout(timer);
  }, [enabled, playerId, current, tick, refreshCounts]);

  useEffect(() => {
    if (enabled) refreshCounts();
  }, [enabled, refreshCounts]);

  return {
    counts,
    current,
    progress,
    running: current !== null,
    refresh: refreshCounts,
  };
}
