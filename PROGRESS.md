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
- [ ] **CSV intake**
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
- [ ] **Step 3 — `buildPlyRecords()`**
- [ ] **Step 4 — `analyzeGame.js` end to end, Gate 4**
- [ ] **Step 5 — `motifs.js` v1** (hangingPiece, fork, backRank)
- [ ] **Step 6 — player view, then coach view**
- [ ] **Step 7 — the loop** (own-blunder puzzles, Training pre-filter,
      suggested rubric scores)

### Blocked

- **Gate 5 (permissions)** needs two real signed-in accounts. Claude cannot
  create accounts or enter passwords, so this one cannot be run here and is
  left for you. Everything it would check is RLS policy already shipped in
  `0009_game_analysis.sql`.

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
