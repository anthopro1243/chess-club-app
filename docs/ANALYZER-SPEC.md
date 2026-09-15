# Game analyzer — build spec

Everything needed to take a PGN with clock timestamps, turn it into per-player strengths and weaknesses scored 0–100, tell the player what to fix, and track it over time.

**Ships with this spec:**

| File | What it is | State |
|---|---|---|
| `src/analysis/scoring.js` | All the math. Dependency-free, pure functions. | **Written and tested — drop it in as-is** |
| `src/analysis/scoring.test.js` | 29 assertions, including a regression test for the accuracy-formula bug. | **Passing** |
| `supabase/migrations/0xx_game_analysis.sql` | `game_analyses`, `player_skill_scores`, `player_skill_history`, with RLS. | **Written — renumber and run** |
| `src/analysis/pgn.js` | PGN importer. Contract below. | To write — binds to your engine |
| `src/analysis/motifs.js` | Blunder motif tagging. Contract below. | To write — binds to your engine |
| `src/engine/stockfishClient.js` | Needs an `evaluate()` added. Contract below. | To extend |
| `src/analysis/analyzeGame.js` | The orchestrator that wires the above together. | To write |

`game_analyzer.py` is not in the repo and could not be reached, so nothing here is a port of it. It is a fresh browser-side implementation — which is the right target anyway, for the reasons in Decision 1.

---

## Decisions

Answering the five open questions, plus the things flagged as possibly missed.

### 1. Where it runs — **browser only**

Stockfish 18 lite is already loaded in the page. Running analysis there means no server, no API key, no per-game cost, no queue infrastructure, and it works on the club wifi with the laptop lid open. The Python path stays useful for one thing — deep offline batch runs over a season's archive — but it is not on the critical path and should not gate anything.

Run it in a dedicated Web Worker, not the one driving the Play page's opponent. Two engine instances is fine; one engine serving two consumers is a bug factory.

### 2. Depth — **14 by default, 16 for tournament games**

At depth 14 the lite single-threaded build takes roughly 0.2–0.5s per position on a mid-range laptop, so a 40-move game is about 30–60 seconds. Depth 20 is 5–10× that for analysis a club player cannot use: the difference between depth 14 and depth 20 shows up in positions neither you nor your opponents can reach.

Cap by nodes as well as depth (`go depth 14` with a node ceiling around 400k). Depth alone means a fast phone and a slow Chromebook spend wildly different amounts of time on the same game; a node cap makes the result reproducible, which matters because you are comparing players to each other.

Store `depth` and `engine` on every analysis row. When you raise the depth later, old rows must not be silently compared against new ones.

### 3. Automatic or on demand — **auto-enqueue, lazy process**

Archiving a game marks it `analysis_pending`. A worker drains the queue whenever the app is open and idle, plus a coach-facing **Analyze all pending** button for a batch run after club night. Nobody waits on a progress bar to see their game, and nobody has to remember to trigger it.

### 4. Who sees what — **player sees only their own; coach sees everything**

This is the call with the most at stake, because the audience is minors.

- A **player** sees their own eight scores, their trend, their own critical moments, and **one** priority to work on. Not a ranked list of all their failures.
- A **coach** sees everything, across all players, including cross-player comparison.
- **No player ever sees another player's analysis.** Not the scores, not the blunders. A leaderboard of who blunders most is a way to lose members.
- **Parents** get the monthly coach-generated summary, not raw engine output.

Two presentation rules that matter as much as the permissions:

1. **Lead with the trend, not the level.** "Board vision 46, up 9 over ten games" reads as progress. "Board vision 46" reads as a verdict.
2. **Never show a score with `confidence: 'low'` as a number.** Show it as "not enough games yet". The module already tells you which those are.

### 5. Storage — **yes, the migration is written**

`game_analyses` (one row per game per side), `player_skill_scores` (current tracked score per category), `player_skill_history` (append-only, for the chart). RLS included. It does not modify any existing table.

### On the things flagged as maybe-missed

| Raised | Verdict |
|---|---|
| Opening repertoire | Correct that it needs an assigned repertoire first. Until then report **book depth** and **eval at the end of the opening**, which need nothing assigned. Defer the repertoire itself. |
| Head-to-head / player vs. past self | Past-self is free — `player_skill_history` is exactly that chart. Player-vs-player comparison: **coach view only**, per Decision 4. |
| Coach's written overlay | Yes. `game_analyses.coach_note` is in the migration. The engine is often right about the move and wrong about the lesson. |
| Export / parent report | Yes, but as the monthly report in Phase 2 of the audit, not per game. |
| Non-PGN input | **FEN-only: yes**, trivial, analyze one position. **Scoresheet photo or board photo: no.** OCR of a handwritten scoresheet is a research project with a bad success rate, and a wrong transcription produces confident wrong coaching. |
| Puzzle generation from a player's own blunders | **Yes — build this.** It is the highest-value item on the whole list and it is nearly free: every entry in `critical` is already a position plus a known best move, which is the definition of a puzzle. See "The loop" below. |

---

## The pipeline

```
PGN text
  │
  ├─ parsePgn()            tags, SAN movetext, [%clk] per move
  │
  ├─ replay through chess.js  → FEN at every ply
  │
  ├─ evaluate(fen) per ply  → cp/mate + PV + MultiPV alternatives
  │
  ├─ buildPlyRecords()      → phase, quiet, tacticAvailable, hangs, motifs
  │
  ├─ analyseGameForSide()   ─┐
  ├─ rubricScores()          ├─ src/analysis/scoring.js — already written
  ├─ updatePlayerScores()    │
  └─ improvementPlan()      ─┘
        │
        └─ write game_analyses + player_skill_scores + player_skill_history
```

### Contract: `evaluate()` on stockfishClient

`stockfishClient.js` currently exposes only `bestMove()`, which waits for `bestmove` and throws away the `info` lines. The scores are in those discarded lines.

```js
/**
 * @param {string} fen
 * @param {{depth?: number, multiPV?: number, maxNodes?: number, signal?: AbortSignal}} opts
 * @returns {Promise<{
 *   depth: number,
 *   nodes: number,
 *   lines: Array<{            // length === multiPV, ordered best first
 *     multipv: number,
 *     cp: number|null,        // from the side-to-move's point of view
 *     mate: number|null,      // signed distance, side-to-move's point of view
 *     pv: string[],           // UCI moves
 *   }>
 * }>}
 */
export async function evaluate(fen, opts = {}) { /* ... */ }
```

Implementation notes that will save an afternoon:

- Set `setoption name MultiPV value N` **before** `position`/`go`, and set it back to 1 afterwards or the Play page's opponent gets slower and weaker.
- Keep the **last** `info` line per `multipv` index before `bestmove` — earlier ones are shallower iterations.
- Ignore `info` lines containing `upperbound` or `lowerbound`; those are fail-high/fail-low reports, not evaluations.
- One search per position, queued. Do not fan out — a single-threaded WASM engine has one brain.
- Make it abortable. A user who closes the tab mid-analysis should not leave a worker spinning.

**The sign convention is the single most likely source of a silent, plausible-looking wrong answer.** Stockfish reports from the point of view of the side to move in the position it searched. After White moves it is Black to move, so the resulting position's score is Black's. `scoring.js` exports `normaliseAfter()` for exactly this. Use it, and assert it in a test with a known position.

### Contract: `parsePgn()`

There is no PGN importer in the repo — `chess.js` exports with `pgn()` but cannot read, and `readPgnTags()` in `LogGameForm.jsx` only regexes the tag headers.

```js
/**
 * @returns {Array<{
 *   tags: Record<string,string>,
 *   result: '1-0'|'0-1'|'1/2-1/2'|'*',
 *   moves: Array<{
 *     san: string,
 *     nags: number[],          // $1, $4 …
 *     comment: string|null,
 *     clockSeconds: number|null,   // from [%clk 0:29:57]
 *     evalCp: number|null,         // from [%eval] if present, informational only
 *   }>
 * }>}
 */
export function parsePgn(text) { /* ... */ }
```

Must handle, because real exports contain all of it:

- Multiple games in one file, separated by blank lines between movetext and the next tag block.
- `{ ... }` comments, including `[%clk 0:29:57]` and `[%eval -1.24]` inside them, and nested braces.
- `;` rest-of-line comments.
- NAGs (`$1`), and the inline glyphs `!`, `?`, `!?`, `?!`, `!!`, `??` attached to a move.
- **Recursive variations** `( ... )`, arbitrarily nested — **skip them**. Only the mainline is analyzed. This is where naive parsers break.
- Move numbers with and without the `...` continuation (`12... Nf6`), and results at the end (`1-0`, `*`).
- Null moves `--` and `Z0`; bail out of that game rather than mis-parsing.
- SAN with check/mate suffixes, promotion (`e8=Q+`), castling in both `O-O` and the digit-zero `0-0` form, and disambiguation (`Nbd7`, `R1e2`, `Qh4xe1`).

Validate as you go: replay each SAN through the engine and fail loudly on the first illegal move, naming the move number. A parser that silently drops a move produces an analysis that is wrong in a way nobody will catch.

**Clock parsing.** `[%clk]` gives time *remaining after* the move. Seconds spent on move *n* = `clk[n-2] - clk[n] + increment` for the same player (two plies back, because the values alternate sides). The first move of each side has no prior value — leave `moveSeconds` null rather than guessing, and make sure a null propagates as "not measured" instead of zero. A zero here reads as "played instantly" and will wreck the time-management score.

### Contract: `buildPlyRecords()`

Produces the `PlyRecord[]` that `scoring.js` consumes. Field by field:

- **`cpBefore` / `mateBefore`** — the top MultiPV line of the position before the move, already in the mover's point of view (it is the side to move there, so no flip needed).
- **`cpAfter` / `mateAfter`** — the position after the move, **flipped** via `normaliseAfter()`.
- **`bestUci`** — top line's first move. **`secondBestDelta`** — `lines[0].cp - lines[1].cp`, used to credit "only move".
- **`inBook`** — matched against a small opening book. A 2–3k-position book covering the mainlines your club actually plays is enough; don't ship a 20MB one. Fall back to "first 8 plies" only if you skip the book entirely, and say so in the UI.
- **`phase`** — by material, not move number: sum non-pawn material for both sides (Q=9, R=5, B=N=3). **Endgame** when that total ≤ 14. **Opening** when fullmove ≤ 12 and not endgame. Otherwise **middlegame**. Material-based is what makes a queenless position on move 15 correctly read as an endgame.
- **`quiet`** — the mover has no capture and no check available, and `|cp| < 200`. This is the filter that separates positional understanding from tactics, so get it right: generate the legal moves and check.
- **`tacticAvailable`** — the engine's best move gains ≥ 150cp over the *third* line (not the second — the second is often a transposition of the same idea).
- **`hangs`** — after the played move, the engine's best reply is a capture, and static exchange evaluation on that square is ≥ +200cp for the opponent. SEE, not "is it defended" — a defended knight taken by a bishop is still a loss.
- **`missedFreeCapture`** — before the move, a capture existed with SEE ≥ +200 and the player did not play it or anything better.
- **`motifs`** — see below.

### Contract: `motifs.js`

Tag *why* a blunder was a blunder. This is what turns "you blundered six times" into "you keep losing pieces to discovered attacks", which is the difference between a report and coaching.

Detected from the position plus the engine's refutation line (`pv` of the best reply):

| Motif | Detection |
|---|---|
| `hangingPiece` | Refutation's first move captures a piece with SEE ≥ +200. |
| `fork` | After the refutation's first move, that piece attacks two or more enemy pieces worth ≥ 3, or king + any piece. |
| `pin` | A slider attacks two enemy pieces on one line; the nearer is worth less than the further. |
| `skewer` | Same geometry, nearer piece worth more. |
| `backRank` | Refutation is mate or wins decisive material on rank 1/8 with the king's escape squares blocked by its own pawns. |
| `discoveredAttack` | Refutation's first move vacates a line, revealing a slider's attack on a piece worth ≥ 3 or the king. |
| `trappedPiece` | A piece has no square where its SEE is non-negative, and is attacked by something cheaper. |
| `deflection` | Refutation's first move captures or attacks a piece that was the sole defender of the square the second move lands on. |

**Ship v1 with `hangingPiece`, `fork`, and `backRank` only.** Those three cover the large majority of club-level blunders, and each of the others is a geometry function with its own edge cases. Add them one at a time, with a test per motif built from a known position.

---

## The loop — what makes this coaching rather than a game viewer

Analysis that stops at a report gets read once. Wire these three back into the app:

1. **Blunders become that player's puzzles.** Every `critical` entry is a FEN plus the move that should have been played — a puzzle, already validated by the engine. Write them into the puzzle pool tagged `source: 'own-game'` with the player's own date, and feed them through the spaced-repetition scheduler. A player re-solving the exact position they lost a rook in, two days later, is the single most effective drill in the whole app, and you get it almost for free.

2. **The priority sets the Training filter.** `improvementPlan()` returns `practice.trainingTheme` — a string matching the Training page's existing theme list ("Fork", "Back Rank Mate", "Hanging Piece", "Endgame", "Quiet Move"). The player's Training page should open pre-filtered to it, so "work on forks" is a screen they land on, not advice they have to act on.

3. **Suggested rubric scores sit beside the coach's.** Write the engine's eight scores into the Roster detail panel next to the manual ones, clearly labelled as suggestions. Never overwrite a coach score — the point is that you can see when the numbers and your judgement disagree, which is when you learn something about a player.

---

## Calibration

The anchors in `scoring.js` are reasoned defaults, not measurements. They are good enough to rank your players correctly from day one, which is what you need; they are not good enough for "62 means the same thing here as on Chess.com", which you don't.

After ~50 analysed club games, call `recalibrationReport(allRawMetrics)`. It prints the 10th/25th/50th/75th/90th percentiles for every raw metric across your actual club. Move the anchors so your club median lands at 50. Then a score means something concrete: *relative to this club*. Bump `schema_version` when you do, so old rows stay comparable to old rows.

---

## What the numbers looked like on test profiles

Three synthetic players run through the finished module, ~12 games each:

```
                            beginner   improver   board 1
                             (~600)     (~1100)   (~1600)
Opening knowledge               42         71         87
Tactical vision                 28         59         79
Positional understanding        49         72         83
Endgame technique               38         58         77
Time management                 50         35         85
Board vision                    29         70         87
Psychological resilience        33         64         79
Notation                         —          —          —
```

The improver's time management (35) sitting below the beginner's (50) is the module working, not a bug: that player reaches time trouble and then errs, while the beginner moves too fast to ever be short of time. That is a real and different problem, and it is the kind of thing a coach watching from across the room does not see.

Notation is `null` on purpose, everywhere. It is not measurable from a PGN — a PGN *is* notation, already transcribed by someone else. It gets filled by the typed-SAN drill and scoresheet checks. An honest gap beats an invented number.

---

## Order to build

1. `evaluate()` on stockfishClient, with a sign-convention test on a known position. **Nothing works until this is right.**
2. `parsePgn()`, with tests against a real Chess.com export including `[%clk]`, and one game containing variations.
3. `buildPlyRecords()` — phase, quiet, tacticAvailable first; leave `hangs`/`motifs` stubbed as `false`/`[]`.
4. Run the migration. Wire `analyzeGame.js` end to end and analyze one real game. **Ship this.** It already produces accuracy, ACPL, phase breakdown, critical moments and six of the eight scores.
5. `motifs.js` v1 — hangingPiece, fork, backRank — plus SEE, which `hangs` needs too.
6. Player view, then coach view.
7. The loop: own-blunder puzzles, Training pre-filter, suggested rubric scores.
8. Recalibrate at 50 games.
