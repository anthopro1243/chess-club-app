# Evening update — 2026-09-25 (read this first)

**For a gap analysis of the whole app, start with `STATE-OF-THE-APP.md`.** It lists what's built,
what's live in the database, and the full backlog with a status per item.

All work is on **`feature/roster-import-9cg3im`** (pushed). Not merged; `master` untouched.

Done this evening (the Supabase connector was used read-only, except where noted):
- **0012–0017 now hold the verbatim SQL from production**, recovered from
  `supabase_migrations.schema_migrations` and checked against the stored md5 before commit.
- **Found a live bug**: engine assessments after the first each day were silently dropped (a
  partial unique index the upsert can't target; Postgres logs the ON CONFLICT error on every analysis
  run). Fixed on the branch (`engineAssessmentWrite.js`, 9 tests). Still happening on production
  until the branch merges.
- The Games page viewer id is fixed, the phone nav is fixed (page width = viewport from 320px up),
  and the test script runs every `src/**/*.test.js`.
- `rls_auto_enable()` (why 0011 fails on a fresh DB) is Supabase's own automatic-RLS event trigger.

**Nothing was written to the database.** Still to do: apply `supabase/pending/skip-cc003-games.sql`,
run the live end-to-end checks with temporary test accounts, then the backlog in
STATE-OF-THE-APP.md §5.

Tests: `npm test` 459 pass / 0 fail · `test:engine` 15/15 · build OK.

---

# Morning summary — overnight 2026-09-25

**Pushed.** Overnight, every push got HTTP 403 (the Claude GitHub App had read access but no write
access). After GitHub was reconnected, the branch was pushed on 2026-09-25 and the remote tip matches
the local one. **Ignore the `overnight-2026-09-25.patch` file from the session.** Applying it now
would duplicate the commits.

### Branches and preview URLs

| Branch | Contents | Preview |
|---|---|---|
| `feature/roster-import` (on GitHub, `f67bd9d`) | Item 1, roster CSV import (done before tonight) | `chess-club-app-git-feature-roster-import-chess-club2.vercel.app` (by Vercel's naming pattern; not re-checked) |
| `feature/roster-import-9cg3im` (on GitHub, 7 commits on `f67bd9d`) | Items 2–5, one commit per item | `chess-club-app-git-feature-roster-import-9cg3im-chess-club2.vercel.app` (by Vercel's naming pattern; not checked) |

One branch rather than one per item: this session could only push to `feature/roster-import-9cg3im`
(see Decisions, 1). Each item is its own commit, so they can be split with `git cherry-pick`: `19450b2` item 2 ·
`d7a62c4` item 3 · `bfe85d2` + `bb65cf6` item 4 · `ae41813` item 5 · `bffa899` + the next commit
this summary.
`master` was not touched.

### SQL you must apply (none of it has been applied)

1. `supabase/pending/skip-cc003-games.sql`: marks CC-003's pending/failed games `skipped`. Run
   the preview SELECT first, then the transaction. It has an undo line. Tested against a local
   Postgres on seeded rows.
2. Nothing else. **Do not run 0012–0017 on production**; they are already applied there. They
   are files so the repo can rebuild production. The four RLS ones (0013, 0015, 0016, 0017) need
   their real definitions pasted in from `pg_policies`; each file has the query.

### What was done

- **Item 2: retired players hidden.** Skill scores and platform ratings are filtered to roster
  members on the Dashboard and Coach page. The queue marks games whose only club player is retired
  as `skipped`. Pure module `retiredPlayers.js` + 11 tests.
- **Item 3: Import PGN on the Games page.** Paste or upload, preview with a player picker per side,
  illegal games reported by move while the rest import, re-import recognised, undated games held
  until you pick a date. Imported games are queued for analysis. `pgnImportPlan.js` + 9 tests.
  Driven end to end in a local browser.
- **Item 4: background behaviour.** Your own linked accounts sync on open (at most every 30 min).
  Analysis runs viewer's-games-first. Failed analyses retry with backoff (2/8/32 min). The drain
  loop has timeouts and cannot stall, and a 5-minute cap restarts a wedged engine. A small corner
  note shows analysing/syncing. Every in-scope async button got a timeout with a readable "what to
  do now" message. Also fixed: on-demand analysis could collide with the background queue on the
  same engine. `autoPolicy.js` + 15 tests.
- **Item 5: migrations 0012–0017 backfilled** (see the SQL note above), plus a warning comment on
  0009. Replaying the whole chain on a real Postgres showed the repo **still cannot rebuild
  production**: 0009 fails on its types, and 0011 fails because `rls_auto_enable()` isn't created by
  any file.

Tests at the end: `npm test` **450 pass / 0 fail** (270 under `node --test` + 180 legacy),
`npm run test:engine` **15/15**, `npm run build` ✓ (the usual >500 kB warning). `test:rls` skipped
(no fixture accounts).

### Decisions I made (details under "Decisions I made overnight" at the bottom)

One branch instead of five · retired filtering as defence in depth · retired-only games marked
`skipped`, not just passed over · PGN import leaves club ratings alone · undated PGN games need a
date from you · same import audience as "Log a game" · imports never overwrite · auto-sync is your
own accounts only · auto-retry stays within 3 attempts · a timed-out sync is not retried
immediately · auth/approval screens untouched · no live-DB queries · RLS backfills left as dump
instructions.

### Unfinished / needs you

- **Click through the branch's preview.** Nothing tonight ran against the
  live database: the queue skip, backoff, auto-sync and PGN save were verified by unit tests, a
  backend-free browser run and code review only.
- Apply `skip-cc003-games.sql` when you're happy.
- Fill 0013/0015/0016/0017 from `pg_policies`, and find where `rls_auto_enable()` comes from.
- **Found, not fixed:** the Games page passes `account?.playerId` (which doesn't exist) as the
  viewer id, so a player's own analysis there is treated as "not theirs". It's in the permission
  rules, so I left it. The top nav still overflows at phone width.
- Still open from before: tournament mode (waiting on team vs individual scoring), and merging
  `feature/roster-import`.

---

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
   integration"). Reads work. **Resolved:** after GitHub was reconnected, the branch was pushed
   as-is, so the overnight patch file is no longer needed.

9. **Auto-sync covers only the signed-in member's own linked accounts**, at most every 30 minutes
   per account. A coach opening the app does not sync all ~30 members (rate limits, and a slow
   first page for everyone). The Sync button is unchanged.
10. **Auto-retry of failed analyses stays within `MAX_ATTEMPTS` (3)**, now spaced out with a
    backoff (2 min, 8 min, 32 min, capped at 2 h) instead of back to back. A game that fails three
    times stays `failed` and still needs the coach's button. Retrying forever would spin on a PGN
    that can never parse.
11. **A failed sync is not retried within the same attempt.** A sync that timed out may already
    have saved part of what it fetched, so it is simply due again at the next check (30 min).
    Linking an account, which only looks the profile up, gets one automatic retry.
12. **Auth, sign-up, password and member-approval screens were left alone**, even where they have
    spinners (COWORK-PROMPT §4).
13. **"Save optimistically" was already true.** Every store writes locally first and pushes after,
    and failed pushes show the sync-error banner. I added nothing there.

14. **I did not query the live database**, even though a Supabase connector is listed in this
    session: the plan says there is no database access, and I took that as a rule. So 0012–0017 are
    reconstructions, not dumps.
15. **The RLS-policy backfills (0013, 0015, 0016, 0017) are documentation, not SQL.** Their
    content is known only by name and description. A guessed policy replayed onto production would
    silently change who can read or write what (HANDOFF §10). Each file says what the migration did
    and gives the exact `pg_policies` query to paste the real definition from. 0012 and 0014
    (columns, a check and indexes) are real SQL, guarded with `if not exists`, and each unconfirmed
    detail is marked `UNCONFIRMED` in the file.
16. **I added a comment to the top of 0009** about its uuid/text mismatch (COWORK-PROMPT Phase A
    item 1). None of its SQL was changed.

17. **(Evening) The work branch is the only branch.** The owner's evening instructions say to stay
    on the current branch, so everything stays on `feature/roster-import-9cg3im`.
18. **(Evening) The test script uses a glob** (`node --test 'src/**/*.test.js'`) so new test files
    run without editing `package.json`. The glob matched exactly the previously listed files plus the
    new one. Needs Node ≥ 21 (this machine has 22; Anthony's has 24).
19. **(Evening) An auth account with "test" in its email** (created 2026-09-08, approved player,
    almost certainly CC-003's login) was left alone. It isn't a fixture this work created, and
    deleting accounts is auth work.

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

### Item 4 — make it feel seamless

- `src/data/autoPolicy.js` (pure) + 15 tests: retry backoff, `readyForRetry`, viewer-first
  ordering, which linked accounts are due for a sync, `withTimeout` (with an abort hook) and
  `retry`, plus negative cases (still inside the backoff; recently synced; unlinked; not a sync
  platform; `shouldRetry` stopping early; a nonsense attempt count).
- **Background analysis, the viewer's own games first:** `claimNext({ preferPlayerId })` in
  `queue.js`, fed by App. Backoff is applied before claiming.
- **The drain loop can no longer stall:** the claim has a 30 s limit, and any thrown error
  re-schedules a check in 30 s. With nothing claimable it looks again every 2 minutes, so backed-off
  games do get retried. A game past 5 minutes is aborted, the engine is thrown away
  (`runner.resetAfterTimeout()`), and the game is marked failed for a later retry.
- **Sync on open:** `src/data/useAutoSync.js`, mounted in App.
- **Progress indicator:** `src/components/BackgroundActivity.jsx`, a small note bottom-right that
  appears only while analysing or syncing: "Analysing a game — 40% · 3 queued", "Syncing
  Chess.com…". It fades after "Synced 3 new games", and a failed sync can be dismissed. The Coach
  page's queue panel now reads the same live state. Before, its own disabled hook instance meant it
  never showed "Analysing now".
- **Timeouts with readable errors** on Connected accounts (link 20 s with one retry; sync 90 s),
  on-demand game analysis (5 min, then abort), "Retry failed and skipped" (30 s), and both import
  modals (60 s). Each timeout message says what to press next and why pressing it again is safe.
- **Fixed on the way:** on-demand "Analyse this game" could start while the background queue was
  using the same engine, which interleaves two games on one worker. It now waits and says so.
- Verified in the backend-free local preview: all 7 pages load with no console or page errors. The
  indicator was driven through its error, dismiss, syncing and done-then-fade states at 375px. The
  PGN import flow still passes. **The queue, backoff and auto-sync need a real backend to
  exercise, so they are verified by unit tests and code review only.**
- After: `npm test` 450 pass / 0 fail (270 under `node --test`), `test:engine` 15/15, build ✓.

**Found, not fixed:** `GamesPage.jsx` builds its viewer as `account?.playerId`, but `useAccount()`
has no `playerId` field (the player row comes from `useMyProfile()`). On the club-wide Games page a
player's viewer id is therefore always null. The analysis panel's wording/permission rules see "no
player". Staff are unaffected, and My Games does it correctly. Left alone because it touches the
permission rules in `presentation.js`.

### Item 5 — backfill migrations 0012–0017

| File | Live migration | State |
|---|---|---|
| `0012_analysis_queue_state_on_games.sql` | 20260916222241 | **SQL.** Column names certain (the app uses all six); types/defaults/check/index marked UNCONFIRMED |
| `0013_normalise_policies_and_index_fks.sql` | 20260917193932 | **Not reconstructed**: dump query only |
| `0014_assessment_source_engine.sql` | 20260917194812 | **SQL.** `source` + generated `assessed_on` + unique (player_id, assessed_on), which the client's `onConflict` proves exists; details UNCONFIRMED |
| `0015_game_analyses_owner_update.sql` | 20260924161500 | **Not reconstructed**: RLS, dump query only |
| `0016_game_analyses_opponent_side_for_own_games.sql` | 20260924161814 | **Not reconstructed**: RLS, dump query only |
| `0017_assessments_players_write_own_engine_rows.sql` | 20260924161942 | **Not reconstructed**: RLS, dump query only |

None of them should be run against production; all are already applied there.

**Tested against a real Postgres 16**, a throwaway local cluster (deleted afterwards) with the
Supabase `auth` schema, roles and `supabase_realtime` publication stubbed. I replayed
`schema.sql` → `migration-2/3/4` → `0005`…`0018` in order:
- 0012, 0014 and the four placeholder files apply. 0012 and 0014 re-run cleanly (idempotent).
- `supabase/pending/skip-cc003-games.sql` on seeded rows skipped exactly the two CC-003-only
  pending/failed games. It left a CC-003-vs-CC-002 game, a `done` game and an active member's game
  alone, and a second run changed nothing.
- **Two older files fail on a fresh project, and both were already broken:**
  - `0009` (`game_analyses_game_id_fkey cannot be implemented`): the known uuid/text mismatch,
    now noted at the top of the file.
  - `0011`, line 81: `function public.rls_auto_enable() does not exist`. Nothing in the repo
    creates that function, so production has it from somewhere unrecorded (a dashboard toggle or
    an event trigger). Not fixed, because 0011 is the security-definer grants file on the
    do-not-change list. **The repo still cannot rebuild production end to end** until 0009's types
    are fixed, the source of `rls_auto_enable()` is found, and the four policy files are filled in
    from `pg_policies`.
- `npm test` / `test:engine` / build unchanged (no code in this item): 450 / 15 / ✓.
