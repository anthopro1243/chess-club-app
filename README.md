# Chess Club app

The club website. Members can:

- have their games come in by themselves from a linked Chess.com or Lichess
  account (or by scoresheet or PGN for games played over the board);
- see what the engine found in those games, and get one thing to work on;
- follow a short weekly plan: a hand-picked YouTube video, Lichess themed
  puzzles, and their own mistakes to review;
- climb a club leaderboard built on a real Glicko-2 rating.

Coaches get a roster, dated skill assessments, report cards and a
spreadsheet export.

The app diagnoses and then links out. It does not host games, puzzles or
lessons: Lichess, Chess.com and YouTube do those better, and members already
use them. Over-the-board games come in through "Log a game", "Enter a
scoresheet" and "Import PGN".

The stack is React + Vite. The chess rules, the board, the routing and the
piece artwork all live in this repository. One thing is vendored: the
Stockfish 18 engine, in `public/stockfish/`, used for game analysis and the
endgame trainer. Every outside link (YouTube videos, Lichess puzzle themes)
is listed in one file, `src/data/resources.js`, and in
[`docs/RESOURCES.md`](docs/RESOURCES.md) with the date it was checked.

How the code is laid out, and the patterns to follow when changing it, are
in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Running the live club
(migrations, backups, approving members) is covered in
[`docs/RUNBOOK.md`](docs/RUNBOOK.md).

---

## Running it

You need Node.js 22 or newer (`.nvmrc` says 24). On Windows, follow
[`docs/WINDOWS_SETUP.md`](docs/WINDOWS_SETUP.md); it walks through every step
with a check at each one.

```bash
npm install          # once
npm run dev          # development server on http://localhost:5173
npm run build        # production build into dist/
npm run preview      # serve the production build
npm test             # unit tests, SQL migration tests, RLS check
npm run test:engine  # the slow suites that drive real Stockfish
npm run lint         # ESLint, including accessibility rules
```

### Local mode and environment variables

With no `.env.local` the app runs in **local mode**: no accounts, no sign-in,
and everything (games, roster, ratings) is kept in that browser's storage. It
is the quickest way to try the app, and there is nobody to approve or lock
out. Two variables switch on the shared database:

| Variable | What it is |
| --- | --- |
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | The project's public anon key |

Set both in `.env.local` (copy `.env.example`) and restart `npm run dev`. To
force local mode while a `.env.local` exists, start the server with both set to
nothing: `VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npx vite`.

GitHub Actions runs lint, tests and build on every push and pull request.

## The rules engine

`src/engine/chess.js` implements every rule:

- legal move generation;
- castling, including the rules about castling out of, through and into check;
- en passant, promotion and underpromotion;
- check, checkmate and stalemate;
- the fifty-move rule, threefold repetition and insufficient material.

It reads and writes FEN, produces SAN with correct disambiguation, and
exports PGN. It is verified with **perft**: count every legal move sequence
to a given depth and compare against the published totals. Any bug in move
generation changes the counts.

```js
import { Chess } from './src/engine/chess.js';

const game = new Chess();
game.move('e4');
game.move({ from: 'e7', to: 'e5' });
game.moves();            // legal moves as SAN
game.fen();
game.status();           // { over, result, reason, text }
game.pgn({ White: 'CC-001', Black: 'CC-002' });
```

## Training

The Training page is the player's weekly plan, then two things that stay in
the app because nobody else can do them:

1. **The plan**: the one thing the games point to, a **Watch** link (one
   YouTube video per weakness), a **Practise** link (Lichess's own themed
   puzzles, "about 15 minutes, a few times a week"), the count of **mistakes
   to review**, and a nudge to play one long game. With no analyzed games yet
   it shows defaults for a newer player. `#/training?theme=fork` focuses the
   plan on one tactic.
2. **Your mistakes**: positions you got wrong in your own analyzed games,
   brought back on a spaced-repetition schedule.
3. **Endgames**: textbook endgames played out against the engine.

A short "Practise a theme" list of Lichess links closes the page. The coach
changes a video by editing `src/data/resources.js` (the top of the file says
how); there is no in-app editor.

Chess.com is linked once, as a general puzzles page: free Chess.com accounts
are limited on themed puzzles.

## Club ratings

Every player has a club rating computed by **Glicko-2**. It is implemented
from [Mark Glickman's paper](http://www.glicko.net/glicko/glicko2.pdf) in
`src/features/ratings/glicko2.js` and checked against the paper's worked
example. New players start at 1500 and are marked provisional until enough
games have been played.

Games feed it, each as its own rating period:

- **Against the computer:** rated against the Elo Stockfish was set to.
- **Between two club members:** both players update at once, each against
  the other's pre-game rating.
- **Online games** from linked Chess.com and Lichess accounts, converted onto
  the club scale.

Every change is logged with its date, source, opponent and size. That shows
up as a trend on the Coach page and as the ratings log in the export.

## Games and analysis

Every finished game is archived with its full PGN. The **Games** page lists
them all; **My games** lists yours. Games played on a real board can come in
three ways:

- logged by hand;
- pasted or uploaded as PGN;
- typed up from a paper scoresheet.

New games are queued for engine analysis. This runs in the browser of
whoever is signed in, and each game is claimed by one browser at a time.
Analyzed games get a move-by-move review, mistakes explained in words, and
the time-use chart. They also feed each player's skill profile and the
club's weakest areas.

## Coach tools

The **Coach** page has:

- member approval and invite codes;
- player progress;
- dated assessments against the eight-category rubric;
- recent activity;
- a list of errors members' browsers have reported.

Each player on the **Roster** page also has a printable report card.

**Export spreadsheet** builds an `.xlsx` workbook in the browser, so nothing
is uploaded. The spreadsheet library only downloads when you click. It has
five tabs:

| Tab | Contents |
| --- | --- |
| Club Summary | Headline counts and averages |
| Player Master | One row per player: identity, ratings, goals, notes |
| Skill Assessments | Every dated rubric assessment |
| Ratings Log | Every rating change: date, source, opponent, delta |
| Games | Every archived game, with its PGN |

## Accounts and the shared database (Supabase)

Without a backend, the app works for one browser. To share it across the
club:

1. Create a [Supabase](https://supabase.com) project. The free tier is
   enough.
2. In the **SQL Editor**, run `supabase/schema.sql`, then the files in
   `supabase/migrations/` in number order. `docs/RUNBOOK.md` lists them and
   the one step in `0005` you must do by hand to make yourself the coach.
3. Copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` from **Project Settings → API**. Restart
   `npm run dev`.

Accounts are email and password, with at least 8 characters. Supabase Auth
holds the passwords. A new account has to be approved by the coach, or use
an invite code, before it sees anything. Members then link their account to
their roster row with their student ID.

The anon key is meant to be public. Access control is Row Level Security in
the database.

## Deploying

The app is deployed on Vercel, which builds `npm run build` and serves
`dist/`. `vercel.json` adds the security headers and long cache lifetimes
for hashed assets. Put the `VITE_SUPABASE_*` values in the Vercel project's
environment variables.

Preview deploys use the same database as production. Anything done on a
preview link while signed in changes real club data.

**Apply database migrations before deploying code that needs them.** As of
14 November 2026 every migration through `0028` is applied to the live
database (`docs/RUNBOOK.md` keeps the list).

## History

Reports and logs from earlier work sessions are in
[`docs/history/`](docs/history/), and the prompts used to brief AI coding
agents are in [`docs/agents/`](docs/agents/). They are kept for context.
They are not current documentation.
