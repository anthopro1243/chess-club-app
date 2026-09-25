# HANDOFF — chess-club-app

Written 2026-09-17 by inspecting the repo and the live database directly, not from memory.
Updated 2026-09-25 (bulk roster import session): §5–§9 and §12.
Every command output quoted below was actually run. Where I am unsure, it says so.

---

## 1. OVERVIEW

A coaching app for a scholastic chess club. One coach (Anthony, the repo owner) runs a club of
roughly 10–20 players with a wide rating spread (~600–1600). The app exists to make coaching
decisions from data rather than from memory: it plays games, imports games from Chess.com and
Lichess, analyses them with Stockfish, and turns the results into per-player skill scores, drills,
and a club-wide picture of what to teach next.

- **Live URL:** https://chess-club-app-seven.vercel.app
- **Repo:** https://github.com/anthopro1243/chess-club-app (branch `master`)
- **Supabase project ref:** `rftlozmdyetubhjcutht` (region us-east-2, Postgres 17)
- **Vercel project:** `chess-club-app`, id `prj_fnKsBXwNiYl6jPhuatH7TkNds1sP`,
  team `team_mB05AuCwzh73nrBCQtqFPsl2` (slug `chess-club2`)

### Stack (exact versions from `package.json`)

| | |
|---|---|
| React | `^18.3.1` (+ `react-dom` `^18.3.1`) |
| Vite | `^5.4.11`, with `@vitejs/plugin-react` `^4.3.4` |
| Supabase JS | `@supabase/supabase-js` `^2.116.0` |
| xlsx | `^0.18.5` (Excel export only) |
| Module system | ESM — `"type": "module"` |

There is **no router package, no test framework, no state library, no CSS framework**. Routing is
hash-based in `src/App.jsx`; tests are `node --test` plus four hand-rolled runners; state is a
~40-line store in `src/data/store.js`; styling is one plain CSS file. **This minimal-dependency
posture is deliberate — see section 10.**

The chess rules engine (`src/engine/chess.js`) is hand-written and dependency-free. Stockfish 18
lite runs as WASM in a Web Worker from `public/stockfish/`.

---

## 2. HOW TO RUN IT

**Node v24.21.0, npm 11.19.0** (what is installed on this machine and what everything was verified
against). Node is installed via nvm at `~/.nvm`; there are also symlinks in `~/.local/bin` so
`node`/`npm` resolve for processes that do not source `.bashrc`.

```bash
npm install         # install dependencies
npm run dev         # Vite dev server on http://localhost:5173 (opens a browser)
npm run build       # production build into dist/
npm run preview     # serve the built dist/
npm test            # the fast suite — no engine, no network
npm run test:engine # the two Stockfish-backed suites (slower, ~6s)
npm run test:all    # both of the above
npm run test:rls    # permission tests; SKIPS unless four env vars are set
```

### Environment variables — names and purpose only

Live values are in `.env.local`, which is gitignored. `.env.example` documents the shape.

| Name | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project REST/Auth endpoint. Read by `src/data/supabaseClient.js`. |
| `VITE_SUPABASE_ANON_KEY` | Supabase publishable anon key. Public by design — it ships in the browser bundle, and RLS is what actually protects data. |
| `RLS_COACH_EMAIL` / `RLS_COACH_PASSWORD` | A coach/admin account, used only by `npm run test:rls`. |
| `RLS_PLAYER_EMAIL` / `RLS_PLAYER_PASSWORD` | An approved player account owning a player row, used only by `npm run test:rls`. |

If the two `VITE_` vars are unset the app runs entirely on browser-local storage with no backend.
That fallback path still exists but is barely exercised now that the app is gated behind sign-in.

---

## 3. FILE MAP

```
chess-club-app/
├── index.html                      Vite entry point
├── vite.config.js                  base:'./', outDir dist, dev port 5173, manualChunks disabled
├── package.json                    scripts + the four runtime deps
├── .env.example                    documents the two VITE_ vars (no secrets)
├── .env.local                      real values — GITIGNORED
├── .claude/launch.json             dev-server config for the Claude Code browser pane
│
├── src/
│   ├── main.jsx                    React root
│   ├── App.jsx                     hash router, nav, AccessGate, mounts useAnalysisQueue
│   │
│   ├── engine/
│   │   ├── chess.js                hand-written rules engine: move gen, SAN, FEN, PGN EXPORT.
│   │   │                           0x88 board, a8=0, a1=112. DO NOT EDIT (see §10).
│   │   ├── chess.test.mjs          93 assertions incl. perft
│   │   ├── stockfishClient.js      UCI wrapper. createEngine({transport}), bestMove(), evaluate(), parseInfo()
│   │   ├── stockfishClient.test.mjs Gate 1 — the sign-convention tests
│   │   └── nodeTransport.js        TEST/TOOLING ONLY. Runs the same WASM build under Node via a CJS shim.
│   │
│   ├── analysis/                   all pure logic, no React
│   │   ├── scoring.js              ALL the maths: win%, accuracy, classification, the 8 rubric
│   │   │                           scores, shrinkage, EWMA tracking, improvementPlan,
│   │   │                           recalibrationReport. TREAT AS FIXED (see §10).
│   │   ├── pgn.js                  PGN importer: parsePgn(), parseAndValidate()
│   │   ├── buildPlyRecords.js      replay + evaluate → the PlyRecord[] scoring.js consumes
│   │   ├── analyzeGame.js          orchestrator; produces rows shaped for game_analyses
│   │   ├── runner.js               browser-side driver; saves analysis, puzzles, scores, assessments
│   │   ├── queue.js                DB-backed analysis queue (claim/markDone/markFailed/enqueueAll)
│   │   ├── useAnalysisQueue.js     React hook that drains the queue while the tab is visible
│   │   ├── see.js                  static exchange evaluation
│   │   ├── motifs.js               blunder motifs — ONLY 3 of 8 implemented (see §11)
│   │   ├── sacrifice.js            stops a sound sac scoring like a blunder
│   │   ├── spacedRepetition.js     SM-2-ish scheduler: 2 days → a week → a month
│   │   ├── ratings.js              cross-platform rating doctrine — READ ITS HEADER (see §10)
│   │   ├── skillModel.js           reconciles manual rubric vs engine scores
│   │   ├── presentation.js         permission + wording rules (who sees what, how it is worded)
│   │   └── repertoire.js           opening repertoire report — WRITTEN BUT NOT WIRED
│   │
│   ├── data/                       stores; all follow the same five-part shape (see §10)
│   │   ├── store.js                ~40-line createStore/useStore over useSyncExternalStore
│   │   ├── supabaseClient.js       exports `supabase` and `isSupabaseConfigured` (a BOOLEAN, not a function)
│   │   ├── auth.js                 sign up / in / out, password reset & change. No magic link.
│   │   ├── accountStore.js         profiles: role, status, members, invites
│   │   ├── rosterStore.js          players table + the legacy JSON blobs
│   │   ├── gamesStore.js           the game archive
│   │   ├── analysisStore.js        game_analyses + player_skill_scores/history
│   │   ├── assessmentStore.js      dated assessments, coach or engine sourced
│   │   ├── ownPuzzleStore.js       own-game puzzles + review scheduling
│   │   ├── ratingStore.js          player_platform_ratings + coach overrides
│   │   ├── coachNotesStore.js      coach-only notes
│   │   ├── puzzleAttemptsStore.js  one row per puzzle attempt
│   │   ├── externalChess.js        Chess.com + Lichess API clients (fetch + normalise)
│   │   ├── externalSync.js         the sync orchestrator actually used by the UI
│   │   ├── lichessSync.js          DEAD CODE — written, tested, never imported (see §7)
│   │   ├── pgnImport.js            DEAD CODE — written, tested, never imported (see §7)
│   │   ├── glicko2.js              Glicko-2 implementation (club rating; now mostly bypassed)
│   │   ├── chessClock.js           time controls, delay vs increment, [%clk] PGN annotation
│   │   ├── puzzles.js/.json        402 tagged Lichess puzzles
│   │   ├── roster.js               RUBRIC_CATEGORIES (the 8 categories, 1–10 scale)
│   │   ├── exportWorkbook.js       Excel export
│   │   └── syncStatus.js           surfaces sync errors to the UI
│   │
│   ├── components/                 Board, MoveList, Piece, PromotionDialog, GameReview,
│   │                               GameAnalysisPanel, AnalysisQueuePanel, AccountControl,
│   │                               AccessGate, MemberApproval, ConnectionsModal, LogGameForm,
│   │                               ResetPasswordModal, InfoTooltip
│   ├── pages/                      DashboardPage, PlayPage, TrainingPage, GamesPage,
│   │                               MyGamesPage, RosterPage, CoachPage
│   └── styles/app.css              the entire stylesheet
│
├── public/stockfish/               Stockfish 18 lite WASM (7 MB .wasm + 24 KB .js) — tracked in git
├── scripts/import-puzzles.mjs      one-off tool that built puzzles.json
├── supabase/
│   ├── schema.sql                  original schema
│   ├── migration-2/-3/-4-*.sql     early migrations (pre-numbering)
│   ├── migrations/0005–0011*.sql   numbered migrations — NOTE: 0012+ are NOT here (see §5)
│   ├── rls-test.mjs                the permission suite (Gate 5), 16 assertions
│   ├── seed-rls-fixtures.sql       recreates disposable test accounts + fixture rows
│   └── cleanup-test-fixtures.sql   removes them again
└── docs/
    ├── ANALYZER-SPEC.md            the analyzer contract — read before touching src/analysis
    ├── ARCHITECTURE.md             architecture notes
    ├── RUNBOOK.md                  backup/restore procedure
    ├── SCHEMA-BEFORE.md            pre-split schema notes
    ├── RECALIBRATION-2026-09.md    percentiles from 48 real analysed sides + proposed anchors
    └── HANDOVER.md                 an OLDER handover from a previous machine move — superseded by this file
```

Root-level reports (historical, safe to read for context): `PROGRESS.md` (the running backlog
ledger), `ANALYZER-REPORT.md`, `AUDIT-RESPONSE.md`, `CLAUDE-CODE-PROMPT.md`, `README.md`,
`WINDOWS_SETUP.md`.

---

## 4. DEPLOYMENT

**Git integration, not CLI upload.** Vercel builds automatically from pushes to `master` on
`anthopro1243/chess-club-app`. There is no `.vercel/` directory locally and no Vercel CLI
installed; `npx vercel --prod` is NOT the route and has never been used successfully here.

- Framework preset: **Vite**. Build command and output (`dist`) are Vercel's Vite defaults;
  nothing custom is configured in the repo.
- Production branch: `master`. Every push deploys to production.
- The two `VITE_SUPABASE_*` variables must exist in Vercel's project env for the build.
  I did not inspect Vercel's env settings, but the live site works, so they are set.

**Current deployment:** `dpl_3pGjyWo7MZjYpX9r3vPyp563Baca`, state `READY`, built from commit
`a7e9a07` — which is the current `master` HEAD. **The live site is fully up to date.**

⚠️ **Historical gotcha:** the GitHub↔Vercel link silently broke at one point. Pushes reached GitHub
but Vercel never built, and its API reported the project as `link: null` while past deploys clearly
came from commits. It was fixed by reconnecting the repo in **Project → Settings → Git**. If a push
ever appears not to deploy, check there first.

---

## 5. DATABASE

Supabase project `rftlozmdyetubhjcutht`. RLS is on for every table and is genuinely well built —
**do not rewrite the policies** (§10).

### Tables (live, from `information_schema`)

| Table | Key columns |
|---|---|
| `players` | `player_id` **text PK** (e.g. `CC-002`), name, grade, joined, board_role, commitment, `ratings` jsonb, preferred_openings, style, `rubric` jsonb, goal, training_focus, `coach_notes` text (legacy, blanked), `puzzle_stats` jsonb, `rating_history` jsonb, `assessments` jsonb, `attendance` jsonb, `connections` jsonb, `imported_game_ids` jsonb, `user_id` uuid, `club_rating` jsonb, guardian_email, deleted_at, **`experience`** (0018, self-reported at signup) |
| `player_private` | **new in 0018.** `player_id` text PK → players, `student_id` **unique**, `school_email`, created_at, updated_at. **Coach-only RLS** (`is_coach()` for all ops). Holds the DISD student ID + school email so they never sit on `players`, which every approved member can read. |
| `games` | `id` **text PK**, played_at, white/black_player_id, white/black_name, result, reason, move_count, mode, computer_elo, pgn, deleted_at, **`analysis_status`**, analysis_attempts, analysis_error, analysis_depth, analysis_claimed_at, analysis_updated_at |
| `profiles` | `user_id` uuid PK → auth.users, `role` (player/coach/admin/parent), `status` (pending/approved/suspended), display_name, created_at, approved_at, approved_by |
| `game_analyses` | id uuid, `game_id` text, `player_id` text, side char, engine, depth, multipv, schema_version, accuracy, acpl, mean_win_loss, moves_played/counted, counts/by_phase/raw/scores/critical/motif_counts/plies jsonb, coach_note, analyzed_at |
| `player_skill_scores` | player_id, category, score, confidence, observations, games, trend, source, updated_at |
| `player_skill_history` | id, player_id, category, score, confidence, game_id, recorded_at |
| `player_puzzles` | id, player_id, game_id, fen, solution, played, san, fullmove, themes[], source, win_percent_lost, label, **due_at, interval_days, ease, reps, lapses, last_result, last_reviewed_at, retired**, created_at |
| `player_platform_ratings` | PK (player_id, platform, time_control), rating, rd, games, provisional, fetched_at |
| `player_rating_overrides` | player_id PK, club_rating, note, set_by, set_at |
| `assessments` | id, player_id, assessed_at, the 8 category ints, notes, author_id, **`source`** (coach/engine), **`assessed_on`** (generated date) |
| `attendance` | id, player_id, session_date, present, recorded_at, recorded_by |
| `coach_notes` | id, player_id, note, author_id, created_at, updated_at |
| `consent_records` | id, player_id, guardian_*, relationship, under_13, data_collected, agreed_at, method, photo_release, emergency_contact_*, withdrawn_at, recorded_by, notes |
| `goals` | id, player_id, goal, target_rating, target_date, status, set_at, met_at, notes |
| `ratings` | id, player_id, rating_type, value, rd, recorded_at, source |
| `puzzle_attempts` | id, player_id, puzzle_id, themes[], difficulty, puzzle_rating, correct, used_hint, used_solution, seconds_taken, attempted_at |
| `invite_codes` | code PK, created_by, created_at, expires_at, max_uses, uses, note |
| `invite_attempts` | id, user_id, attempted_at, succeeded — the rate-limit ledger for `redeem_invite` |

**Note the id types:** `players.player_id` and `games.id` are **text**, and everything referencing
them is text. The committed `0009_game_analysis.sql` says `uuid` and `players(id)` — that file does
**not** match what was actually applied. Production is the truth.

### Migrations — the repo and the database DISAGREE

**Every migration below has been applied.** The problem is that only some exist as files.

Files present in `supabase/migrations/`: `0005` … `0011`, then **`0018`**. The gap `0012`–`0017`
is deliberate and reserved for backfilling the six file-less migrations below (Phase A item 1).

Applied to the database (from `list_migrations`), newest last:

| Version | Name | File in repo? |
|---|---|---|
| 20260916012633 | own_game_puzzles_and_platform_ratings | ✅ `0010_*.sql` |
| 20260916221931 | harden_definer_functions_and_invites | ✅ folded into `0011_*.sql` |
| 20260916222044 | revoke_definer_functions_from_public | ✅ folded into `0011` |
| 20260916222110 | restore_execute_on_policy_helpers | ✅ folded into `0011` |
| 20260916222241 | analysis_queue_state_on_games | ❌ **NO FILE** |
| 20260917193932 | normalise_policies_and_index_fks | ❌ **NO FILE** |
| 20260917194812 | assessment_source_engine | ❌ **NO FILE** |
| 20260924161500 | game_analyses_owner_update | ❌ **NO FILE** |
| 20260924161814 | game_analyses_opponent_side_for_own_games | ❌ **NO FILE** |
| 20260924161942 | assessments_players_write_own_engine_rows | ❌ **NO FILE** |
| 2026-09-25 (applied via connector) | roster_import_private_fields_and_experience | ✅ `0018_roster_import.sql` |

⚠️ **This is the single biggest liability in the project.** Six applied migrations have no file.
Anyone replaying `supabase/migrations/` onto a fresh project gets a schema that does not match
production — missing `games.analysis_status` entirely, which breaks the whole analysis queue.
**Fixing this by dumping the live schema into numbered files `0012`–`0017` is the highest-value
first task for the next session.**

The last three (2026-09-24) were applied by a session I was not part of. From the policy state they
loosened `game_analyses` so a player can write the opponent's side of their own game, and let
players write their own engine assessments.

### Current data (live counts)

153 games (103 chesscom + 50 lichess) · 2 player rows: `CC-002` Anthony (admin, the only real
member) and `CC-003` "Magnus Carlsen" — **confirmed test data and soft-deleted on 2026-09-25**
(`deleted_at` set; its 100 games, 20 analyses, 1 puzzle and 7 skill scores are kept) ·
0 player_private rows (nobody imported yet) · 4 auth users / 4 profiles · 144 game_analyses · 69 player_puzzles ·
14 player_skill_scores · 497 player_skill_history · 2 assessments · 11 player_platform_ratings ·
0 coach_notes · 0 puzzle_attempts.

Analysis status: **done 72, pending 67, failed 13, running 1** (as of 2026-09-17; not re-checked
this session).

---

## 6. FEATURES BY PAGE

Routes are defined in `src/App.jsx` as `ROUTES`. Everything is behind `AccessGate` — signed out,
you see only "Club members only".

### Club (home) — `DashboardPage.jsx`
- ✅ **Club leaderboard.** Sorts on an explicit, documented key: coach override → USCF → the club
  basis (Chess.com rapid, configurable). Every rating shows its platform and time control.
  Ratings from other pools are listed *below* the table, never ranked against it.
- ✅ **Club skill profile.** Per-category, engine-backed, shows "—" where there is not enough data
  instead of averaging absence as zero.
- ✅ **Where group time should go** — the three weakest measured categories.
- ⚠️ Average-USCF tile reads "—" because nobody has a USCF rating.

### Play — `PlayPage.jsx` (820 lines, the biggest file)
- ✅ Drag-and-drop board, promotion dialog, legal-move highlighting, colourblind-safe cues.
- ✅ Real Stockfish opponent with a selectable Elo.
- ✅ Chess clock with tournament time controls; delay and increment are implemented as the
  different things they are; flag detection ends the game; readings are written into the PGN as
  `[%clk]`.
- ✅ Resign and draw offer; finished games auto-archive.

### Training — `TrainingPage.jsx`
- ✅ 402 tagged Lichess puzzles, theme + difficulty filters, hint and show-answer.
- ✅ **"Your mistakes" mode** — pulls the player's own blunders from `player_puzzles` where
  `due_at <= now()`, and feeds the result back into the spaced-repetition schedule (solved pushes
  it out, failed brings it back tomorrow).
- ✅ Deep-link pre-filter: `#/training?theme=backRankMate`.
- ✅ Attempts are recorded per trainee.

### Games — `GamesPage.jsx`
- ✅ Whole rows clickable (they were dead until recently).
- ✅ **GameReview** — board, full move list, per-move evaluation, clickable turning points that
  jump to the position. Arrow-key navigation.
- ✅ Analysis panel; coaches can trigger analysis on demand.
- ✅ Log a game manually (`LogGameForm`), copy/download PGN.
- ⚠️ The "Lichess" type filter now returns real rows (50 lichess games exist).

### My games — `MyGamesPage.jsx`
- ✅ A player sees **only their own** games — enforced twice (filtered by `player_id` in the page,
  and RLS refuses anything else).
- ✅ Board review oriented to the side they played; on-demand analysis of their own games.
- ✅ Surfaces how many review positions are due.

### Roster — `RosterPage.jsx`
- ✅ Player list and detail, 8-category rubric, goals, coach notes, connected accounts.
- ✅ **Import CSV** (coach only; branch `feature/roster-import`, not yet on master). Reads the
  Google Form responses export. Shows a preview first — **New / Update / Check / Error** per row
  with the reason — and writes nothing until the coach presses Import. Logic lives in the pure
  module `src/data/rosterImport.js`; UI in `src/components/RosterImportModal.jsx`; write path is
  `applyRosterImport()` in `rosterStore.js`. Details:
  - Header match ignores case, spacing and punctuation. Required columns: Full name, Student ID.
  - Student ID must be exactly 7 digits (every DISD ID is). Grade must be 9–12 if present.
  - "Do you want to compete in tournaments?": Yes → Competitive; anything else → Casual.
  - New `CC-###` ids continue from the highest id ever issued **including retired ones**, in
    Timestamp order (not file order).
  - Dedupe order: Student ID → school email → name. ID/email match = **Update** (fills gaps, never
    blanks a coach-entered field, merges connections). Name-only match = **Check**: never imported
    unless the coach ticks it, and then as a separate new member.
  - Within one file, a repeated Student ID or school email is an **Error** on the later signup.
  - Re-importing the same file is safe: everything already imported comes back as Update.
  - **US Chess ID goes to `connections.uscf.id`, NOT `ratings.uscf`** — it is a membership
    number, and `ratings.uscf` is rendered as a rating (an 8-digit id would read as one).
- ✅ Detail view shows **Experience** (everyone) and **Student ID / School email / Guardian email**
  (coach only).
- ✅ **Remove is now a soft delete** (sets `deleted_at`), as migration 0008 intended. It used to
  hard-delete, cascading into games/analyses. Undo from SQL:
  `update players set deleted_at = null where player_id = '…'`.
- ✅ **Engine-suggested rubric scores** shown beside the coach's own, labelled "from games",
  click-to-adopt. Never written automatically. Withheld below medium confidence.

### Coach — `CoachPage.jsx`
- ✅ **AnalysisQueuePanel** — pending/running/done/failed/skipped counts, plus a
  "Retry failed and skipped" backlog button.
- ✅ Member approval (approve / reject / suspend / set role / generate invite codes).
- ✅ Attendance by session date, Excel export, recent activity.
- ✅ **Assessment form now opens pre-filled from engine scores**, each seeded slider labelled
  "from games"; "Last assessed" populates itself from engine-written assessments.
- ⚠️ The rating trend column shows "—" on purpose (see §9).

---

## 7. CURRENT STATE

As of 2026-09-25, work is on branch **`feature/roster-import`**, pushed to GitHub for a Vercel
preview and **not merged to `master`**. `master` is unchanged at `286f7e6` and is what production
serves. Do not merge until the owner says so (COWORK-PROMPT.md §5).

Branch commits on top of `master`:

```
(docs commit)  docs: handoff and progress for the roster import
155e03b roster: wrap import reasons; add a backend-free local preview config
9e18500 roster: Import CSV on the Roster page, with a preview before any write
740c66a roster: CSV import planner with tests, and the migration behind it
```

**The database is ahead of `master`.** Migration 0018 is already applied to production (the owner
chose to apply via the connector). It is additive, so the current production build ignores the new
table and column — except that **CC-003 is now soft-deleted**, and the *production* build's roster
store does not filter `deleted_at`, so CC-003 still shows there until this branch is merged.

### The last thing worked on
Bulk roster import (Phase A item 3). See §6 Roster. Verified end to end in a backend-free local
preview (`chess-club-app-local` in `.claude/launch.json`, port 5174, runs as a local coach with no
Supabase): a 7-row sample CSV gave 2 New, 2 Check, 3 Error with the right reasons; ticking a Check
row allocated the next id; Import wrote 3 members; re-importing the same file returned all 3 as
Update with no new ids. **Not yet exercised against the live database** — that is what the Vercel
preview is for.

### Written but NOT wired to any UI (dead code today)
Each is complete and tested; nothing imports them:
- `src/data/pgnImport.js` — paste/upload PGN import (17 tests). **No button anywhere.**
- `src/data/lichessSync.js` — a Lichess sync layer (16 tests). **Superseded in practice:** Lichess
  linking actually works through `externalSync.js` + `externalChess.js`, which is why 50 Lichess
  games exist. `lichessSync.js` is a parallel implementation nothing calls. Decide whether to wire
  it or delete it.
- `src/analysis/repertoire.js` — opening repertoire report (16 tests). **No UI.**

### Planned next (from `PROGRESS.md` and the audit reports)
Tournaments/Swiss pairings, board order, homework, session planner, a player personal
dashboard, and board accessibility (arrow-key navigation, SAN entry, announced moves) are all still
unbuilt. The five remaining motifs are unbuilt (§11).

---

## 8. TESTS

```
$ npm test
93 passed, 0 failed          (src/engine/chess.test.mjs)
(no summary line)            (src/data/glicko2.test.mjs — prints "MATCH", exit 0)
45 passed, 0 failed          (src/data/externalChess.test.mjs)
42 passed, 0 failed          (src/data/chessClock.test.mjs)
ℹ tests 235
ℹ pass 235
ℹ fail 0
SKIP  rls-test: set RLS_COACH_EMAIL/PASSWORD and RLS_PLAYER_EMAIL/PASSWORD to run.
```

```
$ npm run test:engine
ℹ tests 15
ℹ pass 15
ℹ fail 0
```

```
$ npm run build
dist/index.html                   0.89 kB │ gzip:   0.55 kB
dist/assets/index-BJMpMpVC.css   25.42 kB │ gzip:   5.71 kB
dist/assets/xlsx-D_0l8YDs.js    429.03 kB │ gzip: 143.08 kB
dist/assets/index-y1GoP4o-.js   690.53 kB │ gzip: 193.05 kB
(!) Some chunks are larger than 500 kB after minification.
✓ built in 1.70s
```

**Totals: 415 assertions passing, 0 failing** (180 from the four legacy runners + 235 under
`node --test`, of which 39 are the new `src/data/rosterImport.test.js`), plus 15 engine-backed. Build succeeds; the >500 kB chunk warning is expected and
harmless (it is the xlsx library plus the app bundle).

### Covered
Rules engine incl. perft; Glicko-2 against Glickman's paper; chess clock; Chess.com/Lichess
normalisation; all of `scoring.js`; SEE; PGN parsing incl. nested variations and `[%clk]`; the
three implemented motifs; permission + wording rules; spaced repetition; ratings doctrine; skill
model; PGN import; Lichess sync; repertoire; sacrifice detection; roster CSV import (CSV
quoting, header matching, every validation rule, signup-order id allocation, all three dedupe keys,
in-file duplicates, and that the student ID never enters the `players` payload); `evaluate()`'s sign convention
(the "Gate 1" tests — a sign error here produces confident, inverted coaching, so these matter
more than they look); one end-to-end game analysis.

### NOT covered
- **Every React component and page.** There is no component test of any kind — no jsdom, no
  Testing Library. All UI verification so far has been manual, driven through a browser.
- **RLS**, unless you seed accounts: `npm run test:rls` skips without the four env vars. Use
  `supabase/seed-rls-fixtures.sql` → run → `supabase/cleanup-test-fixtures.sql`. It was passing
  16/16 when last run. **Do not leave the fixtures in production.**
- **`player_private` RLS** is not in `rls-test.mjs` yet. On 2026-09-25 it was checked by hand
  instead: evaluated as the CC-003 player login, `is_coach()` is false (so the policy refuses every
  operation); as Anthony's login it is true.
- `applyRosterImport()` and `playerPrivateStore.js` (they touch Supabase) — verified in the local
  preview only.
- The analysis **queue drain loop** itself (`useAnalysisQueue.js`) — verified only by hand.
- `externalSync.js` orchestration and anything that makes a live network call.

---

## 9. KNOWN BUGS AND QUIRKS

1. **13 games sit in `analysis_status = 'failed'`** with
   `new row violates row-level security policy for table "game_analyses"`. All belong to `CC-003`.
   **These are stale, not live:** the last failure was recorded at `2026-09-24 16:17:21Z` and the
   migration that fixed the policy landed at `16:18:14Z` — 53 seconds later. Pressing
   **Coach → Retry failed and skipped** should clear them. Unverified, because I did not re-run
   them.
2. **67 games still pending.** Analysis only runs while somebody has the app open and the tab
   visible. That is by design, but it means a backlog needs someone to sit on the page.
3. **`document.hidden` is always true in automated browsers**, so the queue's visibility guard
   parks it. The drainer wakes on `visibilitychange`/`focus`; to test it headlessly you must
   override `document.hidden` and dispatch the event. This is a testing quirk, not a product bug.
4. **A contradiction about cross-platform ratings.** `src/analysis/ratings.js` argues at length
   that no Lichess↔Chess.com conversion is defensible and refuses to hardcode one. But
   `src/data/externalSync.js` has `RATING_OFFSETS` applying exactly that
   (`lichess: {bullet:-200, blitz:-250, rapid:-300, …}`) to opponent ratings before they feed the
   club Glicko pool. Both are documented in their own files; they serve different purposes
   (displayed rating vs opponent strength). **Somebody should reconcile these deliberately.**
5. **`players.club_rating` is still populated and still wrong.** It is a single Glicko-2 number
   built by pouring bullet/blitz/rapid/daily into one pool from a cold RD-350 start (single-game
   swings of −195). Nothing on the leaderboard or Coach page reads it any more, but the value is
   still in the database and `rating_history` still accumulates. The Coach page's trend column
   deliberately shows "—" rather than the meaningless −426 that history produced.
6. **The rubric-is-unset heuristic.** A rubric whose eight categories all hold the *same* value,
   with no dated assessment, is treated as an unfilled form rather than a coach's judgement —
   otherwise the default 5s permanently suppress the engine's real measurements. If a coach
   genuinely means "all eight are exactly 5", changing any one value makes the rubric
   authoritative again. See `hasCoachAssessment()` in `skillModel.js`.
7. **Sacrifices vs blunders.** `hangs` is SEE-based, so `sacrifice.js` exists to stop a sound
   sacrifice scoring like a blunder. It is engine-opinion only and cannot distinguish a true
   sacrifice from a forced recapture the engine happens to like.
8. **Scores are on provisional anchors.** They rank players correctly relative to each other; they
   do not mean the same thing as a Chess.com number. `docs/RECALIBRATION-2026-09.md` has real
   percentiles from 48 analysed sides and proposed anchors, deliberately NOT applied — with one
   player's data, centring the club median on him would fix his score near 50 forever.
9. **`CC-003` is named "Magnus Carlsen"** — almost certainly a test player someone created, not a
   real member. Worth confirming before it appears on a club leaderboard.
10. **Supabase advisor warnings are expected, not neglected.** Five `SECURITY DEFINER` functions
    (`is_coach`, `is_approved`, `is_admin`, `my_player_id`, `owns_player`) remain executable
    *deliberately*. Revoking them was tried and **broke every policy that calls them** — RLS
    expressions run with the caller's privileges, so authenticated reads started returning 42501.
    They were restored immediately. **Do not "fix" this warning.** Reasoning is in
    `supabase/migrations/0011_security_hardening.sql`.
11. **The top nav overflows at phone width.** At 375px the nav bar is ~570px wide, so the whole
    page scrolls sideways. Pre-existing — found while checking the import dialog, which itself fits.
12. **CC-003 still visible on production** until `feature/roster-import` merges (see §7). On the
    branch, retired players are hidden from the roster, and their skill scores / platform ratings
    are filtered out of the Dashboard and Coach page (`src/data/retiredPlayers.js`). The queue marks
    games whose only club player is retired as `skipped`. `supabase/pending/skip-cc003-games.sql`
    does the same for the existing backlog — **written, not applied**.
13. **Guardian email is on `players`**, which approved members can read (placed there by 0008).
    The UI shows it to coaches only. Recorded as a fact; the owner has ruled security work out of
    scope for these sessions.

---

## 10. CONVENTIONS

### Architecture decisions
- **Minimal dependencies, on purpose.** Four runtime deps. No router, no test framework, no state
  library, no CSS framework, no chess library. Adding one needs a real justification.
- **Stores follow a five-part shape:** a local `createStore`, row translation (`fromRow`/`toRow`),
  a cloud pull on sign-in, a push after every write, and hooks for pages. Copy an existing store
  (`gamesStore.js` is the cleanest) rather than inventing a new pattern.
- **Logic lives outside React.** Anything testable goes in `src/analysis/` or `src/data/` as pure
  functions; components stay thin. The permission rules are in `presentation.js` *specifically*
  so they can be tested without a browser.
- **The database is the security boundary, not the UI.** React hides pixels, not rows. Every
  restriction must hold as an RLS policy; the UI filter is a second line only.

### Code style
- ESM everywhere, explicit `.js` extensions on relative imports.
- 2-space indent, single quotes, semicolons, trailing commas in multiline literals.
- Comments explain **why**, not what — often recording a decision or a trap. Match that register;
  this codebase's comments are unusually load-bearing.
- No linter or formatter is configured. There is no eslint/prettier config in the repo.

### Naming
- Files: camelCase for modules (`ownPuzzleStore.js`), PascalCase for components (`GameReview.jsx`).
- DB columns snake_case; JS properties camelCase; stores translate at the boundary.
- Engine category keys (`openingKnowledge`, `tacticalVision`, …) differ from roster rubric keys
  (`opening`, `tactics`, …). `RUBRIC_KEY_BY_CATEGORY` in `presentation.js` maps between them.

### DO NOT CHANGE
1. **`src/engine/chess.js`** and its perft suite. 93 assertions depend on it; the whole app sits on
   it. Add alongside it, never edit it.
2. **`src/analysis/scoring.js`.** It holds every formula. If you believe a constant is wrong,
   **write the failing case down and route around it** — do not quietly change a number. Three
   things in it exist for non-obvious reasons and must survive:
   - Centipawn loss is **never** fed into the accuracy formula; everything converts to
     win-probability points first. (This bug already happened once and drove every score to ~0;
     there is a regression test pinning it.)
   - Book moves and moves in decided positions (>97% / <3% win probability) do not count toward
     any average.
   - Every penalty is a **rate over opportunities**, never a raw count.
3. **The RLS policies.** They are correct and consistently gated on `is_coach()` / `is_approved()`
   / `owns_player()`. Do not rewrite them; extend carefully and re-run `npm run test:rls`.
4. **The five `SECURITY DEFINER` helper grants** — see §9 item 10.
5. **The "engine never overwrites a coach" rule.** It runs through `skillModel.js`,
   `presentation.js`, the Roster suggestions and `assessments.source`. The engine proposes, the
   coach disposes.
6. **`isSupabaseConfigured` is a boolean constant, not a function.** Calling it as `()` silently
   broke every analysis save once.

---

## 11. GAME ANALYZER

Against `docs/ANALYZER-SPEC.md` — read that file before touching any of this.

### Exists and works
| Piece | File | State |
|---|---|---|
| Scoring maths | `src/analysis/scoring.js` | ✅ complete, treat as fixed |
| Scoring tests | `src/analysis/scoring.test.js` | ✅ 31 assertions |
| `evaluate()` | `src/engine/stockfishClient.js` | ✅ returns cp/mate + MultiPV lines; also exports `parseInfo()` |
| Sign-convention gate | `src/engine/stockfishClient.test.mjs` | ✅ Gate 1 |
| Node engine transport | `src/engine/nodeTransport.js` | ✅ lets the WASM engine run under `node --test` |
| PGN importer | `src/analysis/pgn.js` (+ test) | ✅ Gates 2 & 3 — variations, `[%clk]`, multi-game |
| Ply records | `src/analysis/buildPlyRecords.js` | ✅ evaluates each position once and reuses it |
| Orchestrator | `src/analysis/analyzeGame.js` (+ `.test.mjs`) | ✅ Gate 4 end to end |
| SEE | `src/analysis/see.js` | ✅ |
| Runner / queue | `runner.js`, `queue.js`, `useAnalysisQueue.js` | ✅ DB-backed, auto-draining |
| Spaced repetition | `spacedRepetition.js` | ✅ |
| Sacrifice detection | `sacrifice.js` | ✅ wired into `buildPlyRecords` |
| Migration | `supabase/migrations/0009_game_analysis.sql` | ⚠️ applied, but the file's types (`uuid`) do **not** match production (`text`) |

### Partial
- **`src/analysis/motifs.js` — 3 of 8.** Implemented: `hangingPiece`, `fork`, `backRank`
  (verified by grepping `found.push(...)`). **Missing: `pin`, `skewer`, `discoveredAttack`,
  `trappedPiece`, `deflection`.** A build agent was mid-way through adding them when its session
  ended; nothing was committed. The spec says add them one at a time, each with a test built from
  a known position **and a negative case** — a motif test whose position contains a *different*
  motif passes for the wrong reason.
- **Recalibration** — `recalibrationReport()` exists and is tested; a real report is in
  `docs/RECALIBRATION-2026-09.md`; the anchors are deliberately not applied.

### Missing entirely
- **Server-side analysis.** Evaluated and rejected: the engine is a 7 MB WASM binary needing
  ~30–60s CPU per game, and Supabase Edge Functions are short-lived Deno workers. Analysis
  therefore requires an open browser tab. Revisit only if that becomes intolerable.
- **Opening book** for the `inBook` flag. The fallback is "first 8 plies"; `meta.bookSource`
  carries that string so the UI can say so.
- **Parent-facing monthly report / printable export.**
- **Repertoire reporting in the UI** (`repertoire.js` exists, nothing renders it).

---

## 12. OPEN QUESTIONS — decisions waiting on the owner

Security, auth, sign-up, invites, consent and permissions are **out of scope** by the owner's
decision (COWORK-PROMPT.md §4), so they are not listed here.

Resolved 2026-09-25: **CC-003 is test data** (soft-deleted); **migrations are applied through the
Supabase connector** by the session that writes them.

1. **Merge `feature/roster-import`?** Waiting on the owner to try the Vercel preview.
2. **The Google Form itself** isn't built yet. The importer expects these headers (case and
   spacing don't matter): Timestamp, Email Address, Full name, Student ID, Grade, "Do you want to
   compete in tournaments?", Experience, Chess.com username, Lichess username, US Chess ID,
   "What do you want to get better at?", Parent/guardian email.
3. **US Chess rating vs ID.** The form asks for the ID; the importer stores it as an id. If a
   rating is wanted on the leaderboard, add a separate question, or look it up from the id later.
4. **Were the flat 5s in the rubric a real judgement or a blank form?** The app assumes blank form.
5. **Apply the recalibration anchors, or wait for more players?** Recommendation on file: wait —
   and the import is what will finally give it more players.
6. **Reconcile the rating-conversion contradiction** (§9.4).
7. **Delete `lichessSync.js`?** (`pgnImport.js` is Phase A item 4; `repertoire.js` item 11.)
8. **DISD tournament: individual or team scoring, and what time control?** Needed before Swiss.

### Recommended next actions
1. **Owner:** click through the preview with a real (or sample) CSV, then say whether to merge.
2. **Write migration files `0012`–`0017` from the live schema** (Phase A item 1) — still the
   biggest liability in the repo. The numbers are free.
3. **Press "Retry failed and skipped" on the Coach page** and confirm the 13 stale failures clear
   (Phase A item 2).
4. Then **wire `pgnImport.js`** (Phase A item 4) so Oct 24 games can be entered.
