# Stockfish (vendored)

`stockfish-18-lite-single.js` + `.wasm` — the single-threaded, lite-NNUE WASM
build of Stockfish 18, from the [`stockfish`](https://www.npmjs.com/package/stockfish)
npm package (`nmrugg/stockfish.js`) v18.0.8.

Vendored here (not an npm dependency) because the full package is ~250MB
unpacked — everything from every build variant. We only ever need these two
files, served as static assets so the engine can run in a Web Worker with no
build step.

**Why this variant:** single-threaded means no `SharedArrayBuffer` / no
cross-origin-isolation headers required, so it runs unmodified on any static
host, including GitHub Pages. "Lite" trims the NNUE network for a much
smaller download (~7MB vs. ~113MB) — still far stronger than any club player.

**To update to a newer Stockfish release:**

```bash
npm install stockfish@latest
cp node_modules/stockfish/bin/stockfish-<version>-lite-single.js public/stockfish/
cp node_modules/stockfish/bin/stockfish-<version>-lite-single.wasm public/stockfish/
npm uninstall stockfish
```

Then update the filename in `src/engine/stockfishClient.js` (`ENGINE_URL`) to
match.

License: GPLv3 (`Copying.txt` in the npm package). Stockfish is free
software; this app talks to it over UCI as a separate process/worker rather
than linking against it, consistent with how it's used across the web
(lichess.org, chess.com, etc.).
