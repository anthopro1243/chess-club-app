# Chess Club app

The club website. Members can:

- play on a full-rules chessboard, against each other or the real Stockfish
  engine at a chosen strength;
- train on 402 real Lichess puzzles, filtered by theme and difficulty;
- review their own games once the engine has analyzed them;
- climb a club leaderboard built on a real Glicko-2 rating.

Coaches get a roster, dated skill assessments, report cards and a
spreadsheet export.

The stack is React + Vite. The chess rules, the board, the routing and the
piece artwork all live in this repository. Two things come from outside:

- the Stockfish 18 engine, vendored in `public/stockfish/`;
- a curated slice of Lichess's open puzzle database, in
  `src/features/training/puzzles.json` (see `scripts/import-puzzles.mjs`).

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

With no `.env.local` the app runs entirely on browser storage, which is the
quickest way to try it. GitHub Actions runs lint, tests and build on every
push and pull request.

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

## Playing

There are three ways to move:

- **Click or drag:** click a piece then its destination, or drag it.
- **Keyboard:** Tab onto the board, move with the arrow keys, and press Enter
  or Space to pick up and drop. Every move is announced to screen readers.
- **Type it:** enter a move such as `Nf3` in the move box under the board.

The move list is clickable: rewind to any move, then come back to the live
position. A game in progress is saved to the browser, so refreshing resumes
it.

**Against the computer**, every move is real Stockfish. You can pick:

- the Elo, bounded by whatever range the loaded engine build reports;
- full strength;
- how long it thinks per move.

While it thinks, the board stops accepting moves for its side. **Undo** takes
back its reply and the move it answered.

**Against another person**, pick both players from the roster to have the
game rated. A signed-in member is always one of the two players. Clocks and
time controls are optional.

## Training

The trainer has 402 tactics puzzles from
[Lichess's CC0 puzzle database](https://database.lichess.org/#puzzles),
rated about 400 to 1700 and tagged with 59 themes. The theme menu shows the
ones with enough puzzles to practise. Every puzzle is a forced line: play
your move, the reply comes automatically, and the puzzle is solved when the
line is complete.

Puzzles have their **own puzzle rating**, separate from the club rating:

- only your first try at a puzzle counts;
- solving it again later doesn't count;
- positions taken from your own games are practice only.

Once you have five rated results, new puzzles are picked near your puzzle
rating. There are also endgame drills, and a review queue that brings back
the mistakes from your analyzed games.

To refresh the puzzle set, run `node scripts/import-puzzles.mjs`. Every
candidate line is replayed through the rules engine, and anything illegal is
dropped.

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
November 2026, migrations `0025`–`0027` are not yet applied to the live
database.

## History

Reports and logs from earlier work sessions are in
[`docs/history/`](docs/history/), and the prompts used to brief AI coding
agents are in [`docs/agents/`](docs/agents/). They are kept for context.
They are not current documentation.
