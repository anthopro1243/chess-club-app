/*
 * coalesce.js — turn a burst of "something changed" events into one refetch.
 *
 * A realtime channel fires once per row change. The analysis queue updates a
 * games row several times per game, so refetching on every event re-downloaded
 * the whole archive (PGNs included) hundreds of times and timed the database
 * out. Wrap the refetch in this and the burst costs one request instead.
 *
 * Trailing debounce: the run starts `delayMs` after the LAST trigger. A run
 * never overlaps another; triggers that land while one is in flight queue
 * exactly one more run for when it finishes.
 */

export const REALTIME_REFETCH_MS = 1500;

export function coalesce(fn, delayMs = REALTIME_REFETCH_MS) {
  let timer = null;
  let running = false;
  let pending = false;

  async function run() {
    running = true;
    try {
      await fn();
    } catch {
      // The callers report their own failures; a throw must not wedge the queue.
    } finally {
      running = false;
      if (pending) {
        pending = false;
        run();
      }
    }
  }

  function fire() {
    timer = null;
    if (running) pending = true;
    else run();
  }

  function trigger() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fire, delayMs);
  }

  trigger.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pending = false;
  };

  return trigger;
}
