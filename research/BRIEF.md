# Research brief: what a coaching app for this chess club should have

You are researching what the ideal app for this club would include. **Do not look at the app's
code or any other file in this repository**; only this folder. The goal is an independent list,
not a review of what exists. Someone else will compare your list with the app afterwards.

## The club

- **SEM Chess Club**, SEM at Townview, Dallas ISD (a public high school magnet). About **30
  members** aged roughly 14–18, ratings roughly **600–1600**, some unrated beginners.
- One volunteer coach (Anthony) who is also the app's owner. No assistant coaches.
- Meets **every Tuesday** after school (~60–90 minutes). Members also play online at home on
  Chess.com and Lichess.
- Goals, in order: **win 1st place at the DISD (district) tournament**; raise everyone's level;
  keep it fun so members keep coming.
- Next tournament: W.T. White High School, **Saturday Oct 24, 2026**, over-the-board, scholastic
  rules (US Chess). Registration closes Oct 16. Whether it's scored individually or by team isn't
  known yet, so research both.

## The app, as a category (not its contents)

A private web app for club members only: phones and school Chromebooks, used between Tuesdays and
during meetings. Coach and player roles. It can import members' Chess.com and Lichess games, run
Stockfish in the browser, and store data in a Postgres database.

## Constraints any feature must fit

- **Free to run.** No paid APIs, no paid AI services, no subscription data sources. Free public
  APIs (Chess.com, Lichess) and open data (e.g. Lichess puzzle and opening databases) are fine.
- Minors use it, so nothing that exposes students publicly or collects more personal data than
  a coach needs. Don't propose sign-up, password or permission systems; that area is handled
  separately.
- One coach with limited time: favour features that remove work over ones that add it.

## What to research

1. **Comparable products**: Lichess, Chess.com (including Chess.com for Schools/Clubs), ChessKid,
   Chessable, Chesscademy/ChessMood-style courses, club tools such as SwissSys, WinTD,
   Swiss-Manager, Lichess teams/Swiss, and scholastic platforms (e.g. US Chess scholastic
   resources). What do coaches and young players actually use and value? What do reviews and
   coach forums say is missing?
2. **Coaching practice**: how strong scholastic programs structure weekly sessions, track
   progress, assign homework, prepare for tournaments (openings, time management, endgames,
   tournament nerves), and review games after events.
3. **Tournament needs**: individual and team Swiss pairing and tiebreak rules (US Chess), board
   order for team events, recording over-the-board games (scoresheets → PGN), results, standings,
   and what a coach needs on tournament day.
4. **Motivation for teenagers**: what keeps 14–18 year olds engaged (streaks, ladders, challenges,
   badges, team identity), and what backfires (public rankings that shame weaker players).
5. **Communication**: what parents and school staff want to see, and how often.

## What to write: `FEATURE-RESEARCH.md` in this folder

1. **Summary**: the 10 features that would most help this club, and why.
2. **Feature catalogue**: a table with one row per feature, ids F001, F002, …, and these columns:
   - Area: coaching, training, games & analysis, tournaments, motivation, communication, admin
   - Feature: one line
   - For whom: coach, player or parent
   - Priority for this club: Must, Should or Could, with Must meaning "helps win on Oct 24 or is
     basic to running the club"
   - Evidence: which product has it, or which source recommends it, with a link where possible
   - Acceptance: one line on how you'd know it works ("coach can pair a round of 30 players in
     under a minute")
   Aim for completeness: 60–150 rows is reasonable.
3. **Tournament-day checklist**: what the app should do before, during and after Oct 24.
4. **Things to avoid**: features that look good but hurt a club like this, with reasons.
5. **Sources**: every source you used.

Be concrete and cite what you can. Mark anything from your own judgement rather than a source as
"judgement".
