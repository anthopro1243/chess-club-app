# Architecture

A map of the app as it stands, written so someone who has never opened the
repo can find the thing they need to change.

## Shape of the thing

React + Vite single-page app. No router package, no state library, no UI
framework. Runtime dependencies are `react`, `react-dom`, `@supabase/supabase-js`
and `xlsx` (lazy-loaded, export only). That short list is deliberate.

The app runs in two modes and the pages cannot tell them apart:

- **Local mode** — no Supabase environment variables set. Everything lives in
  `localStorage`. Sign-in UI hides itself entirely.
- **Cloud mode** — `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set. Same
  local stores, but mirrored to Postgres and kept live through Realtime.

`src/data/supabaseClient.js` exports `isSupabaseConfigured`, and every store
branches on it. This is the single most important pattern in the codebase.

## Routing

`src/App.jsx` owns routing off `window.location.hash`. Six routes, listed in
the `ROUTES` array: `home`, `play`, `training`, `games`, `roster`, `coach`.
`routeFromHash()` falls back to `home` for anything unrecognised.

App.jsx also handles two Supabase auth redirects that arrive in the hash:
an error (`error=`) becomes a dismissible banner, and a recovery token
(`type=recovery`) opens `ResetPasswordModal`. Both are mount-only effects, so
they only fire on a genuine page load, not on hash navigation.

## Pages

| File | Does |
|---|---|
| `pages/DashboardPage.jsx` | Club-wide view: leaderboard, rubric averages, the three weakest categories |
| `pages/PlayPage.jsx` | The board. Human vs human, or vs Stockfish at a set Elo. Archives finished games and applies ratings |
| `pages/TrainingPage.jsx` | Puzzle trainer over 402 Lichess puzzles, filtered by theme and difficulty |
| `pages/GamesPage.jsx` | The game archive, filterable by player and source |
| `pages/RosterPage.jsx` | One row per player plus a detail/edit panel |
| `pages/CoachPage.jsx` | Attendance, player progress, dated assessments, spreadsheet export |

## Components

`Board.jsx` (interactive board), `Piece.jsx` (original SVG piece set),
`MoveList.jsx`, `PromotionDialog.jsx`, `InfoTooltip.jsx` (the circled "i"),
`AccountControl.jsx` (sign-in / account menu in the top bar),
`ResetPasswordModal.jsx`, `ConnectionsModal.jsx` (link Chess.com / Lichess).

## Data layer

### The store pattern

`src/data/store.js` is the whole state library: `createStore(key, initial)`
returns `{ get, set, subscribe }` backed by `localStorage`, and `useStore(store)`
wraps it in `useSyncExternalStore`. If storage is unavailable it degrades to
in-memory for the visit rather than throwing.

Every domain store is built on it and follows the same five-part shape:

1. `createStore(...)` for the local value
2. `fromRow` / `toRow` to translate between camelCase JS and snake_case SQL
3. `syncFromCloud()` on sign-in, plus a Realtime subscription
4. `pushToCloud(record)` after every local write
5. Exported `useX()` hooks and mutation functions the pages call

`rosterStore.js` (players) and `gamesStore.js` (games) both do this. **Any new
table should follow the same five parts.**

### Files

| File | Does |
|---|---|
| `data/store.js` | The localStorage store primitive |
| `data/roster.js` | Rubric category definitions and the club-average helpers |
| `data/rosterStore.js` | Players: CRUD, ratings, puzzle stats, assessments, attendance, linked accounts |
| `data/gamesStore.js` | The game archive |
| `data/glicko2.js` | Glicko-2, implemented from Glickman's paper |
| `data/supabaseClient.js` | The client, and `isSupabaseConfigured` |
| `data/auth.js` | Sign up / in / out, password reset, magic link |
| `data/puzzles.js` + `puzzles.json` | 402 Lichess puzzles, 59 themes |
| `data/externalChess.js` | Chess.com and Lichess API adapters |
| `data/externalSync.js` | Turns online games into rated club results |
| `data/exportWorkbook.js` | Multi-tab .xlsx export (lazy-loads `xlsx`) |

### Where ratings happen

All rating maths lives in `rosterStore.js`. Pages never compute a rating; they
decide *what an opponent was worth* and hand that over:

- `PlayPage` sets `COMPUTER_OPPONENT_RD = 40`
- `TrainingPage` sets `PUZZLE_OPPONENT_RD = 60`
- `externalSync.js` converts online opponents onto the club scale

Entry points: `recordRatingResult` (one side), `recordGameResult` (both sides
from each other's pre-game rating), `recordExternalResults` (a batch, with
double-count protection).

## Engine

`src/engine/chess.js` is a dependency-free rules engine: legal move
generation, castling, en passant, promotion, check/mate/stalemate, fifty-move,
threefold repetition, insufficient material, FEN/SAN/PGN. **Do not refactor it
and do not replace it with a library.** It is verified by a perft suite.

`src/engine/stockfishClient.js` wraps the Stockfish 18 WASM build in
`public/stockfish/` with a promise-based UCI client. Calls are serialised
through an internal queue because UCI has no per-request ids, so overlapping
searches would otherwise resolve the wrong promise.

## Tests

`npm test` runs three plain Node scripts, no test framework:

- `src/engine/chess.test.mjs` — 93 assertions including perft counts
- `src/data/glicko2.test.mjs` — checked against the worked example in the paper
- `src/data/externalChess.test.mjs` — 45 assertions on the API adapters

Anything pure should get a `.test.mjs` next to it in the same style.

## Build and deploy

`npm run dev` (Vite, port 5173), `npm run build`, deploy with
`npx vercel --prod`. `.claude/launch.json` holds the dev server config.

Live at https://chess-club-app-seven.vercel.app

## Gotchas worth knowing

- **Node is not on PATH in some shells here.** Prefix with
  `$env:PATH = "C:\Program Files\nodejs;$env:PATH"`.
- **`recordGame` spreads `...game` last**, so passing `id` or `playedAt`
  overrides the generated ones. Imported games rely on this.
- **Games are deduplicated by id**, players deduplicate rated games by
  `importedGameIds`. Two club members who played each other online produce one
  archive row but two rating updates, which is correct.
- **The em dash `—` is used as an empty-value placeholder** in tables. That is
  a display convention, not prose, and should be left alone.
