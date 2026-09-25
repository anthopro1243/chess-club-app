# Buildout progress

Ledger for the gap-audit backlog. **On a new session, read this first and
continue from the first unchecked item.**

`[x]` done · `[~]` partly done, note says what is left · `[ ]` not started ·
`[-]` deliberately deferred, reason given.

---

## Phase 0 — Stop losing data and close the front door

Reordered by dependency rather than the audit's listing order: ground rule 5
says policies ship with every table, so the role helpers those policies call
had to exist before any new table did.

- [x] **Role and access foundation** — `0005_roles_and_access.sql`. `profiles`
      with role and approval status, the `is_coach` / `is_approved` /
      `owns_player` helpers, invite codes with a `redeem_invite` function, and
      replaces the old `using (true)` policies on `players` and `games`.
- [x] **Puzzle attempt logging** — `0006`, `src/data/puzzleAttemptsStore.js`,
      wired into Training. One row per attempt, failures included, with themes,
      difficulty, rating, hint/solution flags and seconds taken. Verified in the
      browser: a failed then successful attempt on one puzzle produced two rows
      reading "2 attempts · 50% right". Training now shows measured accuracy and
      the three weakest themes.
- [x] **Invite-only signup with coach approval** — `MemberApproval.jsx` on the
      Coach page (approve, reject, suspend, set role, generate codes) and an
      invite-code entry for pending accounts in the account menu.
- [x] **Real roles enforced in the database** — policies in 0005/0006/0007/0008,
      plus `supabase/rls-test.mjs`, which signs in as a real player and asserts
      the database refuses what the UI merely hides.
- [x] **Coach notes in a coach-only table** — backfilled into `coach_notes`,
      then blanked in `players`. `coachNotesStore.js` reads and writes it,
      gated on the coach role. Verified: the note renders from the new store
      with the player row's field empty.
- [x] **Coach-issued password reset** — Coach page → Members → Password help.
      Sends to the guardian address rather than using the admin API, which
      would need the service-role key in client code.
- [x] **Backups and soft deletes** — `deleted_at` on `players` and `games`,
      hard delete narrowed to admins, and `docs/RUNBOOK.md` with the backup,
      restore and restore-testing procedure.
- [~] **Split the player row** — `0007` creates `assessments`, `attendance`,
      `ratings` and `goals` and copies every JSON blob across, idempotently,
      leaving the old columns untouched as a safety net. **The client still
      reads and writes the blobs.** The data is now queryable in SQL, but the
      lost-update problem the audit describes is not fixed until the stores
      move over. Next step: `rosterStore.js`, `CoachPage`, `RosterPage`.
- [~] **Parent consent record** — `0008` creates `consent_records` (guardian
      name, email, phone, relationship, under-13 flag, what they were told,
      how consent was verified, photo release, emergency contact, withdrawal).
      **There is no intake form yet**, so records have to be added in SQL.
      Next step: a consent panel on the roster detail.

## Phase 1 — Make it a competition program

- [x] **Chess clock and time controls** — `src/data/chessClock.js` with 42
      assertions. G/30;d5, G/60;d5, G/25;d5, 5+3, 3+2, 10+0. Delay and
      increment implemented as the different things they are. Flag detection
      ends the game. Clock readings go into the PGN as `[%clk]` comments, the
      form `game_analyzer.py` already parses. Verified running in the browser.
- [x] **Internal Elo** — already existed before this backlog: Glicko-2 in
      `src/data/glicko2.js`, verified against Glickman's paper, updating from
      games, puzzles and imported online games. What remains is moving the
      stored value into the new `ratings` table, which belongs with the split
      above.
- [x] **Resign, draw offer, and manual result entry** — resign and draw
      buttons on Play; `LogGameForm` on the Games page takes two players, a
      result and an optional PGN, and fills the rest of the form in from the
      PGN's own tags. Verified: a pasted PGN set the result, date and
      termination, and the logged game moved both players' ratings correctly.
- [x] **Colorblind-safe highlights** — last move, selected square and check
      each get a distinct shape (solid edge, dashed edge, double ring) as well
      as a tint, so they stay tellable apart in greyscale.
- [x] **RLS and auth test suite** — `npm run test:rls`. Runs in `npm test` and
      skips cleanly without credentials.
- [ ] **Tournaments** — Swiss pairing, standings, Buchholz and
      Sonneborn-Berger tiebreaks, sections. The largest remaining item, and the
      one most worth writing tests for first: pairing bugs are silent.
- [ ] **Board order / lineup**
- [ ] **Homework**
- [ ] **Session planner**
- [x] **CSV intake** — bulk roster import from the Google Form export, 2026-09-25, on
      branch `feature/roster-import` (awaiting merge). See the session log at the end.
- [ ] **Player personal dashboard**
- [ ] **Board accessibility** — arrow-key navigation, SAN entry, announced
      moves. Not started. Worth pairing with the notation rubric category.

## Phase 2 — Turn the data into teaching

- [-] **Deferred, on the audit's own instruction:** "Do not start this phase
      until there are several weeks of real Phase 0/1 data." Attempt logging
      only started collecting today. Adaptive difficulty, spaced repetition and
      the rubric loop all need weeks of attempts before they say anything a
      coach could not guess. The tutor in particular is only worth having once
      it can say "third time this month", which is a claim about history.

## Phase 3 — Polish and habit

- [ ] Not started. None of it blocks anything; pull items forward whenever the
      club asks.

---

## Analyzer buildout

Following `docs/ANALYZER-SPEC.md` and the autopilot brief. Gates are the
self-verification tests that stand in for a human reviewing each step.

- [x] **Step 1 — `evaluate()` on stockfishClient** plus a Node transport so the
      engine can be driven from `node --test`. **Gate 1 green: 10 assertions.**
      Found and fixed a real latent bug on the way: every wait registered its
      listener *after* sending the command. A Web Worker delivers messages
      asynchronously so the browser survived it by luck; under Node the engine
      emits synchronously, `uciok` fired before anything was listening, and
      `ready` never resolved. Gate 1 now runs in 594ms rather than hanging.
- [x] **Step 2 — `parsePgn()` / `parseAndValidate()`. Gates 2 and 3 green: 21
      assertions.** Nested recursive variations, multi-game files, both
      castling spellings, over-disambiguated SAN, and the rule that the first
      move of each side reports `null` seconds rather than `0`.
- [x] **SEE (`src/analysis/see.js`) — 12 assertions.** Two expectations in the
      original test were wrong, not the implementation: SEE on d5 in that
      fixture is 320, not 220. The test stopped a ply early and forgot the d1
      rook recaptures after `exd5`. Arithmetic is recorded in the test.
- [x] **Step 3 — `buildPlyRecords()`** — phase by material, `quiet`,
      `tacticAvailable` measured against the *third* line, `hangs` and
      `missedFreeCapture` via SEE. Each position is evaluated once and serves
      as `cpBefore` for its ply and `cpAfter` for the previous one, so an
      80-ply game costs 81 evaluations rather than 160.
- [x] **Step 4 — `analyzeGame.js` end to end. Gate 4 green: 5 tests.**
      Opera Game: White 81.5% accuracy / 57.9 ACPL, Black 69.2% / 54.1.
      **Contract change, flagged rather than improvised:** the brief asks for
      six of eight categories from one real game. That is a property of the
      game, not the code — `notation` is null by design, `endgameTechnique`
      needs the game to reach an endgame, and `positionalUnderstanding` needs
      quiet positions. The Opera Game ends with 28 points of non-pawn material.
      So Gate 4 uses two fixtures and asserts each null against its structural
      cause, which is stricter than the original bar: a category reading null
      for the wrong reason now fails. Fixture B is an engine-played rook
      endgame because the archive is unreadable behind RLS.
- [x] **Step 5 — `motifs.js` v1** (hangingPiece, fork, backRank) — 10
      assertions, one positive and one negative per motif. Found a real bug on
      the way: move generation only emits a pawn's diagonal when an enemy piece
      already stands there, so asking it what a pawn attacks returned the
      forward push and nothing else, making every pawn fork invisible. Pawn
      attacks are now computed geometrically.
- [x] **Step 6 — player and coach views.** The *rules* are done and tested:
      `src/analysis/presentation.js` (20 assertions) holds the permission
      boundary and the wording constraints, deliberately outside the JSX —
      "no player ever sees another player's analysis" has to be testable
      without a browser. `GameAnalysisPanel.jsx` renders it and is wired into
      the Games page. **Not visually verified:** the whole UI sits behind
      `AccessGate`, and Claude cannot sign in.
- [x] **Step 7 — the loop, all three pieces.** Own-game blunders are written
      into `player_puzzles` tagged `source: 'own-game'` and scheduled by
      `spacedRepetition.js` on the audit's ladder (two days, a week, a month),
      with a failed puzzle returning tomorrow rather than later. Suggested
      rubric scores render beside the coach's own in both roster views, and
      are click-to-adopt - never written automatically. The priority button
      navigates to Training pre-filtered via `#/training?theme=`.

      **Second contract error found here, flagged not improvised:** the spec
      says `improvementPlan().practice.trainingTheme` "matches the Training
      page's existing theme list". It does not. The plan emits display names
      ("Back Rank Mate", "Hanging Piece"); `puzzles.json` uses Lichess keys
      (`backRankMate`, `hangingPiece`). Unmapped, the pre-filter would show a
      player an empty Training page instead of the drill they were just told
      to do. `PUZZLE_THEME_BY_TRAINING_THEME` fixes it, and its test checks
      every mapping against the shipped puzzle data rather than a hand-written
      list, so a re-import with different tags fails the suite.

- [x] **Gate 5 (permissions) — 16 assertions, passing.** Two disposable
      accounts were created directly in `auth.users` (Supabase's signup
      endpoint rejects test domains), and fixture rows were added so the
      denials mean something rather than passing on empty tables. Verified
      both ways: the coach sees one row per table, the player sees zero on the
      identical query, and a player forging an analysis row is refused with
      Postgres 42501. `supabase/cleanup-test-fixtures.sql` removes all of it.

## Part 2 — features

- [x] **Per-platform ratings** — `player_platform_ratings` stores one row per
      (player, platform, time control) and nothing is ever merged.
      `src/analysis/ratings.js` explains why no conversion is hard-coded and
      normalises club-relative instead. Coach override in
      `player_rating_overrides`, coach-only at the database level.
- [x] **Automatic skill assessment** — imported games enqueue on arrival like
      games played in the app; `useAnalysisQueue` drains while the tab is
      visible; skill scores and history update themselves. The coach's
      "Analyse all pending" is a backlog tool, not the mechanism.
- [x] **My Games** — a player-facing page listing only their own games, with
      analysis on demand.

### Corrections to this file

Two claims elsewhere in this document were already out of date and have been
verified false against the live database:

- "Migrations are written, not run" — **all** of `migration-4`, `0005`-`0008`
  are applied in production, and `0009_game_analysis.sql` was applied by hand.
- "Nothing is pushed or deployed yet. Four commits are waiting locally." —
  everything is pushed; the app is live.

## Decisions

Made without asking, so they can be reversed knowingly.

- **Migrations are written, not run.** Only the anon key exists in this
  environment and it cannot execute DDL. Every schema change is a numbered
  file in `supabase/migrations/`.
- **`0005` ends with a manual step.** Every existing account is backfilled as
  role `player`. Until you make yourself an admin, nobody can approve members
  or read coach notes, including you. The SQL is at the bottom of the file.
- **Migration order matters more than usual.** `0005` must run before
  `0006`–`0008`; they all call its helper functions. And every migration must
  run *before* the matching deploy, or writes fail against columns that do not
  exist yet.
- **Signed out with a backend configured still behaves as before.** That is
  the browser's own storage, there is nobody to keep anything from, and the
  cloud rows are unreachable without a session. Role gating only applies to a
  real signed-in account.
- **Coach-issued reset goes to the guardian email.** The Supabase admin API
  needs the service-role key, which must never reach client code and would
  mean hosting a server function. Intake records a guardian email anyway.
- **Per-move times live in the PGN**, as `[%clk]` comments, rather than in a
  new column. That is the standard form, it survives export, and
  `game_analyzer.py` already reads it.
- **Attempts are only recorded against a selected trainee.** An attempt with
  nobody attached cannot tell anyone anything later.
- **Internal Elo counted as already done.** The audit lists it as missing; it
  shipped before this backlog and works.

## Open questions

Not blocking — sensible defaults are in place for all four. Answer them and I
will adjust.

1. **Anyone under 13?** Assumed yes, so every member is treated as needing
   guardian consent. `consent_records.under_13` and `method` exist because
   COPPA wants consent *verifiable*, not just a ticked box.
2. **Staging Supabase project?** Assumed none yet. Setup steps are in
   `docs/RUNBOOK.md`.
3. **Default time controls?** Assumed G/30;d5, G/60;d5, G/25;d5, 5+3, 3+2,
   10+0. A `customControl()` helper exists but has no UI yet — say the word and
   I will add the custom entry.
4. **Run migrations against live, or hand you the SQL?** Cannot run them from
   here regardless.

---

## What you need to do

Nothing here can be done from this environment. In order.

### 1. Run the migrations, in this order

In the Supabase SQL editor. **Take a backup first.**

1. `supabase/migration-4-linked-accounts.sql` — outstanding from the previous
   session, adds `connections` and `imported_game_ids`.
2. `supabase/migrations/0005_roles_and_access.sql` — **then do the manual
   admin step printed at the bottom of that file**, or you lock yourself out
   of your own coach tools.
3. `supabase/migrations/0006_puzzle_attempts.sql`
4. `supabase/migrations/0007_split_player_row.sql` — then run the two
   verification queries at the bottom to confirm the backfill matches what the
   JSON columns held.
5. `supabase/migrations/0008_consent_and_soft_delete.sql`

### 2. Deploy, after the migrations

Nothing is pushed or deployed yet. Four commits are waiting locally.

```bash
git push origin master
npx vercel --prod
```

### 3. Prove the permission rules

Needs two real accounts: yours, and a throwaway player account. I cannot
create accounts or enter passwords.

```bash
RLS_COACH_EMAIL=... RLS_COACH_PASSWORD=... RLS_PLAYER_EMAIL=... RLS_PLAYER_PASSWORD=... npm run test:rls
```

### 4. Test a restore, once

`docs/RUNBOOK.md` → Backups. A backup you have never restored is not a backup,
and doing it once also gets you the staging project you do not have.

### 5. Answer the four open questions above

Particularly the under-13 one, which changes what the consent flow has to
collect before I build the intake form.

### 6. Sign in on the dev server when convenient

Still outstanding from last session: the Connected accounts modal and the new
member-approval UI only render for a signed-in account, so I have not seen
either running against a real session.

---

## Session 2026-09-25 — bulk roster import (Phase A item 3)

Branch `feature/roster-import`. Not merged; production unchanged apart from migration 0018.

**Baseline before any change:** `npm test` 376 pass / 0 fail, `test:engine` 15/15, build ✓ —
identical to the handoff.

**Built**
- `src/data/rosterImport.js` — pure planner: RFC 4180 CSV parsing, header matching that ignores
  case/spacing/punctuation, per-field validation, signup-order `CC-###` allocation above every id
  ever issued, dedupe by student ID → school email → name, in-file duplicate detection.
- `src/data/rosterImport.test.js` — 39 tests, most of them negative cases (bad ID, empty ID,
  missing name, out-of-range grade, bad email, repeated ID / email in one file, same-name students,
  the student ID never reaching the `players` payload).
- `src/data/playerPrivateStore.js` — coach-only store for student ID + school email, shaped like
  `coachNotesStore.js`.
- `src/components/RosterImportModal.jsx` + Import CSV button on the Roster page (coach only).
- `supabase/migrations/0018_roster_import.sql`, **applied via the connector**: `player_private`
  table (coach-only RLS, `student_id` unique), `players.experience`, CC-003 soft-deleted.
  Numbered 0018 so 0012–0017 stay free for the missing-migration backfill.

**Fixed along the way (all required for the import to be correct)**
- The roster store ignored `deleted_at`, so soft-deleted players still showed everywhere but the
  analysis queue. It now hides them — while still counting their ids, so a retired `CC-###` can
  never be reissued (reissuing one would overwrite the retired row, games and all).
- `removePlayer` hard-deleted, cascading into games and analyses. It is now the soft delete
  migration 0008 was written for.
- `guardian_email` was never mapped in `fromRow`/`toRow`, so it was silently dropped on write.

**Decisions made in-session (flag if wrong)**
- US Chess ID → `connections.uscf.id`, not `ratings.uscf`: it's a membership number and that
  column renders as a rating.
- `player_private` has no "member reads own row" policy — coach-only, as asked.
- An invalid guardian email is dropped without failing the row; an invalid school email fails it
  (school email is a dedupe key, guardian email is not).

**After:** `npm test` 415 pass / 0 fail (235 under `node --test`), `test:engine` 15/15, build ✓.
`npm run test:rls` skipped (no fixture accounts on this machine); the new policy was checked by
evaluating `is_coach()` as a player login (false) and as the coach (true).

**Found, not fixed (out of this item's scope):** the top nav overflows at phone width (~570px wide
at a 375px viewport).

---

## Overnight session 2026-09-25 (autonomous, docs/OVERNIGHT-PLAN.md)

### Decisions I made overnight

1. **One branch, not one per item.** The plan asks for a branch per item. This session is only
   permitted to push to `feature/roster-import-9cg3im` (a copy of `feature/roster-import` at
   `f67bd9d`), so every item is its own commit (or commits) stacked on that branch, in plan order,
   each with the `area:` prefix. To split them later, cherry-pick the item's commits onto
   `feature/roster-import`. Nothing touched `master`.
2. **Retired-player filtering is defence in depth.** The roster store already hides
   `deleted_at` players, and the leaderboard, club skill profile, Coach page and every player picker
   iterate that roster, so CC-003 was already absent from them on this branch. I still filter skill
   scores and platform ratings by roster membership on the Dashboard and Coach page, so a retired
   player's rows cannot reach a club average by another route.
3. **The queue marks retired-only games `skipped` (not just passes over them).** A row left
   `pending` would return at the top of every claim and could starve the claim window. A game
   with **no** club player at all is not treated as retired-only. If RLS refuses the skip write,
   the game is still left out of that claim.

4. **PGN import does not touch ratings.** `LogGameForm` can feed the Glicko club rating; the PGN
   import only archives and queues for analysis. `players.club_rating` is known-wrong (HANDOFF
   §9.5) and a bulk file would push many results into it at once.
5. **An undated PGN game needs a date from the coach.** `pgnImport.js` refuses to invent a date, so
   the preview shows a date field for those games and holds them back until one is chosen. The
   chosen day is stored as noon UTC so it shows the same date in every US time zone.
6. **Anyone who can see the Games page can import**, the same audience as "Log a game". RLS
   decides what actually saves; I did not add a role check (permissions are out of scope).
7. **An import never overwrites an archived game** (`ignoreDuplicates` on the upsert, plus the
   stable `pgn:` id from `pgnImport.js`).
8. **Push is blocked.** Every push this session got HTTP 403 (git: "Claude doesn't have GitHub
   access to anthopro1243/chess-club-app"; API `create_branch`: "Resource not accessible by
   integration"). Reads work. Commits are local, and are also handed over as a patch file — see the
   Morning summary.

### Item 2 — hide soft-deleted players everywhere

- `src/data/retiredPlayers.js` (pure) + 11 tests, including negative cases (an active opponent keeps
  the game in the queue; a game with no club player is not skipped; with no id set the filter fails
  open instead of hiding everything).
- `src/analysis/queue.js`: `claimNext` reads the retired ids, marks retired-only candidates
  `skipped` with a readable `analysis_error`, and claims from what is left. Claim window 5 → 25.
- Dashboard + Coach page: skill rows and platform ratings are filtered to roster members.
- `supabase/pending/skip-cc003-games.sql` — **NOT applied.** Preview query, then an update in a
  transaction, then an undo line.
- After: `npm test` 426 pass / 0 fail (246 under `node --test`), `test:engine` 15/15, build ✓.

### Item 3 — PGN import on the Games page

- `src/data/pgnImportPlan.js` (pure) + 9 tests: preview rows from `importPgnText()`, archive
  duplicates marked and unticked, same member on both sides refused, undated games held until a date
  is chosen, a picked member's name replacing a placeholder tag (but never a real scoresheet name),
  empty input.
- `src/components/PgnImportModal.jsx`: paste or upload a .pgn (5 MB cap) → preview with a player
  picker per side, pre-filled only where `matchPlayer()` is confident → Import. Games that fail to
  parse are listed by game number and move, and the rest still import.
- `gamesStore.recordImportedGames()` waits for the insert (so queueing afterwards actually finds
  the row), never overwrites an existing game, and takes the games back out of the local view if
  the save fails. Each imported game is then queued with `enqueueGameRow()`.
- Verified in the backend-free local preview with headless Chromium: 3-game paste → 2 ready,
  1 illegal (`game 3: illegal move 2. Qh8`); the same-player check fired; picking a date and players
  imported 2 games; re-importing the same text returned both as already archived. Checked at 1280px
  and 375px. **Not exercised against the live database.**
- After: `npm test` 435 pass / 0 fail (255 under `node --test`), `test:engine` 15/15, build ✓.
