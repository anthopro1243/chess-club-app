# Audit response — what got fixed

Commits `1afbbe7..e51a135` (plus `4e93cef`). **391 assertions passing**
(196 unit + 180 legacy + 15 engine-backed), build clean, working tree clean.
Nothing pushed, nothing deployed — see "What I need from you" for why.

---

## Section 1 — the live bugs

| # | Bug | State | Evidence |
|---|---|---|---|
| 1.1 | Club rating invented from mixed time controls | **fixed** | leaderboard now reads "1356 Chess.com rapid"; `player_platform_ratings` backfilled to 5 rows |
| 1.2 | Three skill systems that don't talk | **fixed** | `skillModel.js`, 13 assertions; home page now shows real per-category numbers |
| 1.3 | Games page dead, analyzer unreachable | **fixed** | all 54 rows clickable, board viewer + move list + clickable turning points |
| 1.4 | RLS fixtures polluting production | **fixed** | 0 fixture rows; 1 player, 53 real games, test accounts deleted |

**1.1.** You were right about all of it. The blend is gone. Ratings are stored
one row per platform per time control and never merged. The leaderboard sort
key is now explicit: a coach override wins, then USCF, then the club's chosen
basis (Chess.com rapid, configurable). Every number on screen carries its
platform and time control. Ratings from a *different* pool are listed below the
table rather than ranked against it, because ranking a Lichess blitz number
against a Chess.com rapid one is meaningless.

**1.2.** The home page read a flat 2.5 for all eight categories because it
averaged an untouched manual rubric and counted "no data" as zero. It now reads
Opening 6.5, Tactics 5.7, Positional 6.0, Endgame 7.2, Time management 4.1,
Board vision 3.8, Resilience 8.4, Notation —. That last dash is deliberate.

One judgement call worth your attention: a rubric where all eight categories
hold the *same* value with no dated assessment is treated as an unfilled form,
not a coach's opinion. Your 5/5/5/5/5/5/5/5 was suppressing every real
measurement. If you did mean those 5s, change any one of them and the app will
treat the rubric as authoritative again.

**1.3.** This was the biggest gap and it is closed. Clicking a game opens a
board you can step through with the arrow keys, the full move list, the
evaluation after each move, and the turning points — click one and it jumps to
that position.

---

## Section 2 — making it automatic

**Only 3 of 54 games had ever been analysed. It is now 52 of 53, and I never
pressed a button.**

- `games.analysis_status` replaces the old localStorage array, so the backlog
  belongs to the club's data rather than to one browser. Claims carry a
  timestamp; a row stuck in `running` for 15 minutes is reclaimed, so a closed
  laptop lid cannot wedge a game forever.
- Enqueues on every path in: sync, Play, manual log, and PGN import.
- Drains in the background while the tab is visible, one game at a time, waking
  on `visibilitychange`. Abortable when the tab closes.
- Skill scores, `player_skill_history` and the trend update themselves after
  every game. History went from 12 rows to **354**.
- 68 own-game puzzles were generated along the way.
- The coach's "Analyse all pending" survives as a backlog tool, not the
  mechanism.

**On a server-side Edge Function:** I evaluated it and did not build it. The
engine is a 7MB WASM binary that needs ~30–60s of CPU per game; Supabase Edge
Functions are Deno workers with a short wall-clock budget and no persistent
process, so a 53-game backfill would mean 53 cold starts each loading 7MB. The
in-app worker did the whole backlog in one sitting. The honest trade is that
analysis needs somebody's tab open — acceptable, because that is also when
anyone cares about the result.

---

## Section 3 & 4 — features

| Item | State |
|---|---|
| Own-game puzzles in Training ("Your mistakes") | **done** — 50 due, live |
| Training pre-filter navigation | **done** |
| Suggested rubric scores in Roster | **done** — both views |
| Sacrifice detection | **done** — wired into the pipeline |
| Recalibration run | **done** — `docs/RECALIBRATION-2026-09.md` |
| Lichess import logic | **module done, not wired to UI** |
| PGN import logic | **module done, not wired to UI** |
| Remaining 5 motifs | **not done** |
| Opening repertoire | **module done, not wired to UI** |

The "Your mistakes" mode is the one I would look at first. It found the exact
blunder from your audit — `r2q1rk1/...`, you played e6, should have played
Nxe5 — and it is now a drill that comes back on a schedule.

**Recalibration: I ran it but did not apply the new anchors**, and I want you to
push back if you disagree. The spec says to centre the *club* median at 50.
This is one player's 48 sides. Centring the scale on you would fix your score
at ~50 by construction — your improvement would move the scale instead of your
score — and would measure every future member against one teenager's habits.
The percentiles and proposed anchors are in the doc, ready for when several
players have analysed games.

---

## Section 5 — security

Advisor findings went from **20 to 12**.

- **`redeem_invite` was the real find.** It incremented `invite_codes.uses`
  *before* checking who was calling, and was callable anonymously — so anyone
  could burn a legitimate invite code by guessing at it, no account needed. It
  now requires a signed-in caller and is rate limited to 10 attempts an hour.
- The three internal trigger functions (`handle_new_user`,
  `protect_profile_privileges`, `rls_auto_enable`) are revoked from REST.
- `touch_updated_at` has a pinned `search_path`.
- Policies on the newer tables normalised to role `authenticated`, and the
  `FOR ALL` write policies split so each table has exactly one SELECT policy.
- Nine unindexed foreign keys now have covering indexes.

**The five remaining warnings are deliberate.** `is_coach`, `is_approved`,
`is_admin`, `my_player_id` and `owns_player` must stay executable. I tried
revoking them and **it broke every policy that calls them** — RLS expressions
run with the caller's privileges, so authenticated reads of `public.players`
started returning 42501. I restored the grants immediately and Gate 5 went back
to 16/16. Exposure is negligible: each reports only on `auth.uid()`.

**`player_platform_ratings` visibility — my call, reversible.** Readable by any
approved member, not owner-only. The leaderboard shows everyone's rating and a
player has to be able to read the board they appear on; these numbers are
already public on Chess.com and Lichess. Coach notes and skill scores, which are
judgements about a child, stay owner-or-coach.

---

## What I think is fragile

1. **Analysis needs a tab open.** No browser, no progress. Fine today; it will
   feel slow the first time twenty players link accounts at once.
2. **The five unbuilt motifs** mean `motifs.js` still explains blunders with
   only hangingPiece, fork and backRank. Anything else shows no motif rather
   than a wrong one, which is the safe failure, but the coaching is thinner.
3. **Lichess and PGN import are logic without a door.** Both are tested
   (33 assertions) and neither has a button. The Games page still offers a
   "Lichess" filter that can only return zero rows.
4. **Sacrifice detection is engine-opinion only.** It cannot tell a true
   sacrifice from a forced recapture the engine happens to like.
5. **Scores are still on provisional anchors** — see the recalibration note.
6. **One player.** Club-relative normalisation has almost nothing to work with
   until the roster grows; it returns null rather than inventing a percentile.

---

## What I need from you

1. **Deploying.** I could not. The Vercel project is not git-linked
   (`link: null`), there is no CLI and no token on this machine, and the
   connector's file-tree deploy is impractical for a 7MB WASM binary. Either
   link the project to the GitHub repo so pushes deploy, or give me a token and
   I will run `npx vercel --prod`. **Everything above is live in the database
   already — only the front-end code is undeployed.**
2. **Leaked password protection** is a dashboard toggle I cannot reach:
   Authentication → Providers → Password → enable.
3. **The flat 5s.** Confirm they were a blank form, not your judgement.
4. **The recalibration anchors** — apply them or wait, your call.
5. **Re-seeding for the RLS suite:** `supabase/seed-rls-fixtures.sql`, then
   `npm run test:rls`, then `supabase/cleanup-test-fixtures.sql`. The fixtures
   are out of production; they must not go back in.
