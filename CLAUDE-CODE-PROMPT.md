# Claude Code prompt — build the game analyzer

Copy the four shipped files into the repo first:

```
src/analysis/scoring.js
src/analysis/scoring.test.js
docs/ANALYZER-SPEC.md
supabase/migrations/0xx_game_analysis.sql      ← renumber to follow your latest
```

Then paste everything below the line into Claude Code.

---

Here are the answers to the five questions you asked about the game analyzer, plus a spec and working code to build against. Read `docs/ANALYZER-SPEC.md` in full before writing anything — it contains the contracts, the detection rules, and the order to build in.

## Decisions — these are settled, don't re-open them

1. **Runs in the browser only.** Stockfish 18 lite WASM, in its own dedicated Web Worker, separate from the one driving the Play page's opponent. No server, no API key, no per-game cost. The Python scripts are not on the critical path and are not reachable from the repo — do not wait on them and do not try to port them.
2. **Depth 14 by default, 16 for games tagged as tournament games.** Cap by nodes as well (~400k) so a fast laptop and a slow Chromebook produce the same result. Store `depth` and `engine` on every analysis row.
3. **Auto-enqueue, lazy process.** Archiving a game marks it pending; a worker drains the queue while the app is open and idle. Add a coach-facing "Analyze all pending" button for a batch run after club night.
4. **Player sees only their own analysis. Coach sees everything. No player ever sees another player's.** The players are minors — this is a hard rule, not a preference. Two presentation rules go with it: lead with the trend rather than the level, and never render a score whose `confidence` is `'low'` as a number — show "not enough games yet" instead. The module already tells you which ones those are.
5. **Storage: run the migration in `supabase/migrations/`.** It adds `game_analyses`, `player_skill_scores`, `player_skill_history` with RLS, and modifies no existing table.

## What is already written — do not rewrite it

`src/analysis/scoring.js` is finished, dependency-free, and covered by 29 passing assertions in `src/analysis/scoring.test.js`. It holds every formula: centipawns → win probability, win-probability loss → accuracy, move classification, the eight rubric scores 0–100, Bayesian shrinkage for small samples, the EWMA that tracks a player over time, and the improvement plan.

Run `node --test src/analysis/scoring.test.js` first and confirm 29 pass. Then treat that file as fixed: **consume it, do not reimplement any of its math.** If you believe something in it is wrong, say so and show me the failing case — do not quietly change a constant.

Three things in it exist for reasons that are not obvious, and must survive:

- **Centipawn loss is never fed into the accuracy formula.** Everything converts to win-probability points first. This bug already happened once and drove every score to near zero; `scoring.test.js` has a regression test pinning it.
- **Moves in decided positions (>97% or <3% win probability) and book moves do not count toward any average.** This is what stops a forced move in a lost position being labelled a mistake and dragging a player's score down.
- **Every penalty is a rate over opportunities, never a raw count.** A raw count grows with the number of games analysed, which would penalise a player for having more of their games reviewed.

## What to build

Follow the order in the spec's last section — it is dependency-ordered, and step 4 is a shippable product on its own.

1. **`evaluate(fen, {depth, multiPV, maxNodes, signal})` on `src/engine/stockfishClient.js`.** It currently exposes only `bestMove()` and discards the `info` lines that carry the scores. Contract and the MultiPV/upperbound/sign gotchas are in the spec. **Write the sign-convention test against a known position before anything else** — a sign error here produces confident, plausible, completely inverted coaching, and nothing downstream will reveal it.
2. **`src/analysis/pgn.js` — a real PGN importer.** There is none: `chess.js` can write PGN but not read it, and `readPgnTags()` only regexes the headers. Must handle multi-game files, `{}` and `;` comments, `[%clk]` and `[%eval]`, NAGs and glyphs, and nested recursive variations (skip them — mainline only). Validate every SAN by replaying it through the engine and fail loudly with the move number on the first illegal move.
3. **`src/analysis/buildPlyRecords.js`** — produces the `PlyRecord[]` that `scoring.js` consumes. Phase by material (not move number), `quiet`, `tacticAvailable` first. Stub `hangs` as `false` and `motifs` as `[]` for now.
4. **Run the migration, wire up `src/analysis/analyzeGame.js`, analyze one real game end to end, and stop there to show me.** At that point it already produces accuracy, ACPL, phase breakdown, critical moments and six of the eight scores. I want to see a real game's numbers before you build further.
5. **`src/analysis/motifs.js` v1 — `hangingPiece`, `fork`, `backRank` only**, plus the static exchange evaluation they need. One test per motif from a known position. The other five motifs come later, one at a time.
6. **The player view, then the coach view**, following the permission and presentation rules above.
7. **The loop — this is the part that makes it coaching rather than a report:**
   - Every `critical` entry is a FEN plus the correct move, which is a puzzle. Write them into the puzzle pool tagged `source: 'own-game'` and feed them to spaced repetition. A player re-solving the position they dropped a rook in, two days later, is the most effective drill in the app and it costs almost nothing to build.
   - `improvementPlan()` returns `practice.trainingTheme`, a string matching the Training page's existing theme list. Open that player's Training page pre-filtered to it.
   - Write the engine's eight scores into the Roster panel beside the coach's manual scores, labelled as suggestions. **Never overwrite a coach score.**

## Ground rules

- Do not touch `src/engine/chess.js` or its perft suite. Add alongside; keep all 93 assertions passing.
- `npm test`, the browser suite, and the scoring tests all stay green before you move between numbered steps.
- No new runtime dependencies. Everything above is writable against what is already in the repo.
- Update `PROGRESS.md` after each step.
- If a contract in the spec turns out to be wrong once you are looking at real code, say so and propose the change — don't silently improvise around it.

## Open question for me, when you get to step 4

The opening book for the `inBook` flag. A 2–3k-position book covering the lines this club actually plays is enough; don't pull in a 20MB one. Tell me what you'd use and I'll decide. Until it exists, fall back to "first 8 plies" and make the UI say that is what it's doing.
