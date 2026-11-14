# State of the app: what exists, what's live, and what's missing

Written 2026-09-25 (evening) as the single entry point for a gap analysis of this folder.
Everything here was checked against the code on branch `feature/roster-import-9cg3im` and, where it
says so, against the live Supabase database (read through the connector the same evening).
Detail lives in `HANDOFF.md` (the technical source of truth) and `PROGRESS.md` (the running log).

---

## 1. Using this folder for a gap analysis (Cowork)

**Check out the right branch first.** `master` (what the live site serves) is behind. All current
work is on `feature/roster-import-9cg3im`:

```bash
cd ~/Projects/chess-club-app
git fetch origin
git checkout feature/roster-import-9cg3im
git pull
```

Read in this order: this file → `COWORK-PROMPT.md` (goals, club context, scope rules, the phased
plan) → `HANDOFF.md` (stack, file map, database, features, tests, bugs, do-not-change list) →
`docs/ANALYZER-SPEC.md` (before judging anything in `src/analysis/`) → `PROGRESS.md`.

A prompt that works for the analysis:

> Read STATE-OF-THE-APP.md, COWORK-PROMPT.md and HANDOFF.md in this folder, then the code under
> src/ and supabase/. The app is a coaching tool for a ~30-member high school chess club preparing
> for a tournament on Oct 24, 2026. List everything the app is missing or does badly, compared with
> what a coach and players need, and with Lichess, Chess.com, ChessKid and Chessable where
> relevant. For each gap: what it is, who it affects, evidence from the code (file and line), how
> big it is, and whether it blocks the tournament. Treat §5 of STATE-OF-THE-APP.md as the known
> backlog: confirm or correct it, then add what it misses. Respect the out-of-scope list in §7.

---

## 2. Where things stand

| | |
|---|---|
| Live site | https://chess-club-app-seven.vercel.app, built from `master` (`286f7e6`) |
| Work branch | `feature/roster-import-9cg3im`, pushed; includes all of `feature/roster-import` |
| Preview of the work branch | Vercel builds one per push, behind Vercel login. The branch alias follows `chess-club-app-git-feature-roster-import-9cg3im-chess-club2.vercel.app` |
| Database | Supabase `rftlozmdyetubhjcutht` (Postgres 17). Shared by production and every preview |
| Tests | `npm test` 459 pass / 0 fail · `npm run test:engine` 15/15 · `npm run build` OK |

**The database is ahead of `master`.** Migration 0018 (roster import) is applied, and CC-003 is
soft-deleted. Production's build doesn't hide deleted players, so CC-003 still shows on the live
site until the branch merges.

---

## 3. What is built

By page (full detail in HANDOFF.md §6):

- **Club (home):** leaderboard with a documented sort key (coach override → USCF → platform
  rating, each shown with its source); club skill profile; the three weakest categories.
- **Play:** rules engine, Stockfish opponent at a chosen Elo, tournament clock (delay vs
  increment), `[%clk]` in the PGN, resign/draw, auto-archive.
- **Training:** 402 tagged Lichess puzzles with theme filters and deep links; "Your mistakes" mode
  built from the player's own blunders with spaced repetition; per-attempt logging.
- **Games:** archive, GameReview (board, moves, eval, turning points), analysis panel, log a game
  by hand, **Import PGN** (paste/upload, player picker per side, preview, queued for analysis).
- **My games:** a player's own games and analysis only.
- **Roster:** players, 8-category rubric, goals, coach notes, linked accounts, engine-suggested
  scores (click to adopt, never automatic), **Import CSV** from the Google Form (preview first,
  CC-### ids in signup order, dedupe by student ID → email → name), soft delete.
- **Coach:** analysis queue panel, member approval, attendance by date, Excel export, assessments
  pre-filled from engine scores.
- **In the background:** the analysis queue drains while a tab is open (the viewer's own games
  first, with retry backoff and timeouts). Your own linked Chess.com/Lichess accounts sync on open.
  A small corner note shows the work.

Analysis pipeline (`src/analysis/`): PGN parsing, ply records, accuracy/ACPL, move
classification, 8 rubric scores with shrinkage and trend, SEE, sacrifice detection, 3 of 8 blunder
motifs, improvement plan, own-game puzzles, recalibration report.

---

## 4. The database: live vs pending

**Every migration in `supabase/migrations/` (0005–0018) is applied to production**, and every
applied migration has a file. 0012–0017 are the verbatim SQL recovered from production.

Live counts (2026-09-25 evening):

| | |
|---|---|
| Players | **1 active** (CC-002, the coach), 1 retired (CC-003, test data) |
| Games | 153 (103 Chess.com, 50 Lichess), all from the coach's and CC-003's accounts |
| Analysis queue | done 114 · pending 25 · **failed 13** · running 1 |
| Analyses / own-game puzzles | 228 / 76 |
| Assessments | 3 (all engine-written) |
| Attendance / puzzle attempts | **0 / 0** |
| Student records (`player_private`) | 0, because nobody has been imported yet |

**Written, not applied:** `supabase/pending/skip-cc003-games.sql` marks CC-003's pending/failed
games `skipped`, which clears the 13 stale failures. It was tested on a local Postgres; the file has
an undo line.

---

## 5. What's missing: the known backlog

Status: ✅ done · 🟡 partly done / built but unverified · ❌ not started · ⏸ waiting on a decision ·
🚫 out of scope.

### Before the Oct 24 tournament

| # | Item | Status | Notes |
|---|---|---|---|
| A1 | Migration files match production | ✅ | 0012–0017 verbatim. A fresh rebuild still needs 0009's types fixed and Supabase's auto-RLS setting on (HANDOFF §5) |
| A2 | Clear the 13 stale failed analyses | 🟡 | SQL written, not applied |
| A3 | Bulk roster import | 🟡 | Built and tested (39 tests + a browser run without a backend). **Never run against the live database.** The Google Form itself doesn't exist yet |
| A4 | PGN import on the Games page | 🟡 | Built and tested (9 tests + a browser run without a backend). **Never saved to the live database** |
| A5 | Tournament mode (individual Swiss): pairings, colours, no repeats, byes, Buchholz / Median-Buchholz / Sonneborn-Berger, tables, UI | ❌ | Individual scoring approved 2026-09-25. **Team scoring ⏸** |
| A6 | Board order / team selection | ⏸ | Only needed if the event is team-scored |
| — | Retired players hidden everywhere | 🟡 | Done in code; live check pending |
| — | Everything on the branch verified against the live database, then merged | ❌ | Nothing from the overnight or evening work has run against production data yet |

### After the tournament (Phase B)

| # | Item | Status | Notes |
|---|---|---|---|
| B7 | Player personal dashboard: one priority, trend, reviews due, homework, recent games | ❌ | Follow `presentation.js`: trend before level; no low-confidence numbers |
| B8 | Homework: coach assigns a theme or puzzle set with a due date; completion from `puzzle_attempts` | ❌ | Needs a table + RLS |
| B9 | Session planner: weakest club categories → a Tuesday lesson with puzzles | ❌ | |
| B10 | Recurring Tuesday sessions created automatically for attendance | ❌ | Attendance table has 0 rows |
| B11 | Repertoire UI for `src/analysis/repertoire.js` | ❌ | The module is finished (16 tests); nothing renders it |
| — | "Explain the mistake" in plain English for each critical moment, built from data already there (best line, eval swing, motifs, SEE) | ❌ | Requested 2026-09-25; no paid API |
| — | Seamless pass over every page: timeouts on every spinner; loading, empty and error states; no dead buttons; phone layout | 🟡 | Background work, import modals, sync and analysis buttons done; the phone nav is fixed. A page-by-page audit hasn't been done |

### Later (Phase C)

| # | Item | Status | Notes |
|---|---|---|---|
| C12 | Remaining motifs: pin, skewer, discoveredAttack, trappedPiece, deflection | ❌ | 3 of 8 exist. Each needs a known-position test and a negative case |
| C13 | Opening book for `inBook` | ❌ | Fallback is "first 8 plies" |
| C14 | Board accessibility: arrow keys, typed SAN, announced moves | ❌ | GameReview has arrow keys; Play and Training don't |
| C15 | Monthly parent progress report | ❌ | |
| C16 | Recalibrate scoring anchors | ⏸ | Wait for more real players (`docs/RECALIBRATION-2026-09.md`) |

### Older audit items (PROGRESS.md)

| Item | Status | Notes |
|---|---|---|
| Split the player row: stores read the new tables instead of JSON blobs | 🟡 | Tables exist and are backfilled; the client still reads and writes the blobs, so the lost-update problem remains |
| Phase 2 "turn the data into teaching" (adaptive difficulty, tutor) | ⏸ | Deliberately deferred until weeks of real attempt data exist (there are 0 attempts) |
| Phase 3 polish | ❌ | |

### Technical debt

- `src/data/lichessSync.js`: dead code, superseded by `externalSync.js`. Delete or wire it (⏸).
- `RATING_OFFSETS` in `externalSync.js` contradicts the no-conversion doctrine in `ratings.js` (⏸).
- `players.club_rating` is still computed and known to be wrong (one Glicko pool across all time
  controls); nothing displays it.
- No component tests at all; the UI is verified by hand. `npm run test:rls` only runs with fixture
  accounts, and doesn't cover `player_private`.
- Analysis needs an open browser tab (the WASM engine is too heavy for Edge Functions). By design,
  but it means a backlog only drains while someone has the app open.
- The JS bundle is >500 kB (the xlsx library); there's no code splitting.

### Data gaps (not code, but they limit everything above)

- One real member. Leaderboards, club averages and recalibration mean little until the roster
  import is used.
- No attendance and no puzzle attempts recorded yet.

---

## 6. Known bugs and unverified behaviour

- **Live on production until the branch merges:** engine assessments after the first each day are
  silently dropped, and Postgres logs an ON CONFLICT error on every analysis run. Fixed on the
  branch (HANDOFF §9 item 15).
- **Live on production until the branch merges:** CC-003 still shows on the live site.
- **Built but never run against the live database:** roster CSV import, PGN import save, the
  queue's skip of retired-only games, retry backoff, auto-sync of linked accounts.
- **Needs a real, visible tab to verify:** the background queue (headless browsers report
  `document.hidden = true`, so it parks).

---

## 7. Rules that bound any fix

- **Out of scope by the owner's decision:** security, auth, passwords, sign-up, email
  confirmation, invites, consent records, permissions as features (COWORK-PROMPT §4). A new table
  still gets RLS copied from the `is_coach()` / `is_approved()` / `owns_player()` pattern.
- **Do not change:** `src/engine/chess.js`, `src/analysis/scoring.js`, the existing RLS policies,
  the five `SECURITY DEFINER` helper grants, the "engine never overwrites a coach" rule, and
  `isSupabaseConfigured` being a boolean (HANDOFF §10).
- **No new dependencies** without a strong reason: no router, test framework, state library, CSS
  framework or chess library, on purpose.
- **Every push to `master` deploys to production.** Work on a branch and merge only on the owner's
  say-so.

---

## 8. Decisions waiting on the owner

1. Merge `feature/roster-import-9cg3im` after checking the preview?
2. Team scoring for the DISD event, and its time control (individual Swiss is approved).
3. Were the flat 5s in the rubric a real judgement or a blank form? (The app assumes blank.)
4. Keep or drop `RATING_OFFSETS`; delete `lichessSync.js`?
5. US Chess rating vs ID on the signup form.
6. Apply the recalibration anchors now or wait? (Recommendation on file: wait.)
