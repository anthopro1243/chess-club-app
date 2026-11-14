You are taking over development of **chess-club-app**, a coaching web app for a high school chess club. Another Claude session (Claude Code) built most of it and wrote a detailed handoff. Your job is to continue the work in this folder, one feature at a time, without breaking anything that already works.

# 1. Who this is for

- **Owner and coach:** Anthony. He runs the **SEM Chess Club** at SEM at Townview (Dallas ISD). He prefers exhaustive, technically precise explanations and learns fast from detail. Explain what you did and why, not just "done."
- **Club:** about **30 high school members** (older docs say 10–20; that number is out of date). The club meets **every Tuesday**.
- **Goal:** win 1st place at the DISD tournament, raise everyone's level, and keep it fun.
- **Next tournament:** W.T. White High School, **Saturday Oct 24, 2026**. Registration closes **Oct 16**. Today is **Sept 25, 2026**, so about four weeks remain. Anything that helps the club prepare for or record that tournament comes first.

# 2. Read before doing anything

In the project folder, read these first and treat them as the source of truth:

1. `HANDOFF.md`: full state of the project (stack, file map, database, features by page, tests, known bugs, conventions, do-not-change list). Where this prompt and HANDOFF.md disagree on a *technical* fact, HANDOFF.md wins, except for the club size, which is ~30.
2. `docs/ANALYZER-SPEC.md`: read it before touching anything in `src/analysis/`.
3. `PROGRESS.md`: the running backlog.

Then establish a baseline **before changing any code**:

```
git status
git log --oneline -5
npm install
npm test
npm run test:engine
npm run build
```

Expected: a clean working tree on `master`, 376 assertions passing in `npm test` plus 15 in `test:engine`, and a successful build (the >500 kB chunk warning is normal). Report the actual results to Anthony. If anything differs, stop and tell him before building on top of it.

# 3. Project facts you need on hand

- **Stack:** React 18 + Vite 5, `@supabase/supabase-js`, `xlsx`. Plain ESM. No router, test framework, state library, CSS framework or chess library, **on purpose**. Don't add dependencies without a strong reason, and ask Anthony first.
- **Live site:** https://chess-club-app-seven.vercel.app
- **Repo:** https://github.com/anthopro1243/chess-club-app, branch `master`
- **Deployment:** Vercel builds from GitHub. **Every push to `master` deploys to production immediately.** If a push doesn't seem to deploy, check Vercel → Project → Settings → Git (the link broke once before).
- **Database:** Supabase project `rftlozmdyetubhjcutht`. `players.player_id` and `games.id` are **text**, not uuid. Production is the truth; the committed `0009` migration file has the wrong types.
- **Tests:** `node --test` plus hand-rolled runners. Pure logic lives in `src/analysis/` and `src/data/`, and gets tests. There are no component tests; UI is verified by hand.

## Do not change (from HANDOFF.md §10)

1. `src/engine/chess.js` and its perft suite. Add alongside it, never edit it.
2. `src/analysis/scoring.js`. If a constant looks wrong, write down the failing case and route around it; don't edit the number.
3. The existing RLS policies and the five `SECURITY DEFINER` helper grants. The Supabase advisor warnings about those helpers are expected; revoking them breaks every policy.
4. The rule that **the engine never overwrites a coach**. The engine suggests; the coach decides.
5. `isSupabaseConfigured` is a **boolean constant, not a function**. Never call it with `()`.

Match the existing code style: 2-space indent, single quotes, semicolons, explicit `.js` import extensions. Comments explain *why*. New stores copy the five-part shape of `gamesStore.js`.

# 4. Scope rule from Anthony

**Do not work on security, authentication, passwords, email confirmation, sign-up flow, invites, consent records or permissions as features.** Don't propose them as to-dos either. That covers HANDOFF.md's "test a new signup end to end" action and the leaked-password-protection question. Skip both.

The one exception is mechanical: any **new table** you create needs RLS policies copied from the existing pattern (`is_coach()`, `is_approved()`, `owns_player()`), because without them the feature cannot save data. Do that quietly as part of the feature, and run `npm run test:rls` if the fixture accounts are available.

# 5. How to work

- **One feature per session.** At the start of a session, say which item from the plan below you're taking and why, and confirm with Anthony before writing code.
- **Branch, preview, then merge.** Do the work on a feature branch (e.g. `feature/swiss-pairings`), not on `master`. Pushing a non-master branch should give a Vercel **preview URL** that doesn't touch the live site; confirm that this works for this project the first time. Give Anthony the preview link to click through. **Only merge to `master` (i.e. deploy to production) after he says so.**
- **Tests before and after every change.** New logic goes in a pure module with its own tests, including at least one negative case. A task is not done until `npm test`, `npm run test:engine` and `npm run build` all pass.
- **Commits** follow the existing style: `area: short summary` (e.g. `tournament: swiss pairing engine with tests`).
- **Database changes** go in a new numbered migration file in `supabase/migrations/` **and** are applied to the live database, so the repo and production never drift again. If you have no way to apply migrations (no Supabase CLI login or connector), write the file and ask Anthony how he wants it applied.
- **End of every session:** update `HANDOFF.md` §6–§9 and §12 to reflect what changed, append to `PROGRESS.md`, and give Anthony a short report: what changed, test counts, the preview URL, and anything he needs to do or decide.

# 6. What's already built (don't rebuild it)

The clock with delay/increment and `[%clk]` in the PGN, resign and draw offer, the Stockfish opponent, 402 puzzles with theme filters and deep links, per-attempt puzzle logging, "Your mistakes" own-blunder puzzles with spaced repetition, the full analysis pipeline with a DB-backed queue, GameReview, My Games, engine-suggested rubric scores, a club skill profile, a leaderboard, the coach analysis queue panel, attendance, Excel export, and Chess.com + Lichess account sync. See HANDOFF.md §6 for detail.

# 7. The plan, in order

## Phase A: before the Oct 24 tournament

1. **Put the missing migrations in the repo.** Six applied migrations have no file (HANDOFF.md §5). Write `0012`–`0017` from the live schema so the repo can rebuild production, and add a comment to `0009` noting its uuid/text mismatch rather than editing it. Housekeeping, but it's the biggest liability in the repo and quick to fix.
2. **Clear the 13 stale failed analyses.** Ask Anthony to press **Coach → Retry failed and skipped**, then confirm in the database that they reach `done`. If any still fail, investigate.
3. **Get the club into the app.** The database has **2 players** (`CC-002` Anthony, `CC-003` "Magnus Carlsen", probably test data; ask) but the club has about **30 members**. Build a **bulk roster import**: CSV upload on the Roster page matching the columns of the club's Excel/Google Form workbook (the Player Master Profile and Form Responses tabs; ask Anthony for a sample export). Include validation, a preview, `CC-###` ID assignment in join order, and duplicate detection. This is the single biggest practical gap. Leaderboards, board order and recalibration all mean little with one real player.
4. **Wire `src/data/pgnImport.js` to the UI.** It is finished and tested with 17 tests, but no button calls it. Add **Paste PGN / Upload PGN** on the Games page, with a player picker per side, so over-the-board games from Tuesdays and from Oct 24 can be entered, archived and analysed.
5. **Tournament mode (Swiss).** This is the largest item, so split it across sessions:
   - Pure logic module with tests: pairings by score group, colour balancing, no repeat pairings, bye handling, and standings with Buchholz, Median-Buchholz and Sonneborn-Berger tiebreaks.
   - Tables: tournaments, entrants, rounds/pairings, results (with RLS per §4).
   - UI: create an event, add entrants, pair a round, enter results, standings. Finished games link into the archive.
   - Use: run internal Tuesday Swiss events under tournament conditions with the existing clock.
   - **Ask Anthony first:** is the DISD event scored individually or by team, and what time control does it use? Team scoring changes the design.
6. **Board order / team selection view** for the coach: rank players on the documented leaderboard key plus recent form and tournament results, with manual drag-to-reorder. Only needed if the event has team scoring.

## Phase B: after the tournament (Nov)

7. **Player personal dashboard:** the player's home page shows their one priority (from `improvementPlan()`), their trend, review positions due, homework due, and recent games. Follow `presentation.js`: trend before level, and never show a low-confidence score as a number.
8. **Homework:** the coach assigns a theme or puzzle set with a due date; completion comes from `puzzle_attempts`; the coach sees who has done it.
9. **Session planner:** turn the dashboard's three weakest club categories into a Tuesday lesson plan with puzzles attached.
10. **Recurring Tuesday sessions** created automatically for attendance.
11. **Repertoire UI** for `src/analysis/repertoire.js` (finished, 16 tests, no UI).

## Phase C: later

12. The remaining five motifs in `motifs.js` (`pin`, `skewer`, `discoveredAttack`, `trappedPiece`, `deflection`), **one at a time**, each with a known-position test **and** a negative case.
13. A small opening book for the `inBook` flag, replacing the "first 8 plies" fallback.
14. Board accessibility: arrow-key navigation, typed SAN entry, announced moves.
15. Monthly parent progress report (coach-generated summary, not raw engine output).
16. Recalibrating the scoring anchors, only once there are enough real players (see `docs/RECALIBRATION-2026-09.md`).

# 8. Decisions waiting on Anthony

Ask when the relevant task comes up, not all at once:

1. Is the DISD tournament individual or team-scored, and what time control? (Needed for item 5.)
2. Is `CC-003` "Magnus Carlsen" real or test data? (Needed for item 3.)
3. Were the flat 5s in the rubric a real judgement or a blank form? The app assumes a blank form.
4. `RATING_OFFSETS` in `externalSync.js` contradicts the no-conversion doctrine in `ratings.js`. Keep it for opponent strength, or drop it?
5. `lichessSync.js` duplicates what `externalSync.js` already does. Delete it? (`pgnImport.js` gets wired in item 4; `repertoire.js` in item 11.)
6. Apply the recalibration anchors now, or wait for more players? Recommendation on file: wait.

# 9. Start now

1. Read HANDOFF.md, ANALYZER-SPEC.md and PROGRESS.md.
2. Run the baseline commands in §2 and report the results.
3. Propose starting with Phase A item 1 (migration files), then item 3 (roster import). Say what you'll do, confirm with Anthony, and go.
