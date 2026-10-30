# Stockfish (vendored)

`stockfish-19.js` + `stockfish-19.wasm`: the full, multi-threaded WASM build of
Stockfish 19, from the [`stockfish`](https://www.npmjs.com/package/stockfish)
npm package (`nmrugg/stockfish.js`) v19.0.1.

Vendored here (not an npm dependency) because the full package is ~205MB
unpacked, with every build variant. We only need these two files, served as
static assets so the engine can run in a Web Worker with no build step.

**Why this variant:** it's the strongest build, on the owner's instruction: the
full neural network plus multiple threads. It costs a ~99MB download the first
time a device needs the engine, and it needs a cross-origin isolated page
(`SharedArrayBuffer`). `vercel.json` and `vite.config.js` send those headers;
without them the engine won't start.

`package.json` here marks these files as CommonJS so the engine runs under Node
in the tests (see `src/engine/nodeTransport.js`).

**To update to a newer Stockfish release:**

```bash
npm pack stockfish@latest
tar -xzf stockfish-*.tgz package/bin/stockfish-<version>.js package/bin/stockfish-<version>.wasm
cp package/bin/stockfish-<version>.* public/stockfish/
```

Then update the filename in `src/engine/stockfishClient.js` (`engineUrl`) and
`src/engine/nodeTransport.js`, and `ENGINE_NAME` in `src/analysis/analyzeGame.js`.
Use a new filename for each version: `/stockfish/*` is cached for a year.

License: GPLv3 (`Copying.txt` in the npm package). Stockfish is free
software; this app talks to it over UCI as a separate process/worker rather
than linking against it, consistent with how it's used across the web
(lichess.org, chess.com, etc.).
