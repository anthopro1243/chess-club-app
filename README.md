# Chess Club app

The club website: a full-rules chessboard you can play on — against another
person or the real Stockfish engine at a chosen Elo — a tactics trainer over
hundreds of real, rated puzzles filterable by theme and difficulty, player
accounts with a club rating computed by actual Glicko-2 (the system
Chess.com's ratings are built on) fed by every game and puzzle, a live
leaderboard, and a roster you can edit from the browser and optionally share
live across devices.

React + Vite. The chess rules, the board, the routing, and the piece artwork
are all in this repository. The two things that aren't ours: the actual
Stockfish 18 engine (vendored, see `public/stockfish/README.md`) and a
curated slice of Lichess's open puzzle database (`src/data/puzzles.json`,
see `scripts/import-puzzles.mjs`).

---

## Running it

You need Node.js 18 or newer. On Windows, follow `WINDOWS_SETUP.md` instead of
this section — it walks through every step with a checkpoint at each one.

```bash
npm install     # once
npm run dev     # development server, opens http://localhost:5173
npm run build   # production build into dist/
npm run preview # serve the production build
npm test        # chess engine test suite
```

## What is in here

```
index.html                  page shell
vite.config.js              build config
public/
  stockfish/                 the real Stockfish 18 engine (WASM, vendored)
src/
  main.jsx                  entry point
  App.jsx                   nav, routing, light/dark theme
  engine/
    chess.js                the chess rules engine (no dependencies)
    chess.test.mjs          engine test suite
    stockfishClient.js       promise wrapper around the Stockfish worker
  components/
    Board.jsx               interactive board — click or drag
    Piece.jsx               the SVG piece set
    MoveList.jsx            game score, click a move to rewind
    PromotionDialog.jsx     queen / rook / bishop / knight picker
    AccountControl.jsx      sign-in / account button in the top bar
  pages/
    DashboardPage.jsx       club overview and leaderboard
    PlayPage.jsx            the game screen, human or vs. Stockfish
    TrainingPage.jsx        puzzle trainer, saves to a trainee's record
    GamesPage.jsx           the game archive, with PGN per game
    RosterPage.jsx          player list, detail, add / edit / remove, cloud sync
    CoachPage.jsx           oversight: attendance, assessments, progress, export
  data/
    roster.js               rubric definition and the (empty) roster seed
    rosterStore.js           the roster — local by default, cloud when configured
    store.js                 tiny localStorage-backed store used by rosterStore
    supabaseClient.js         reads VITE_SUPABASE_* env vars, or stays null
    auth.js                  email-magic-link sign-in / account creation
    gamesStore.js            the game archive — local, or the shared table
    exportWorkbook.js        builds the .xlsx export (loaded on demand)
    glicko2.js / glicko2.test.mjs  the actual Glicko-2 algorithm, verified
    puzzles.js / puzzles.json  402 real puzzles from Lichess's open database
  styles/
    app.css                 all styling, light and dark themes
scripts/
  import-puzzles.mjs        rebuilds puzzles.json from Lichess's puzzle dump
supabase/
  schema.sql                 run once in a new Supabase project for cloud sync
  migration-2-accounts-and-ratings.sql  run once in a project from before accounts existed
```

## The engine

`src/engine/chess.js` is a complete implementation of the rules: legal move
generation, castling (including the rules about castling out of, through, and
into check), en passant, promotion and underpromotion, check, checkmate,
stalemate, the fifty-move rule, threefold repetition, and insufficient
material. It reads and writes FEN, produces SAN with correct disambiguation,
and exports PGN.

It is verified with **perft** — the standard test where you count every legal
move sequence to a given depth and compare against published totals. The suite
runs six positions chosen to exercise the awkward cases (pinned pieces,
en-passant discoveries, promotion while in check). Any bug in move generation
changes the counts, so a passing run is strong evidence the rules are right.

```bash
npm test
```

### Using the engine on its own

```js
import { Chess } from './src/engine/chess.js';

const game = new Chess();
game.move('e4');
game.move({ from: 'e7', to: 'e5' });

game.moves();            // legal moves as SAN
game.moves({ square: 'g1', verbose: true });
game.fen();
game.status();           // { over, result, reason, text }
game.pgn({ White: 'CC-001', Black: 'CC-002' });
game.undo();
```

## Playing

- **Click** a piece then click a destination, or **drag** it. Legal
  destinations appear as soon as a piece is picked up.
- The move list is clickable — click any move to rewind the board to that
  point, then **Live** to come back.
- **Copy PGN** / **Download PGN** produce a file that `coach_report.py` reads
  directly, which is how a club game becomes an engine-backed review.
- The game in progress and its opponent settings are saved to the browser
  automatically — see **Persistence** below.

## Playing the computer

This is real Stockfish, not an approximation — every move it plays and every
strength setting comes from the actual engine, nothing is hand-tuned or
guessed. The **Opponent** panel on the Play page switches from human-vs-human
to human-vs-computer and lets you pick:

- **Elo** — a slider bounded to whatever range the loaded engine build
  reports for `UCI_Elo` (read live from the engine at startup, not
  hard-coded), so it's always accurate to the exact build in
  `public/stockfish/`.
- **Maximum strength** — turns off the Elo limiter entirely; the engine plays
  its true best move.
- **Thinking time** — Fast / Normal / Deep, i.e. how long it searches per move.

`src/engine/stockfishClient.js` talks UCI to the engine over a Web Worker
(`public/stockfish/stockfish-18-lite-single.js`, the single-threaded build —
no special server headers required, so it runs on any static host) and
serializes requests so a "New Game" or "Undo" mid-search can't race a stale
reply. While the computer is thinking, the board stops accepting moves for
its side — the status banner says so — and **Undo** takes back both its
reply and the move it answered, landing you back on your own turn.

## Training

402 real tactics puzzles pulled from
[Lichess's open, CC0-licensed puzzle database](https://database.lichess.org/#puzzles),
spanning 23 themes (forks, pins, back-rank mates, sacrifices, endgames, and
more) and the full Lichess rating range. Every puzzle is a forced line, not
just a single mating move: play the trainee's move, the opponent's reply is
played automatically, and the puzzle is solved once the whole line is played
out. Underpromotion is handled properly where a puzzle calls for it.

Pick a **Theme** and a **Difficulty** band to filter, or a **Trainee** to save
results to their roster record and their club rating — with no trainee
picked, progress only lasts the session.

**Refreshing the puzzle set:** `node scripts/import-puzzles.mjs` re-fetches a
fresh slice of the Lichess dump and rebuilds `src/data/puzzles.json`. Every
candidate is replayed end-to-end through `src/engine/chess.js` before being
accepted — anything that doesn't parse as a legal line is dropped rather than
guessed at.

## Persistence

- **The live game** (Play page) and **puzzle theme/trainee choice** always
  save to `localStorage`, per browser — refreshing resumes where you left off.
- **The roster** is local by default too (`src/data/rosterStore.js`), seeded
  once from the sample data in `src/data/roster.js`. Adding, editing, or
  removing a player sticks after a refresh.
- **Puzzle results** write onto the selected trainee's roster row (visible on
  the Roster page as puzzles solved and last-practiced date).

That covers "refreshing starts over" for a single browser. For a roster
shared live across every coach's device, see the next section.

## Shared roster and accounts (optional backend)

By default the roster is local to each browser — fine for one coach, but two
coaches on two computers see two different rosters, and there's no such
thing as "your own account." Connecting a free
[Supabase](https://supabase.com) project turns on both, with no code changes:

1. Create a Supabase project (free tier is enough).
2. In the Supabase dashboard's **SQL Editor**, run `supabase/schema.sql` once
   for a fresh project. For a project set up against an earlier version of
   this app, run the migrations it hasn't had yet instead, in order:
   `migration-2-accounts-and-ratings.sql`, then
   `migration-3-games-and-history.sql`.
3. In **Project Settings → API**, copy the Project URL and the `anon` public
   key.
4. Copy `.env.example` to `.env.local` and fill in
   `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. Restart `npm run dev` (or
   rebuild) after adding them.
5. In **Authentication → Providers**, make sure **Email** is enabled (it is
   by default) — that's what powers the magic-link sign-in.

Once configured, a **Sign in** button appears in the top bar. Anyone signs in
with just their email (a one-time link, no password — nobody types a
password into this app); the first time, they're asked to name their player
profile, which joins the roster and starts at the default Glicko-2 rating.
From then on the roster reads and writes through the shared `players` table
and updates live on every signed-in device via Supabase Realtime. Signed out,
or with no project configured at all, it transparently falls back to the
local behavior above — the app never requires an account to be usable, and a
coach can still add players by hand on the Roster page without one.

The anon key is meant to be public in a client bundle; access control is
entirely Row Level Security (`supabase/schema.sql`), which requires a signed-
in session for every read and write.

## Club ratings

Every player has a club rating computed by **Glicko-2** — implemented from
[Mark Glickman's own published paper](http://www.glicko.net/glicko/glicko2.pdf)
in `src/data/glicko2.js`, and checked against the worked example in that
paper (`src/data/glicko2.test.mjs`, part of `npm test`). This is the same
rating system Chess.com's ratings are built on. New players start at the
paper's own defaults — rating 1500, RD 350, volatility 0.06 — shown as
"provisional" until they've played enough to bring the deviation down.

Three things feed it, each applied as its own single-game rating period
(the standard way Lichess and Chess.com apply Glicko-2 to "live" ratings,
rather than batching a full rating period):

- **Puzzles** (Training page) — solving one is a win against an opponent
  rated at that puzzle's own Lichess rating; clicking "Show answer" is a
  loss. Retrying after a wrong guess doesn't affect the rating either way.
- **Games vs. the computer** (Play page) — a win, loss, or draw against an
  opponent rated at the Elo Stockfish was set to (or 3200 at maximum
  strength).
- **Games vs. another person** (Play page, human-vs-human mode) — pick both
  sides from the roster in the Opponent panel (not required — games between
  guests just aren't rated) and a finished game updates both players against
  each other's actual pre-game rating.

The Dashboard's **Club leaderboard** ranks everyone by this rating.

Every rating change is logged with its date, source, opponent and delta, so
progress is a history rather than a single number — visible as a trend line
on the Coach page and as a full log in the spreadsheet export.

## Game archive

Every finished game is saved automatically: who played, the result, how it
ended, move count, and the full PGN. The **Games** page lists them newest
first, filterable by player and by club-game vs. computer, and any game's
PGN can be copied or downloaded straight into `coach_report.py` for an
engine-backed review.

## Coach tools

The **Coach** page is the oversight screen — everything needed to run a
session in one place:

- **Attendance** — pick a session date, mark each player present or absent.
- **Player progress** — every player's rating, a trend line across all their
  recorded results, how many rated results and puzzles they have, and when
  they were last assessed.
- **Assessments** — score a player against the eight-category rubric with
  notes. Each one is kept as a dated record, so you can see movement over
  time; the roster's rubric bars always show the most recent.
- **Recent activity** — the last dozen recorded results across the club.
- **Export spreadsheet** — see below.

## Spreadsheet export

The Coach page's **Export spreadsheet** button produces a real `.xlsx`
workbook of everything the club has recorded, one tab per kind of record,
mirroring the structure of the original `chess_club_player_database`
workbook:

| Tab | Contents |
| --- | --- |
| Club Summary | Headline counts, averages, and rubric averages |
| Player Master | One row per player — identity, ratings, goals, notes |
| Skill Assessments | Every dated rubric assessment, one row each |
| Ratings Log | Every rating change: date, source, opponent, delta |
| Games | Every archived game, including its full PGN |
| Attendance | Grid of players against session dates, with totals |

It's generated in the browser — nothing is uploaded anywhere. The
spreadsheet library is only downloaded when you actually click export, so
it costs regular visitors nothing.

## Deploying

This is a static site — `npm run build` produces `dist/`, which is every
file the app needs, no server required. Any static host works:
**Vercel**, **Netlify**, and **Cloudflare Pages** all auto-detect a Vite
project (build command `npm run build`, output directory `dist`) and
redeploy automatically on every push once connected to the GitHub repo; add
your `VITE_SUPABASE_*` values in that host's dashboard as environment
variables if you're using the shared roster. **GitHub Pages** works too —
push `dist/` to a `gh-pages` branch (or use the official
`actions/deploy-pages` workflow) — since `vite.config.js` already uses a
relative `base: './'`, it works from a project subpath without extra config.

## Connecting it to the rest of the club setup

- `src/data/rosterStore.js` is where player data lives at runtime, whether
  that's local storage or the shared Supabase table above — no page needs to
  know which.
- The PGN produced on the Play page is the input format `game_analyzer.py`
  already accepts. Games played here can go straight into the existing
  analysis pipeline.
