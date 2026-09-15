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

/*
 * Resolved lazily rather than at module scope. `import.meta.env` only exists
 * under Vite; reading it eagerly makes this module unimportable from plain
 * Node, which is where the evaluate() sign-convention tests run.
 */
function engineUrl() {
  const base =
    (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
  return `${base}stockfish/stockfish-18-lite-single.js`;
}

/** Default transport: a real Web Worker. Replaced by the Node shim in tests. */
function browserTransport() {
  const worker = new Worker(engineUrl());
  return {
    send: (cmd) => worker.postMessage(cmd),
    onLine: (fn) => {
      worker.onmessage = (event) => {
        fn(typeof event.data === 'string' ? event.data : '');
      };
    },
    terminate: () => worker.terminate(),
  };
}

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

/**
 * Parse a UCI `info` line into a score record, or null if it carries no usable
 * evaluation. Lines flagged `upperbound`/`lowerbound` are fail-high/fail-low
 * reports from an aspiration window, not evaluations, and must be ignored —
 * treating one as a score is a classic source of wildly wrong analysis.
 */
export function parseInfo(line) {
  if (!line.startsWith('info ')) return null;
  if (/\b(upperbound|lowerbound)\b/.test(line)) return null;
  const cp = /\bscore cp (-?\d+)/.exec(line);
  const mate = /\bscore mate (-?\d+)/.exec(line);
  if (!cp && !mate) return null;
  const depth = /\bdepth (\d+)/.exec(line);
  const multipv = /\bmultipv (\d+)/.exec(line);
  const nodes = /\bnodes (\d+)/.exec(line);
  const pv = /\bpv (.+)$/.exec(line);
  return {
    depth: depth ? Number(depth[1]) : 0,
    multipv: multipv ? Number(multipv[1]) : 1,
    nodes: nodes ? Number(nodes[1]) : 0,
    cp: cp ? Number(cp[1]) : null,
    mate: mate ? Number(mate[1]) : null,
    pv: pv ? pv[1].trim().split(/\s+/) : [],
  };
}

/** Start a Stockfish worker and resolve once it has reported `uciok`/`readyok`. */
export function createEngine({ transport } = {}) {
  const channel = transport || browserTransport();
  const listeners = new Set();
  const options = new Map();
  let identity = '';

  channel.onLine((line) => {
    if (line.startsWith('option name')) {
      const opt = parseOption(line);
      if (opt) options.set(opt.name, opt);
    } else if (line.startsWith('id name')) {
      identity = line.slice('id name '.length);
    }
    listeners.forEach((fn) => fn(line));
  });

  const send = (cmd) => channel.send(cmd);

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
    const gotUciok = waitFor((line) => line === 'uciok');
    send('uci');
    await gotUciok;
    const gotReadyok = waitFor((line) => line === 'readyok');
    send('isready');
    await gotReadyok;
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
    const searchReady = waitFor((line) => line === 'readyok');
    send('isready');
    await searchReady;
    send(`position fen ${fen}`);
    const settled = waitFor((l) => l.startsWith('bestmove'));
    send(`go movetime ${movetimeMs}`);
    const line = await settled;
    const uciMove = line.split(' ')[1];
    if (!uciMove || uciMove === '(none)') return null;
    return {
      from: uciMove.slice(0, 2),
      to: uciMove.slice(2, 4),
      promotion: uciMove.length > 4 ? uciMove[4] : undefined,
    };
  }

  /*
   * One search per position, queued alongside bestMove(): a single-threaded
   * WASM engine has one brain, and UCI has no per-request id, so two searches
   * in flight cannot be told apart.
   */
  async function runEvaluate(fen, { depth = 14, multiPV = 1, maxNodes = 400000, signal } = {}) {
    await ready;
    if (signal?.aborted) throw new Error('evaluate aborted');

    send('stop'); // harmless if idle; clears a stuck prior search
    send('setoption name UCI_LimitStrength value false');
    send(`setoption name MultiPV value ${multiPV}`);
    send('ucinewgame');
    const evalReady = waitFor((line) => line === 'readyok');
    send('isready');
    await evalReady;
    send(`position fen ${fen}`);

    // Keep the LAST info line seen per multipv index. Earlier ones are
    // shallower iterative-deepening passes and would understate the score.
    const latest = new Map();
    const collect = (line) => {
      const info = parseInfo(line);
      if (info) latest.set(info.multipv, info);
    };
    listeners.add(collect);
    const onAbort = () => send('stop');
    signal?.addEventListener('abort', onAbort);

    try {
      const done = waitFor((line) => line.startsWith('bestmove'));
      send(`go depth ${depth} nodes ${maxNodes}`);
      await done;
    } finally {
      listeners.delete(collect);
      signal?.removeEventListener('abort', onAbort);
      // Leave MultiPV at 1 or the Play page's opponent gets slower and weaker.
      send('setoption name MultiPV value 1');
    }

    if (signal?.aborted) throw new Error('evaluate aborted');

    const infos = [...latest.values()].sort((a, b) => a.multipv - b.multipv);
    return {
      depth: infos.length ? Math.max(...infos.map((i) => i.depth)) : 0,
      nodes: infos.length ? Math.max(...infos.map((i) => i.nodes)) : 0,
      lines: infos.slice(0, multiPV).map((i) => ({
        multipv: i.multipv,
        cp: i.cp,
        mate: i.mate,
        pv: i.pv,
      })),
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
    /**
     * Full evaluation of `fen`: score plus principal variation, and the top
     * `multiPV` alternatives. This is what analysis needs and bestMove() throws
     * away — bestMove waits for the `bestmove` line and discards every `info`
     * line, which is where the scores live.
     *
     * Scores are reported from the point of view of the SIDE TO MOVE in `fen`.
     * For the position after a move that is the opponent, so callers must pass
     * the result through normaliseAfter() from src/analysis/scoring.js.
     *
     * @param {string} fen
     * @param {{depth?: number, multiPV?: number, maxNodes?: number, signal?: AbortSignal}} opts
     * @returns {Promise<{depth: number, nodes: number, lines: Array<{multipv: number, cp: number|null, mate: number|null, pv: string[]}>}>}
     */
    evaluate(fen, opts = {}) {
      const task = queue.then(() => runEvaluate(fen, opts));
      queue = task.catch(() => {});
      return task;
    },
    /** Cuts short whatever search is currently running, without queuing. */
    abortCurrent() {
      send('stop');
    },
    terminate() {
      channel.terminate();
    },
  };
}
