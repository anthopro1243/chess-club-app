/*
 * nodeTransport.js — drives the same Stockfish 19 WASM build from Node.
 *
 * TEST/TOOLING ONLY. The browser never imports this; browser code gets the
 * default Web Worker transport inside stockfishClient.js.
 *
 * The bundle supports Node on its own. This project sets "type": "module", so
 * public/stockfish/ carries a small package.json marking its files CommonJS:
 * the engine's helper threads reload the same file, and each would otherwise
 * fail to parse it and leave the engine waiting forever.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENGINE_JS = path.join(HERE, '../../public/stockfish/stockfish-19.js');

/**
 * Boot the engine under Node and return a transport matching the shape
 * createEngine() expects: { send, onLine, terminate }.
 *
 * @returns {Promise<{send: (cmd: string) => void, onLine: (fn: (line: string) => void) => void, terminate: () => void}>}
 */
export async function createNodeTransport() {
  const require = createRequire(import.meta.url);
  // The bundle keeps its settings at module level, so each engine needs a fresh load.
  delete require.cache[ENGINE_JS];

  const sinks = new Set();
  const engine = require(ENGINE_JS)();
  engine.listener = (line) => {
    for (const fn of sinks) fn(String(line));
  };

  return {
    send: (cmd) => engine.processCommand(cmd),
    onLine: (fn) => sinks.add(fn),
    // Not `quit`: it calls process.exit, which ends a test run before it reports.
    // The engine's threads keep Node alive, so test:engine runs with --test-force-exit.
    terminate: () => sinks.clear(),
  };
}
