# Chess Club app

The club website: a full-rules chessboard you can play on — against another
person or a computer opponent — a mate-in-one trainer that saves results to a
player's record, a roster you can edit from the browser, and a dashboard that
points at what the club should be working on.

React + Vite. The only runtime dependencies are `react` and `react-dom` — the
chess rules, the search, the board, the routing and the piece artwork are all
in this repository, so there is nothing that can break on a version bump.

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
src/
  main.jsx                  entry point
  App.jsx                   nav, routing, light/dark theme
  engine/
    chess.js                the chess rules engine (no dependencies)
    chess.test.mjs          engine test suite
    ai.js                   the computer opponent (negamax, alpha-beta, PST eval)
    aiWorker.js              runs ai.js off the main thread
  components/
    Board.jsx               interactive board — click or drag
    Piece.jsx               the SVG piece set
    MoveList.jsx            game score, click a move to rewind
    PromotionDialog.jsx     queen / rook / bishop / knight picker
  pages/
    DashboardPage.jsx       club overview
    PlayPage.jsx            the game screen, human or vs. computer
    TrainingPage.jsx        mate-in-one trainer, saves to a trainee's record
    RosterPage.jsx          player list, detail, add / edit / remove
  data/
    roster.js               sample players and the rubric math
    rosterStore.js           the roster made persistent — reads/writes go here
    store.js                 tiny localStorage-backed store used by rosterStore
    puzzles.js              mate-in-one positions
  styles/
    app.css                 all styling, light and dark themes
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
- The game in progress, the roster, and puzzle results are all saved to the
  browser automatically — see **Persistence** below.

## Playing the computer

The **Opponent** panel on the Play page switches from human-vs-human to
human-vs-computer, and lets you pick which side you play and a difficulty:

- **Easy** — searches 2 ply and picks loosely among its best options, so it
  makes real mistakes.
- **Medium** — searches 3 ply with a little randomness among near-equal moves.
- **Hard** — iterative deepening up to 5 ply with a ~1.8s time budget; it
  plays close to its true best move every time.

The engine lives in `src/engine/ai.js`: negamax with alpha-beta pruning,
MVV-LVA move ordering, a capture-only quiescence search at the leaves so it
doesn't hang pieces one ply past the horizon, and the standard piece-square
tables for evaluation. It runs inside a Web Worker (`src/engine/aiWorker.js`)
so a "Hard" search never freezes the board.

While the computer is thinking the board stops accepting moves for its side —
the status banner says so — and **Undo** takes back both its reply and the
move it answered, so you land back on your own turn.

## Persistence

There is no backend or database — everything is saved to `localStorage`, in
this browser, on this device:

- **The live game** (Play page) — refreshing the page resumes exactly where
  you left off, opponent settings included.
- **The roster** (`src/data/rosterStore.js`) — adding, editing, or removing a
  player sticks. The sample data in `src/data/roster.js` is only the seed used
  the first time the app runs in a browser that has never saved a roster.
- **Puzzle results** — pick a trainee on the Training page and solved puzzles
  are written onto their roster row (visible on the Roster page as puzzles
  solved and last-practiced date); with no trainee selected, results only
  last the session.

This solves "refreshing starts over," but it is per-browser, not a shared
club database — two coaches on two computers see two separate rosters. Point
`rosterStore.js` at a real API (swap `createStore`'s localStorage calls for
`fetch`) to make the roster shared and multi-device.

## Connecting it to the rest of the club setup

- `src/data/rosterStore.js` is where player data lives at runtime. Swapping
  its storage for a real API, without touching any page, is the seam left
  open for a real backend.
- The PGN produced on the Play page is the input format `game_analyzer.py`
  already accepts. Games played here can go straight into the existing
  analysis pipeline.
