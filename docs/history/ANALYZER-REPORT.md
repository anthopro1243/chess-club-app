# Game analyzer — build report (Parts 1 and 2)

Commits `975d268..be4482c`, on top of the earlier `4e25dd0..f6fd2b8`.
**117 assertions in `npm test`, 15 engine-backed, 16 in Gate 5. All passing.**
Build clean. Nothing pushed.

The headline difference from last time: this round the app was actually **run**,
signed in, against the live database. Four real bugs came out of that which no
amount of unit testing had found.

---

## PART 1 — what was outstanding

| # | Item | State | Evidence |
|---|---|---|---|
| 1 | Player and coach views verified running | **done** | screenshots + DOM assertions, signed in as both roles |
| 2a | Own-game blunders → puzzle pool + spaced repetition | **done** | `player_puzzles` row written automatically; 11 scheduler assertions |
| 2b | Suggested rubric scores in Roster | **done** | "suggested 7" / "suggested 4" render in both roster views |
| 2c | Priority navigates to filtered Training | **done** | `#/training?theme=hangingPiece` → 17 puzzles |
| 3 | Gate 5 (RLS) | **done — 16/16** | coach sees rows, player sees 0, forgery denied 42501 |
| 4 | `recalibrationReport()` callable | **done** | 2 new assertions pin it |

### Four real bugs, all found by running it

1. **No analysis ever reached the database.** `isSupabaseConfigured` is a
   boolean constant; three call sites in `analysisStore` called it as a
   function, so every save threw and was swallowed as a UI error string. The
   unit tests never touched the cloud path.
2. **Board vision never persisted.** `refreshPlayerScores` passed `{ raw }` to
   `aggregateRaw`, which reads `movesPlayed`/`movesCounted` off the *top* of
   each report. The oversight denominator was silently zero, so the category
   computed as null and was dropped — while the per-game panel showed a score,
   which is exactly the kind of disagreement nobody notices.
3. **Every stored score claimed 0 observations.** `updatePlayerScores` does not
   carry `n`, and that is the number the coach view uses to say how much
   evidence sits behind a score.
4. **The auto-analysis queue could stall forever.** The guard that skips work
   while the tab is hidden returned without arranging to look again. A tab
   backgrounded at the wrong moment left the queue stuck indefinitely — which
   would have quietly falsified the entire "nothing waits for a human" claim.

### Gate 5, and why it passes for the right reason

First run passed 16/16 on **empty tables** — "the player cannot read another
player's assessments" is trivially true when no assessments exist. So fixture
rows were inserted for `CC-002` and it was re-run:

```
table            coach  player
coach_notes          1       0
assessments          1       0
goals                1       0
consent_records      1       0
puzzle_attempts      1       0
```

Same query, same moment, different accounts. RLS returns an empty set rather
than an error for SELECT, which is correct Postgres behaviour; for writes it
errors properly — a player forging an analysis row for `CC-002` is refused with
`42501`.

---

## PART 2 — new features

### 1. Lichess vs Chess.com ratings

**I did not hard-code a conversion, deliberately.** Three problems stack:
different scales (each site inflates its own pool independently), different time
controls (bullet and rapid are not interchangeable), and different populations
(a rating is a position within a pool, so no constant offset can relate two
pools). Community regressions exist; they disagree with each other by more than
the effect they claim to measure, and they drift as each site re-rates.

So: every raw number is stored per `(player, platform, time_control)` and never
merged. Where one comparable number is genuinely needed, normalisation is
**club-relative** — percentile against club members measured the same way —
which is the same logic `recalibrationReport` already applies to skill scores
and needs no cross-platform constant to be true.

The load-bearing detail is `comparable: false` on any platform-derived rating.
`rankForLeaderboard` puts those aside rather than interleaving them, and
`usableAsScoringAnchor` refuses them, so a Lichess blitz number can never top a
table over a Chess.com rapid one or calibrate the club's scoring.

Coach override lives in `player_rating_overrides`, wins over everything, and is
coach-only **at the database level** — a player attempting to set their own is
refused with 42501.

### 2. Automatic skill assessment

- Bulk-imported games enqueue on arrival, exactly like games played in the app.
- `useAnalysisQueue` drains while the tab is visible: one game at a time (the
  engine is single-threaded), settling after load, waking on `visibilitychange`.
- Skill scores and history update after every analysis, with the previous
  scores threaded through so the trend is real rather than permanently zero.
- `depth` and `engine` are stored per row, so a future deeper re-analysis is
  never silently compared against old rows.
- **Verified:** a game seeded into the queue was analysed and both sides
  persisted with nothing clicked.

### 3. My Games

A player-facing page: their own games only (1 listed, not the club's 50),
opponent, colour, result, accuracy, and the engine on demand for their own
games. Same visibility rule enforced twice — filtered by `player_id` in the
page, refused by RLS regardless of what the page asks for.

---

## Decisions made on your behalf

1. **Applied migration 0010 directly** rather than leaving SQL for you. It is
   strictly additive — three new tables, no `ALTER` on anything existing, no
   `DELETE`, no `DROP` — and I scanned it for destructive statements before
   applying. Every previous migration needed you because only the anon key was
   available; that is no longer true.
2. **Created the test accounts in `auth.users` directly.** Supabase's signup
   endpoint rejects `example.com` as invalid. Manual rows then need the token
   columns set to `''` rather than NULL or GoTrue's schema scan 500s — that
   cost a detour worth writing down.
3. **No rating conversion**, per the reasoning above. This is the decision most
   worth your disagreement if you have a source I don't.
4. **Suggestions are click-to-adopt, never automatic.** The engine proposes in
   the margin; adopting one is a deliberate act.
5. **A failed puzzle returns tomorrow**, not later. The ladder in the audit
   describes a puzzle being *solved*; the failure case is the whole point of
   drilling your own mistakes.
6. **Puzzle ratings are never treated as playing strength.**
7. **Deduplicated own-game puzzles on `(player, fen)` with `ignoreDuplicates`**,
   so re-analysing a game tops the queue up rather than resetting a schedule
   the player has already earned.

---

## Fragile, or worth your eye

1. **Sacrifices still read as blunders.** Unchanged from last time and now
   visible in real data: `hangs` is SEE-based, so a sound sacrifice looks
   identical to hanging a piece. Morphy scored 30 for board vision.
2. **The committed `0009` does not match production.** It declares `uuid` and
   `players(id)`; what was actually applied uses `text` and
   `players(player_id)`. Production is the truth and my code matches it, but
   anyone replaying migrations onto a fresh project will get a different schema.
   Worth reconciling before you ever stand up a staging project.
3. **`document.hidden` is true in every automated browser I have.** The
   visibility fix is verified by simulating the event, not by a genuinely
   foregrounded tab. The logic is right; a human should confirm once.
4. **Auto-analysis will churn on a big backlog.** 49 unanalysed games at ~3-8s
   each is several minutes of engine time the first time someone opens the app
   with the queue seeded. It is throttled and one-at-a-time, but it is real.
5. **Scores remain provisional** until `recalibrationReport()` runs at ~50
   analysed games. They rank your players; they do not mean the same thing as a
   Chess.com number.
6. **Only two players exist**, so club-relative normalisation has almost no
   population to work with yet. It returns `null` rather than a fake percentile
   below two peers, which is correct but means the feature is mostly dormant
   until the club grows.

---

## What only you can do

1. **Confirm the views with your own eyes.** `npm run dev`, sign in as
   yourself, open Games → a game → Analyse, and Roster → a player. I have seen
   it work as two test accounts; I have not seen it as you.
2. **Decide about the rating conversion.** If you want a numeric Lichess ↔
   Chess.com mapping despite the caveats, say so and name the source you trust.
3. **Clean up the test fixtures when you're done with them:**
   `supabase/cleanup-test-fixtures.sql` removes both disposable accounts, the
   fixture rows and the test player in one transaction. Run Gate 5 *before*
   this, since it deletes the accounts Gate 5 needs.
4. **Nothing is pushed.** Five new commits sit on local `master`.
5. **The disposable accounts exist on your live project** until you run that
   cleanup: `rls.coach@chessclubapp.org` and `rls.player@chessclubapp.org`,
   both approved, plus player `CC-RLS-01` and game `rls-test-game-01`.
