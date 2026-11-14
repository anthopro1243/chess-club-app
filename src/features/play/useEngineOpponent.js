import { useCallback, useEffect, useRef, useState } from 'react';
import { createEngine } from '../../engine/stockfishClient.js';

export const DEFAULT_ELO_RANGE = { min: 1320, max: 3190, default: 1500 };

/*
 * useEngineOpponent — Stockfish as an opponent on the Play page.
 *
 * The engine is a 7 MB download, so it is created only while `enabled`
 * (computer mode) has been on at least once, and it lives until the page
 * unmounts. `request` asks for a move; a newer request or `cancel` (new
 * game, undo) orphans the reply in flight, which then resolves to null so
 * a stale move can never land on a different position.
 */
export function useEngineOpponent({ enabled, onRange }) {
  const engineRef = useRef(null);
  const requestIdRef = useRef(0);
  const [eloRange, setEloRange] = useState(DEFAULT_ELO_RANGE);
  const [thinking, setThinking] = useState(false);
  const onRangeRef = useRef(onRange);
  onRangeRef.current = onRange;

  useEffect(() => {
    if (!enabled || engineRef.current) return;
    const engine = createEngine();
    engineRef.current = engine;
    engine.eloRange().then((range) => {
      setEloRange(range);
      onRangeRef.current?.(range);
    });
  }, [enabled]);

  useEffect(
    () => () => {
      engineRef.current?.terminate();
      engineRef.current = null;
    },
    [],
  );

  /** The engine's move for `fen`, or null if it was overtaken or failed. */
  const request = useCallback(async (fen, options) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setThinking(true);
    const move = await engineRef.current?.bestMove(fen, options);
    if (requestId !== requestIdRef.current) return null;
    setThinking(false);
    return move || null;
  }, []);

  /** Drop any reply in flight. `abort` also stops the engine's search. */
  const cancel = useCallback(({ abort = false } = {}) => {
    requestIdRef.current += 1;
    if (abort) engineRef.current?.abortCurrent();
    setThinking(false);
  }, []);

  return { eloRange, thinking, request, cancel };
}
