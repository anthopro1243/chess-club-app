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
import { analyzeArchivedGame, isBusy, resetAfterTimeout } from './runner.js';
import { DEFAULT_DEPTH } from './analyzeGame.js';
import { useStore } from '../data/store.js';
import { withTimeout, TimeoutError } from '../data/autoPolicy.js';

const SETTLE_MS = 3500;
const BETWEEN_MS = 1200;
/*
 * With nothing claimable, look again after this long. Without it a game
 * waiting out a retry backoff would only be retried when the tab next
 * regained focus.
 */
const IDLE_MS = 2 * 60 * 1000;
/* After an unexpected error (network, a thrown query), wait this long. */
const ERROR_MS = 30 * 1000;
/*
 * One game normally takes 30–60s of engine time. Five minutes is far past
 * that; past it the engine is assumed wedged, the game is marked failed (and
 * retried later with backoff) and a fresh engine is started.
 */
export const GAME_TIMEOUT_MS = 5 * 60 * 1000;

/*
 * What the background drainer is doing, for anyone who wants to show it —
 * the small indicator in the corner, the Coach page's queue panel. Only the
 * drainer mounted in App writes here; the Coach page's own hook instance is
 * disabled and would otherwise always read "idle". Not persisted.
 */
const activity = (() => {
  let value = { current: null, progress: null, counts: null };
  const listeners = new Set();
  return {
    get: () => value,
    set: (next) => {
      value = next;
      listeners.forEach((fn) => fn());
    },
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
})();
export const useAnalysisActivity = () => useStore(activity);

export function useAnalysisQueue({ enabled = true, playerId = null, preferPlayerId = null, publish = false } = {}) {
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
    if (publish) activity.set({ current, progress, counts });
  }, [publish, current, progress, counts]);

  useEffect(() => {
    if (!enabled) return undefined;
    let timer = null;

    const later = (ms) => {
      timer = setTimeout(() => {
        if (!stopped.current) setTick((n) => n + 1);
      }, ms);
    };

    const run = async () => {
      if (stopped.current || isBusy() || current) return;
      if (typeof document !== 'undefined' && document.hidden) return;

      let game = null;
      try {
        game = await withTimeout(claimNext({ playerId, preferPlayerId }), 30 * 1000, {
          label: 'Checking the analysis queue',
        });
      } catch (error) {
        console.warn('analysis queue:', error.message);
        later(ERROR_MS);
        return;
      }
      if (!game) {
        await refreshCounts();
        later(IDLE_MS);
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

      let result;
      try {
        result = await withTimeout(
          analyzeArchivedGame(record, { onProgress: setProgress, signal: controller.signal }),
          GAME_TIMEOUT_MS,
          { label: 'Analysing this game', onTimeout: () => controller.abort() },
        );
      } catch (error) {
        if (error instanceof TimeoutError) resetAfterTimeout();
        result = { ok: false, error: error.message };
      }

      try {
        if (result.ok) await markDone(game.id, DEFAULT_DEPTH);
        else await markFailed(game.id, result.error, (game.analysis_attempts ?? 0) + 1);
      } catch (error) {
        console.warn('analysis queue:', error.message);
      }

      abort.current = null;
      setCurrent(null);
      setProgress(null);
      await refreshCounts();
      // Look again immediately so a backlog drains in one sitting.
      setTick((n) => n + 1);
    };

    timer = setTimeout(run, tick === 0 ? SETTLE_MS : BETWEEN_MS);
    return () => clearTimeout(timer);
  }, [enabled, playerId, preferPlayerId, current, tick, refreshCounts]);

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
