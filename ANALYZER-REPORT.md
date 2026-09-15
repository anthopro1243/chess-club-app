# Game analyzer — build report

Built against `docs/ANALYZER-SPEC.md` and the autopilot brief. Five commits,
`4e25dd0..f6fd2b8`. **272 assertions green, 0 failing**, plus 15 engine-backed
assertions in `npm run test:engine`. Build clean.

---

## 1. What got built, step by step

| Step | State | Evidence |
|---|---|---|
| 1. `evaluate()` on stockfishClient | **done** | Gate 1, 10 assertions |
| 2. `parsePgn()` / `parseAndValidate()` | **done** | Gates 2+3, 21 assertions |
| 3. `buildPlyRecords()` | **done** | exercised by Gate 4 |
| 4. `analyzeGame.js` end to end | **done** | Gate 4, 5 tests, two fixtures |
| 5. `motifs.js` v1 + SEE | **done** | 10 + 12 assertions |
| 6. Player and coach views | **partial** | rules tested (20); JSX unverified |
| 7. The loop | **partial** | logic tested; three wirings outstanding |
| Gate 5 (permissions) | **blocked** | needs two real accounts |

`evaluate()` returns cp/mate plus MultiPV lines; `bestMove()` had been
discarding the `info` lines the scores live in. A Node transport
(`src/engine/nodeTransport.js`) drives the same WASM build under `node --test`
by applying the CommonJS wrapper by hand, so there is still exactly one copy of
the engine artifact in the repo.

Each position is evaluated **once** and reused as `cpBefore` for its ply and
`cpAfter` for the previous one, so an 80-ply game costs 81 evaluations, not 160.

### Worked around / deferred, with reasons

- **The other five motifs** (pin, skewer, discoveredAttack, trappedPiece,
  deflection) are not implemented. The spec says ship three; each of the rest is
  its own geometry function with its own edge cases.
- **No opening book.** `inBook` is "first 8 plies", per Decision 6, and
  `meta.bookSource` carries that string so the UI can say so.
- **Own-game puzzles are produced but not persisted.** `criticalMomentsAsPuzzles`
  returns them; nothing yet writes them into the puzzle pool or the
  spaced-repetition scheduler.
- **Suggested rubric scores are computed but not rendered.** `suggestedRubric`
  is tested (engine-only, never overwriting a coach score); the Roster panel
  does not display them yet.
- **The Training pre-filter is mapped but not navigated.** See §4.

---

## 2. Gate 4 output on a real game

Morphy–Duke of Brunswick & Count Isouard, Paris 1858, at depth 12.

```
White accuracy 81.5  | ACPL 57.9
Black accuracy 69.2  | ACPL 54.1

                           White            Black
  openingKnowledge           60 (low)         56 (low)
  tacticalVision             59 (medium)      54 (low)
  positionalUnderstanding     — (none)         — (none)
  endgameTechnique            — (none)         — (none)
  timeManagement             70 (medium)      69 (medium)
  boardVision                30 (medium)      45 (medium)
  psychologicalResilience     — (none)         — (none)
  notation                    — (none)         — (none)

Black's turning points:
  15. Nxd7 — onlyMove, -35.3% win probability (better: f6d7)
Black motif counts: { hangingPiece: 1, fork: 2 }
Puzzles generated from Black's blunders: 1
```

Second fixture, a rook-and-pawn endgame, covering what the first cannot:

```
White endgameTechnique        55  (raw 63, n=19, medium)
White positionalUnderstanding 55  (raw 92, n=3,  low)
quiet plies: 13 / 46
```

---

## 3. Decisions made on your behalf

1. **Gate 4 uses two fixtures, not one — and asserts more, not less.** Six of
   eight categories from a single game is a property of the *game*, not the
   code: `notation` is null by design, `endgameTechnique` needs the game to
   reach an endgame, `positionalUnderstanding` needs quiet positions. The Opera
   Game ends with 28 points of non-pawn material, so an endgame score would be
   invented — exactly what `scoring.js` refuses to do. Each null is now asserted
   **against its structural cause**, so a category reading null for the wrong
   reason fails the test.
2. **Fixture B is engine-played, not from the archive.** The archive is behind
   RLS and unreadable without an account.
3. **`npm test` stays fast; engine tests are separate.** `npm run test:engine`
   holds the two WASM-backed suites; `npm run test:all` runs both.
4. **Motifs are only tagged on moves that lost ground** (≥100cp, or a hang).
   Tagging every ply would put motifs on forced recaptures, and the counts drive
   the coaching advice.
5. **Permission and wording rules live outside the JSX**, in a unit-tested
   module, because a rule enforced only in React is not enforced.
6. **Two SEE test expectations were corrected.** SEE on d5 in that fixture is
   320, not 220 — the original stopped a ply early and forgot the d1 rook
   recaptures. Verified by hand before changing anything; arithmetic is in the
   test. This was a test written by a subagent this session, not `scoring.js`,
   which I did not touch.

---

## 4. Things I think are wrong or fragile — please look

1. **Deliberate sacrifices read as blunders.** Morphy's `boardVision` is **30**,
   *lower* than his opponents' 45, because `hangs` is SEE-based and a sound sac
   looks identical to hanging a piece. For club players this rarely matters; for
   your board 1 it will. Worth excluding plies where the engine's best move
   *is* the sacrifice.
2. **The spec's `trainingTheme` claim is false.** `improvementPlan()` emits
   display names ("Back Rank Mate"); `puzzles.json` uses Lichess keys
   (`backRankMate`). Unmapped, the pre-filter would show a player an **empty**
   Training page instead of the drill they were just told to do.
   `PUZZLE_THEME_BY_TRAINING_THEME` fixes it and its test checks every mapping
   against the shipped puzzle data.
3. **A latent bug existed in `stockfishClient` before this work.** Every wait
   registered its listener *after* sending the command. A Web Worker delivers
   asynchronously so the browser survived on timing luck. It is fixed, but the
   Play page's opponent shared that code path.
4. **`quiet` is rarer than it looks.** Requiring no capture *and* no check
   available means most middlegame positions never qualify — hence
   `positionalUnderstanding` being null on a whole tactical game. Correct per
   spec, but the anchors will need recalibration once you have real data.
5. **The eight scores come from provisional anchors.** They rank your players
   correctly; they do not mean the same thing as a Chess.com number. Run
   `recalibrationReport()` at ~50 games.
6. **None of the UI has been seen running.** Everything is behind `AccessGate`.

---

## 5. What you need to do by hand

1. **Sign in on the dev server and open a game on the Games page.** That is the
   only way anything in step 6 gets verified. `npm run dev` → localhost:5173.
2. **Run Gate 5**, which I cannot: it needs two real accounts.
   ```bash
   RLS_COACH_EMAIL=... RLS_COACH_PASSWORD=... RLS_PLAYER_EMAIL=... RLS_PLAYER_PASSWORD=... npm run test:rls
   ```
   It must fail *correctly* — a player denied by the database, not by a UI
   filter. This is the one gate protecting children's data.
3. **Decide on the three unfinished wirings** in step 7: persisting own-game
   puzzles, rendering suggested rubric scores, and navigating to a pre-filtered
   Training page.
4. **Nothing is pushed.** Five commits sit on local `master`.

No migration needs running. `0009_game_analysis.sql` was already applied by
hand, and nothing here altered the database.
