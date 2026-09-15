/*
 * nodeTransport.js — drives the same Stockfish 18 WASM build from Node.
 *
 * TEST/TOOLING ONLY. The browser never imports this; browser code gets the
 * default Web Worker transport inside stockfishClient.js.
 *
 * Why a shim at all: public/stockfish/stockfish-18-lite-single.js is a UMD
 * bundle that already supports Node, but this package sets "type": "module",
 * so Node parses a bare .js file as ESM and the bundle's `require` calls blow
 * up. Rather than keep a duplicate .cjs copy of a 21KB build artifact in the
 * repo (which would drift), we evaluate the real file through the CommonJS
 * module wrapper by hand. One copy of the engine, one source of truth.
 */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENGINE_JS = path.join(HERE, '../../public/stockfish/stockfish-18-lite-single.js');
const ENGINE_WASM = path.join(HERE, '../../public/stockfish/stockfish-18-lite-single.wasm');

/**
 * Boot the engine under Node and return a transport matching the shape
 * createEngine() expects: { send, onLine, terminate }.
 *
 * @returns {Promise<{send: (cmd: string) => void, onLine: (fn: (line: string) => void) => void, terminate: () => void}>}
 */
export async function createNodeTransport() {
  const source = fs.readFileSync(ENGINE_JS, 'utf8');
  const require = createRequire(ENGINE_JS);
  const shim = { exports: {} };

  // The CommonJS wrapper, applied manually. `require.main !== shim` here, which
  // matters: when the bundle believes it is the main module it starts an
  // interactive readline REPL on stdin instead of exporting a factory.
  const wrapper = vm.runInThisContext(
    `(function (exports, require, module, __filename, __dirname) {${source}\n})`,
    { filename: ENGINE_JS },
  );
  wrapper(shim.exports, require, shim, ENGINE_JS, path.dirname(ENGINE_JS));

  const sinks = new Set();
  const factory = shim.exports();
  const engine = await factory({
    locateFile: (file) => (file.endsWith('.wasm') ? ENGINE_WASM : ENGINE_JS),
    listener: (line) => {
      for (const fn of sinks) fn(String(line));
    },
  });

  const send = (cmd) => {
    if (typeof engine.processCommand === 'function') engine.processCommand(cmd);
    else engine.ccall('command', null, ['string'], [cmd], { async: /^go\b/.test(cmd) });
  };

  return {
    send,
    onLine: (fn) => sinks.add(fn),
    terminate: () => {
      try {
        send('quit');
      } catch {
        /* the bundle calls process.exit on quit in some builds; ignore */
      }
      sinks.clear();
    },
  };
}
