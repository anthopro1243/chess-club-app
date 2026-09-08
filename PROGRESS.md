# Buildout progress

Ledger for the gap-audit backlog. **On a new session, read this first and
continue from the first unchecked item.**

Status key: `[x]` done · `[~]` partly done, see note · `[ ]` not started ·
`[-]` deliberately deferred, reason given.

---

## Phase 0 — Stop losing data and close the front door

Reordered by dependency, not by the audit's listing order: ground rule 5 says
policies ship with every table, so the role helpers those policies call have
to exist before any new table does.

- [x] **Role and access foundation** — `0005_roles_and_access.sql`. Adds
      `profiles` (role + approval status), the `is_coach` / `is_approved` /
      `owns_player` helpers policies call, invite codes with a redeem
      function, and replaces the old `using (true)` policies on `players` and
      `games`. Migration written; **not yet run** (anon key only here).
- [x] **Puzzle attempt logging** — `0006_puzzle_attempts.sql`,
      `src/data/puzzleAttemptsStore.js`, wired into `TrainingPage`. One row per
      attempt including failures, with themes, difficulty, rating, hint and
      solution flags, and seconds taken. Verified end to end in the browser: a
      failed then successful attempt on the same puzzle produced two rows and
      "2 attempts · 50% right". Training page now shows accuracy and the three
      weakest themes, measured rather than guessed.
- [x] **Coach notes in a coach-only table** — schema half in 0005: backfilled
      into `coach_notes`, then blanked in `players` so nothing is lost and
      nothing stays exposed. Client still to switch over.
- [ ] Split the player row (assessments, attendance, ratings, goals)
- [ ] Invite-only signup with coach approval — SQL done, client UI pending
- [ ] Real roles enforced in the database — SQL done, client UI pending
- [ ] Parent consent record
- [ ] Coach-issued password reset
- [ ] Backups and soft deletes

## Phase 1 — Make it a competition program

- [ ] Chess clock and time controls
- [ ] Internal Elo (largely already built — see Decisions)
- [ ] Tournaments: pairings, standings, tiebreaks
- [ ] Board order / lineup
- [ ] Resign, draw offer, manual result entry
- [ ] Homework
- [ ] Session planner
- [ ] CSV intake
- [ ] Player personal dashboard
- [ ] Board accessibility (keyboard, SAN entry, screen reader)
- [ ] Colorblind-safe highlights
- [ ] RLS and auth test suite

## Phase 2 — Turn the data into teaching

**Gated by the audit itself:** "Do not start this phase until there are several
weeks of real Phase 0/1 data." Attempt logging has to be collecting first or
the adaptive/rubric features have nothing to be personal about.

- [ ] Automatic game analysis
- [ ] Analysis review UI
- [ ] Close the loop onto the rubric
- [ ] Spaced repetition
- [ ] Adaptive difficulty
- [ ] Opening repertoire per player
- [ ] Endgame drills
- [ ] Position-aware tutor
- [ ] Monthly parent progress report
- [ ] Opponent and event scouting
- [ ] Per-player data export and delete

## Phase 3 — Polish and habit

- [ ] Installable PWA with offline puzzles
- [ ] Move sounds, off by default
- [ ] Offline-tolerant writes
- [ ] Online play between clubmates
- [ ] Effort-based leaderboards
- [ ] Streaks and milestones
- [ ] Calendar, announcements, reminders
- [ ] Full export and matching import
- [ ] First-run walkthrough + `docs/HANDOVER.md`

---

## Decisions

Choices made without asking, so they can be reversed knowingly.

- **Migrations are written, not run.** Only the anon key exists in this
  environment, which cannot execute DDL. Every schema change ships as a numbered
  file in `supabase/migrations/` for the coach to run. See "What you need to do".
- **Internal Elo already exists.** The audit lists it as missing, but Glicko-2
  shipped in an earlier session (`src/data/glicko2.js`, verified against
  Glickman's paper) and already updates from games, puzzles, and imported
  Chess.com/Lichess games. Treated as done; the Phase 1 item is narrowed to
  moving the value into the new `ratings` table.
- **Coach-issued password reset goes to the guardian email**, not through the
  Supabase admin API. The admin API needs the service-role key, which cannot be
  in client code (ground rule 6) and would need a server function. Since Phase 0
  captures a guardian email anyway, sending the reset there solves the real
  problem — kids without inboxes — with no new infrastructure.
- **Migration numbering restarts in `supabase/migrations/`.** The four existing
  files stay where they are as history; new ones follow the prompt's convention.

## Open questions

Asked once, at the end, so the build was not blocked on answers. Sensible
defaults are in place for all of them.

1. **Anyone under 13?** Changes consent from "recommended" to COPPA-required.
   Default assumed: yes, treat every member as requiring guardian consent.
2. **Staging Supabase project?** Default assumed: none yet. Setup steps are in
   `docs/RUNBOOK.md`.
3. **Default time controls?** Default assumed: G/30;d5, G/60;d5, 5+3, 10+0,
   plus custom.
4. **Run migrations against live, or hand you SQL?** Cannot run them from here
   regardless; assumed you run them.

## What you need to do

Running list. Nothing here can be done from this environment.

### Carried over from the previous session (still outstanding)

1. **Run `supabase/migration-4-linked-accounts.sql`** in the Supabase SQL
   editor. Adds `connections` and `imported_game_ids` to `players`. **Must run
   before the linked-accounts commit is deployed** — without it every write to
   a player row fails, not just the new feature.
2. **Sign in on the dev server** so the Connected accounts modal can be checked
   end to end. It only renders for a signed-in profile, and accounts cannot be
   created from this environment.
