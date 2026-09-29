/*
 * flashTimer.js — a short confirmation that clears itself ("Copied",
 * "Marked reviewed"). Pure: the timer functions are passed in, so the tests
 * run without waiting. useFlash.js wraps it for React.
 *
 * Only one key shows at a time. Showing a new key restarts the clock, and an
 * old timer can never clear a newer key.
 */
export function createFlashTimer({ ms = 1500, onChange, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  if (!(ms > 0)) throw new Error('flash duration must be a positive number of milliseconds');
  if (typeof onChange !== 'function') throw new Error('onChange is required');
  let current = null;
  let timer = null;

  const stop = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  return {
    show(key) {
      stop();
      current = key;
      onChange(key);
      timer = setTimer(() => {
        timer = null;
        if (current === key) {
          current = null;
          onChange(null);
        }
      }, ms);
    },
    current: () => current,
    dispose: stop,
  };
}
