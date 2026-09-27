# Unfinished agent work (run ended early on the owner's instruction, 2026-09-27 ~02:45 UTC)

Three helper agents were stopped at 02:29 UTC, when the owner interrupted the run, and the run was then
ended. These patches are exactly what each one left on disk, taken against commit `945777b`. **None of it
is reviewed, merged or known to pass tests.**

| Patch | Feature | Notes |
|---|---|---|
| `sessions-planner-attendance.patch` | Tuesday sessions, session planner, attendance (F003, F006, F007, F017) | New files only; renumbered to migration `0024_club_sessions.sql` (**not applied**). Not wired into a page yet. Applies cleanly with `git apply`. |
| `repertoire-view.patch` | Repertoire view per player (owner item 10) | Touches GameReview, MyGamesPage, RosterPage, pgn.js. RosterPage has changed since (report card), so use `git apply --3way`. The five motifs (pin, skewer, discovered attack, trapped piece, deflection) were not started. |
| `board-accessibility.patch` | Arrow keys, typed moves, announced moves (owner item 12) | New files only, not wired to a board. Should be merged with `src/data/sanMatch.js` rather than keep a second SAN parser. Applies cleanly with `git apply`. |

To continue one: `git apply docs/wip-2026-09-27/<file>.patch` (or `--3way`), then finish, test
(`npm test`, `npm run test:engine`, `npm run build`) and commit.
