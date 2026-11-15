# Architecture

A map of the app as it stands, written so someone who has never opened the
repo can find the thing they need to change.

## Shape of the thing

React 18 + Vite single-page app. No router package, no state library, no UI
framework. Runtime dependencies are `react`, `react-dom`,
`@supabase/supabase-js`, `xlsx` (lazy-loaded, export only) and the two
self-hosted fonts from `@fontsource`. That short list is deliberate.

The app runs in two modes and the pages cannot tell them apart:

- **Local mode**: no Supabase environment variables set. Everything lives in
  `localStorage`. Sign-in UI hides itself entirely.
- **Cloud mode**: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set. Same
  local stores, but mirrored to Postgres and kept live through Realtime.

`src/services/backend.js` exports `isCloud`. UI code imports that, never the
Supabase client itself; stores branch on it. This is the single most
important pattern in the codebase.

## Folders, and which way imports point

```
src/
  main.jsx        entry: imports services/auth.js first, then renders App
  app/            the shell: App.jsx, routes, useRoute, lazy pages, error boundary
  features/       one folder per area of the app (below)
  board/          the chessboard and its pieces, move list, keyboard/SR support
  ui/             shared widgets: Modal, Link, Toast, InfoTooltip, flash timer,
                  PageHeader, Icon, Avatar, EmptyState, JumpNav, Skeleton
  services/       Supabase client, auth, the localStorage store, error log,
                  external/ (Chess.com and Lichess adapters)
  analysis/       pure game analysis: scoring, motifs, SEE, skill model, PGN
  engine/         the rules engine and the Stockfish client
  styles/         app.css, which @imports parts/01-…42-… in order
```

Dependencies point down only: `app` → `features` → `board` / `ui` →
`services` / `analysis` → `engine`. A feature may import from another
feature's store (Training reads the roster), but nothing under `analysis/`,
`engine/` or `services/` imports React components.

### Features

| Folder | What lives there |
|---|---|
| `club/` | `ClubPage` (leaderboard, club averages, weakest areas) and `PlayerHome` (a member's own home) |
| `training/` | `TrainingPage` (the weekly plan, "Your mistakes", endgames, theme links), `StudyPlan`, `MistakesReview`, endgame drills, the review queue store |
| `games/` | The archive (`GamesPage`, `MyGamesPage`), logging a board game, PGN and scoresheet import, position editor |
| `analysis/` | The analysis queue and runner, game review, report card, club weaknesses |
| `roster/` | `RosterPage` (+ `RosterList`, `PlayerEditForm`, `PlayerDetails`), the roster store, imports, graduation archive |
| `coach/` | `CoachPage`, assessments, coach notes, member approval, client error list, spreadsheet export |
| `account/` | Sign in/up, password reset, invite codes, linking an account to a student, Chess.com/Lichess connections |
| `ratings/` | Glicko-2 and the rating log |
| `sync/` | Pulling online games and turning them into rated club results |

## Routing

`src/app/routes.js` holds `ROUTES` (`home`, `training`, `games`,
`my-games`, `roster`, `coach`), page titles, who can open what, and
`href(to, params)` for building links like `#/training?theme=fork`.
`useRoute()` in `src/app/useRoute.js` reads the hash through
`useSyncExternalStore`; `goTo()` changes it. Use `<Link>` from `ui/` for
navigation, so links are real anchors that open in a new tab.

`App.jsx` renders the page from a map, moves focus to the page heading
on every route change, sets `document.title`, and wraps each page in an error
boundary that tells a failed download (new deploy) apart from a crash.
It also handles two Supabase auth redirects in the hash: an error becomes a
banner, a recovery token opens `ResetPasswordModal`.

A hash path that names no page (`#/nonsense`) parses to `NOT_FOUND`, and
`App.jsx` shows a not-found `EmptyState` with a link home and a matching
document title. An empty hash, or one that is not a path at all (Supabase's
`#access_token=…` links), is still the home page.

Two routes carry a record in the query string, so Back works and the view can
be linked: `#/games?game=<id>` is one game (the list is replaced by the board
review, with a Games › White vs Black breadcrumb) and `#/roster?player=<id>`
opens the roster with that player selected. Link to a player with
`<Link to="roster" params={{ player: id }}>`.

## Shell and page chrome

`App.jsx` draws the shell. Above 940px that is a sidebar: the brand, a search
button, the menu in groups (`navGroups()` in `routes.js`: Club, Improve,
Game records, Coaching), then the theme switch and the account. At
940px and below it is a top bar and a bottom tab bar (`tabRoutes()` in
`routes.js`: Club, Training, My games, Games and a "More" sheet, which is a `Modal`). Each route in
`ROUTES` has an `icon`, a `group` and a one-line `summary`.

Every page gets a visible header from `ui/PageHeader.jsx`: the `<h1>` (which
takes focus on navigation), the route's summary, and the page's actions on the
right. A page does not render the header. It fills it:

- `<PageActions>…</PageActions>` puts buttons in the header (a portal).
- `usePageMeta({ title, summary, crumbs })` replaces the title or adds a
  breadcrumb, as the game view does.

Quick search (`app/CommandPalette.jsx`, Ctrl/Cmd K or the search button) is a
`Modal` with a combobox over pages, players and games. The matching is pure
and tested in `app/paletteSearch.js`.

Shared pieces to reach for before writing new markup:

| Piece | Use |
|---|---|
| `.btn`, `.btn-primary`, `.btn-danger`, `.btn-sm` | Every action. One primary per page. `.link-button` is for inline text actions only ("Forgot password?", a name that opens a player). `.btn-block` makes a button full width in a narrow card |
| `ui/Icon.jsx` | Inline SVG icons by name, `aria-hidden`; the label is always text |
| `ui/Avatar.jsx` | Initials on a colour picked from the name |
| `ui/EmptyState.jsx` | An icon, a title, a sentence and the action that fills the list |
| `ui/JumpNav.jsx` | A row of jump links built from a page's panel headings (Coach) |
| `ui/Skeleton.jsx` | The placeholder shown while a page's code downloads |
| `.hide-narrow` | Drops a table column at 640px so the table fits a phone |

Styles for these are in `styles/parts/38-app-shell.css` to `42-motion.css`.
Motion (page and dialog fades) is all in `42-motion.css` and is off under
`prefers-reduced-motion`.

## Data layer

### The store pattern

`src/services/store.js` is the whole state library: `createStore(key,
initial)` returns `{ get, set, subscribe }` backed by `localStorage`, and
`useStore(store)` wraps it in `useSyncExternalStore`. Every store registers
itself, so `clearUserData()` can wipe them all on sign-out or when a
different account signs in (theme and last-user keys survive).

Every domain store follows the same shape:

1. `createStore(...)` for the local value
2. `fromRow` / `toRow` to translate between camelCase JS and snake_case SQL
3. `syncFromCloud()` on sign-in, plus a Realtime subscription. A table that
   changes in bursts (games, puzzle attempts, notes) wraps its refetch in
   `coalesce()` (`services/coalesce.js`): one fetch per burst, 1.5 s after
   the last event, never two at once. The roster applies the changed row
   instead of refetching
4. A push after every local write that sends only the changed columns
5. Exported `useX()` hooks and mutation functions the pages call

`rosterStore.js` (with the pure row helpers in `playerRows.js`) and
`gamesStore.js` are the reference examples. **Any new table should follow the
same five parts.**

### Sync errors

A failed cloud write or read calls `reportSyncError(what, message)` (or
`reportLoadError` for a read) in `services/syncStatus.js`, which puts a banner
on screen. The next success for the same `what` calls `reportSyncOk(what)`,
which clears the banner. It clears only that thing's own error, so a store must
use the same `what` string on its failure and its success. A new store that
reports errors needs both calls.

### Where ratings happen

One rating, Glicko-2:

- **Club rating** (`player.rating`): games only. `recordGameResult` updates
  both players at once through the `record_club_game_ratings` RPC
  (migration 0026); `recordRatingResult` handles one side (a game against
  Stockfish, with `COMPUTER_OPPONENT_RD = 40`); `recordExternalResults`
  takes a batch of online games, with double-count protection.

The old puzzle rating (`player.puzzleStats.rating`) is no longer updated: it
only ever moved on the retired puzzle library. The column and the stored
values stay as they were. `puzzleStats.solvedIds` now gains `own:<id>`
entries as a player solves their own mistakes, and the Coach and Club tables
show that count as "Mistakes solved" (`mistakesSolvedCount`).

Pages never compute a rating; they decide what an opponent was worth and hand
that over.

### Database

`supabase/schema.sql` is the starting schema; `supabase/migrations/` holds
numbered migrations applied in order in the SQL editor. Access control is Row
Level Security throughout. The anon key is public by design.

## Engine

`src/engine/chess.js` is a dependency-free rules engine: legal move
generation, castling, en passant, promotion, check/mate/stalemate, fifty-move,
threefold repetition, insufficient material, FEN/SAN/PGN. **Do not refactor
it and do not replace it with a library.** It is verified by a perft suite.

`src/engine/stockfishClient.js` wraps the Stockfish 18 WASM build in
`public/stockfish/` with a promise-based UCI client, loaded only when first
needed. Calls are serialised through a queue because UCI has no per-request
ids.

## Accessibility conventions

- Dialogs use `ui/Modal.jsx` (a native `<dialog>` opened with `showModal()`):
  focus moves in, Escape closes, focus returns to the opener.
- The board is a grid with a roving tab stop: arrow keys move, Enter/Space
  picks up and drops, and new moves are announced through `LiveRegion`.
  `SanInput` lets anyone type a move such as `Nf3`.
- Clickable table rows hold a real `<button className="row-button">`.
- `npm run lint` includes `jsx-a11y`; keep it clean.

## Tests

- `npm test`: every `src/**/*.test.js` under `node --test`, then the SQL
  scenario tests (`scripts/sql-tests.mjs`, which runs `supabase/tests/` on an
  in-process PGlite Postgres), then the RLS check (`supabase/rls-test.mjs`,
  which skips unless its test accounts are configured).
- `npm run test:engine`: the two suites that drive real Stockfish
  (`*.engine-test.js`). Slow; run before touching analysis or the engine.
- `npm run lint`: ESLint with react, react-hooks and jsx-a11y.

Anything pure should get a `.test.js` next to it. CI
(`.github/workflows/ci.yml`) runs lint, tests and build on every push and
pull request.

## Build and deploy

`npm run dev` (Vite, port 5173), `npm run build`, deployed on Vercel.
`vercel.json` sets the Content Security Policy and other security headers,
and long cache lifetimes for hashed assets. If you add a new outside service
the app talks to, add its origin to `connect-src` there.

Live at https://chess-club-app-seven.vercel.app

## Gotchas worth knowing

- **Preview deploys share the production database.** Anything you click on a
  preview URL while signed in changes real club data.
- **`recordGame` spreads `...game` last**, so passing `id` or `playedAt`
  overrides the generated ones. Imported games rely on this.
- **Games are deduplicated by id**; players deduplicate rated games by
  `importedGameIds`. Two club members who played each other online produce
  one archive row but two rating updates, which is correct.
- **The em dash `—` is used as an empty-value placeholder** in tables. That
  is a display convention, not prose, and should be left alone.
- **On Windows, Node may not be on PATH** in some shells. See
  `docs/WINDOWS_SETUP.md`.

## Diagnose, then link out

`src/data/resources.js` is the one place that names outside resources: one
YouTube video per coaching category (by rating band) and per tactic, and the
Lichess themed-puzzle URLs. `src/analysis/studyPlan.js` turns a player's one
priority (`playerHome.js`) into the five-row plan, `StudyPlan.jsx` draws it
on the player's home and on Training, and `ui/ExternalLink.jsx` opens every
outside link in a new tab with `rel="noopener noreferrer"` and says so to
screen readers. An empty video slot falls back to the next one (category at
any rating, then the band's fundamentals video), so nothing renders broken.
Games already saved with `mode: 'computer'` (from the removed Play page) still
show in the archive and review as "vs Computer". An old `#/play` link lands on
the not-found page.
