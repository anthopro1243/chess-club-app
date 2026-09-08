/*
 * stockfishClient.js — a thin promise-based wrapper around the real
 * Stockfish 18 engine (single-threaded WASM build, served from
 * public/stockfish/) so the rest of the app never has to speak raw UCI.
 *
 * No custom evaluation, no guessed strength — every move and every
 * strength setting comes from Stockfish itself. The Elo range is read from
 * the engine's own `option name UCI_Elo` line rather than hard-coded, so it
 * always matches whatever build is actually loaded.
 */

const ENGINE_URL = `${import.meta.env.BASE_URL}stockfish/stockfish-18-lite-single.js`;

function parseOption(line) {
  // "option name UCI_Elo type spin default 1320 min 1320 max 3190"
  const m = line.match(/^option name (.+?) type (\w+)(.*)$/);
  if (!m) return null;
  const [, name, type, rest] = m;
  const field = (key) => {
    const r = rest.match(new RegExp(`${key} (-?[\\w.]+)`));
    return r ? r[1] : undefined;
  };
  return {
    name,
    type,
    default: field('default'),
    min: field('min') !== undefined ? Number(field('min')) : undefined,
    max: field('max') !== undefined ? Number(field('max')) : undefined,
  };
}

/** Start a Stockfish worker and resolve once it has reported `uciok`/`readyok`. */
export function createEngine() {
  const worker = new Worker(ENGINE_URL);
  const listeners = new Set();
  const options = new Map();
  let identity = '';

  worker.onmessage = (event) => {
    const line = typeof event.data === 'string' ? event.data : '';
    if (line.startsWith('option name')) {
      const opt = parseOption(line);
      if (opt) options.set(opt.name, opt);
    } else if (line.startsWith('id name')) {
      identity = line.slice('id name '.length);
    }
    listeners.forEach((fn) => fn(line));
  };

  const send = (cmd) => worker.postMessage(cmd);

  const waitFor = (predicate) =>
    new Promise((resolve) => {
      const handler = (line) => {
        if (predicate(line)) {
          listeners.delete(handler);
          resolve(line);
        }
      };
      listeners.add(handler);
    });

  const ready = (async () => {
    send('uci');
    await waitFor((line) => line === 'uciok');
    send('isready');
    await waitFor((line) => line === 'readyok');
  })();

  // bestMove() calls are serialized through this queue: the UCI protocol has
  // no per-request id, so a "bestmove" line can't be matched to a specific
  // call unless only one search is ever in flight at a time. abortCurrent()
  // sends `stop` outside the queue so a queued caller (e.g. "New Game"
  // clicked mid-think) doesn't have to wait out the full movetime.
  let queue = Promise.resolve();

  async function runSearch(fen, { elo, movetimeMs }) {
    await ready;
    send('stop'); // harmless if nothing is searching; ends a stuck prior search
    if (elo != null) {
      send('setoption name UCI_LimitStrength value true');
      send(`setoption name UCI_Elo value ${Math.round(elo)}`);
    } else {
      send('setoption name UCI_LimitStrength value false');
    }
    send('ucinewgame');
    send('isready');
    await waitFor((line) => line === 'readyok');
    send(`position fen ${fen}`);
    send(`go movetime ${movetimeMs}`);
    const line = await waitFor((l) => l.startsWith('bestmove'));
    const uciMove = line.split(' ')[1];
    if (!uciMove || uciMove === '(none)') return null;
    return {
      from: uciMove.slice(0, 2),
      to: uciMove.slice(2, 4),
      promotion: uciMove.length > 4 ? uciMove[4] : undefined,
    };
  }

  return {
    ready,
    async engineName() {
      await ready;
      return identity;
    },
    /** The Elo range this exact engine build reports for UCI_LimitStrength. */
    async eloRange() {
      await ready;
      const opt = options.get('UCI_Elo');
      return opt
        ? { min: opt.min, max: opt.max, default: Number(opt.default) }
        : { min: 1320, max: 3190, default: 1500 };
    },
    /**
     * Best move for `fen`. `elo: null` means full strength (no limiter).
     * Returns { from, to, promotion } in algebraic notation, or null if the
     * position has no legal move. Calls queue rather than overlap.
     */
    bestMove(fen, options = {}) {
      const task = queue.then(() => runSearch(fen, options));
      queue = task.catch(() => {});
      return task;
    },
    /** Cuts short whatever search is currently running, without queuing. */
    abortCurrent() {
      send('stop');
    },
    terminate() {
      worker.terminate();
    },
  };
}
