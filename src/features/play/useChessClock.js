import { useCallback, useEffect, useRef, useState } from 'react';
import { createClock, startClock, pressClock, hasFlagged } from './chessClock.js';

/**
 * The game clock for the Play page.
 *
 * Kept in a ref rather than state because it is read on every tick and
 * written on every move; a counter in state is what actually re-renders,
 * once every 100ms while it runs.
 *
 * A flag is not something the rules engine knows about, so running out of
 * time is tracked here (`flagged` is 'w' or 'b') and the page folds it into
 * the game status. `gameOver` stops the ticking once the game has ended
 * some other way.
 */
export function useChessClock({ timeControl, initialTurn, savedFlagged = null, gameOver }) {
  const clockRef = useRef(null);
  if (clockRef.current === null) clockRef.current = createClock(timeControl, initialTurn);
  const [, setClockTick] = useState(0);
  const [flagged, setFlagged] = useState(savedFlagged);

  /*
   * Tick while the clock runs, and stop the game the moment someone flags.
   * 100ms is fast enough for the tenths shown under ten seconds without
   * re-rendering the board pointlessly.
   */
  useEffect(() => {
    if (timeControl.baseMs === 0 || flagged || gameOver) return undefined;
    const timer = setInterval(() => {
      const clock = clockRef.current;
      if (clock.running && hasFlagged(clock)) {
        clockRef.current = { ...clock, running: false };
        setFlagged(clock.turn);
      }
      setClockTick((t) => t + 1);
    }, 100);
    return () => clearInterval(timer);
  }, [timeControl.baseMs, flagged, gameOver]);

  /** Hand the move over on the clock, starting it if this is the first move. */
  const pressAfterMove = useCallback(() => {
    if (timeControl.baseMs === 0) return;
    const started = clockRef.current.running
      ? clockRef.current
      : startClock(clockRef.current);
    clockRef.current = pressClock(started);
    setClockTick((t) => t + 1);
  }, [timeControl.baseMs]);

  /** Put the clock back to the start of a fresh game under the chosen control. */
  const resetClock = useCallback(
    (control, turn = 'w') => {
      clockRef.current = createClock(control, turn);
      setFlagged(null);
      setClockTick((t) => t + 1);
    },
    [],
  );

  return { clockRef, flagged, pressAfterMove, resetClock };
}
