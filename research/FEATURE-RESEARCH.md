# Feature research: the ideal coaching app for SEM Chess Club

Prepared 26 September 2026 from web research only (no app code was read). Links point to the
sources in section 5; labels such as `[s12]` are listed there. Anything written from my own
reasoning rather than a source is marked **judgement**. Every feature here is meant to run on
free data only: the Chess.com and Lichess public APIs, Lichess's CC0 databases and Stockfish in
the browser. No feature adds sign-up, password or permission systems.

## 1. Summary

### What the research found

- **The Oct 24 event has hard limits the app can help with.** Dallas ISD lists the high-school
  fall tournament at W.T. White HS on Saturday 24 Oct 2026. Each coach can register up to
  **10 students** and each campus can have at most 2 coaches. Registration closes the Friday
  before the event week (Fri 16 Oct). Transportation forms are due **3 weeks before** the event
  (around Fri 2 Oct). The coach's stipend for that tournament is halved if the campus brings
  **fewer than 6 students** [s63]. With 30 members, choosing who goes and hitting those dates is
  a real task. The field is big: 665 students from 72 middle and high school campuses played
  the fall 2022 secondary tournament [s66].
- **The team format isn't published, so the app should handle both.** In 2023 the secondary
  tournament used Swiss-style pairings ("paired … based on their wins and losses"), grade
  sections 9–10 and 11–12, and team placements [s64]. The 2018 district championship allowed only
  each school's top four players [s65]. Under US Chess scholastic practice, a team's score is the
  sum of its top 3 or 4 individual scores [s53][s54]. Team-vs-team events instead use a fixed
  board order by rating [s59][s60].
- **Phones must be off and away during games.** US Chess national scholastic regulations require
  electronic devices to be switched off and bagged, or placed face-up and off, and they can't be
  used while games are in progress. Players must use the tournament's official scoresheets, not
  their own notation devices [s53]. Local events may differ, but the brief says scholastic rules
  apply. So the app is a tool for before and after games, and for the coach between
  rounds. It can't be a notation device at the board.
- **Most of the data is free.** Chess.com's API needs no login and is unlimited for serial
  requests [s27]. Lichess streams a user's games with clocks, evals and openings [s8]. Lichess
  publishes 6.1M rated, themed puzzles and an opening-name dataset, both under CC0 [s12][s13].
  The single-threaded Stockfish.js "lite" engine (about 7 MB) is the recommended browser build
  [s44]. One caution: **Lichess's opening explorer began requiring authentication in 2026**
  [s24][s25], so the app shouldn't depend on it.
- **What coaches ask for is mostly admin relief.** They want automatic pairings, class
  tournaments and bulk invites [s5], a lesson-tracking dashboard [s3], report cards and
  assignments like "Play 7 games, solve 50 puzzles" [s32][s33]. No free tool combines Chess.com
  games, Lichess games, over-the-board (OTB) games and homework for one small club
  (**judgement**, from the products reviewed).
- **Motivation has pitfalls.** Gamification clearly helps autonomy and relatedness but barely
  helps competence [s88]. Rankings affect students differently depending on how competitive they
  are, and low rankings cause negative emotions [s89]. Losing a streak can backfire [s91].
  Fixating on rating makes players play not to lose [s42].

### The 10 features that would help this club most

| # | Feature (id) | Why it matters for this club |
|---|---|---|
| 1 | **Automatic game import** from Chess.com and Lichess (F043) | Members already play at home (BRIEF.md). Importing puts every game into coaching with no typing, and both sites include clock data [s8][s26][s27]. |
| 2 | **"Big blunder" review with retry drills** on each player's own games (F050, F051) | ChessMood tells players below 1500 to focus their analysis on big blunders: undefended pieces, missed tactics and missed mates [s40][s41]. Having players re-find the right move is how Lichess teaches from mistakes [s17]. |
| 3 | **Time-use analysis** from move clocks (F054) | Coaches report big gains from simply slowing down [s73], and Heisman says to use nearly all your time [s80]. OTB Swiss events use slow controls such as G/60 d5 [s75]. The data is already in the imported PGNs. |
| 4 | **Assignments with automatic completion tracking** (F019, F020) | These are ChessKid's core coach tools [s32][s33] and a known Lichess gap [s3]. They save a lone coach from chasing homework. |
| 5 | **Themed tactics trainer** built on the CC0 Lichess puzzle database (F021) | ChessMood puts tactics at 70% of study time for 1000–1500 players [s41]. The data is free and tagged by theme and rating [s12][s19]. |
| 6 | **Scoresheet entry with legal-move checking** (F065) | Turns Oct 24 paper scoresheets into analysable PGN. OCR still needs heavy manual correction, and hand transcription takes 10–20 minutes a sheet [s84]. |
| 7 | **Club Swiss pairing** following US Chess basics, used for mock tournaments (F076, F075) | Rehearses the real format. Coaches ask for automatic pairings [s5]. The rules are published [s51]. |
| 8 | **DISD roster and deadline helper** (F072, F070) | Enforces the 10-per-coach cap, the 6-student floor, the Oct 16 registration and the transport-form deadline [s63]. |
| 9 | **Team-score projector and board-order tool** for both possible formats (F081, F082) | The format is unknown. Top-N scoring [s53] and rating board order [s59][s60] need different decisions. |
| 10 | **Private personal-progress view** instead of club-wide rankings (F096) | Keeps weaker players coming (goal 3). It compares each player with their past self, which avoids rating obsession and the harm of low rankings [s42][s77][s89]. |

## 2. Feature catalogue

Priority: **Must** = helps win on Oct 24 or is basic to running the club; **Should** = clear
value, build after Musts; **Could** = nice to have.

| ID | Area | Feature | For whom | Priority | Evidence | Acceptance |
|---|---|---|---|---|---|---|
| F001 | coaching | Club roster with only needed fields: display name, grade, section, Chess.com/Lichess usernames, optional US Chess ID, media-release flag. No date of birth, address or phone. | coach | Must | Sections are by grade [s64]. Dallas ISD treats photo, grade and activities as directory information [s67]. Texas SCOPE Act stresses limiting minors' data [s93]. | Coach adds 30 members in under 15 min, and the profile has no fields beyond this list. |
| F002 | coaching | Bulk add members by pasting a list or CSV. | coach | Should | Lichess teachers ask for bulk invitations [s5]. | Pasting 30 lines creates 30 members, and duplicates are flagged. |
| F003 | coaching | One-tap weekly attendance for Tuesday meetings. | coach | Must | Weekly meetings are the norm [s56]. Dallas ISD cuts the stipend if fewer than 6 students attend a tournament, so the coach needs to know who reliably comes [s63]. | Attendance for 30 takes under 60 s, and each member's attendance % shows. |
| F004 | coaching | Skill groups (e.g., Pawns / Knights / Bishops) suggested from ratings, editable by drag. | coach | Should | The US Chess guide says to "group them by skill/experience" [s56]. ChessKid groups students [s32]. | One click proposes 3 balanced groups, and moving a player takes one drag. |
| F005 | coaching | Placement check for new or unrated members: a short puzzle set plus mini round-robin results give a starting band. | coach | Could | The US Chess guide uses a round robin to find levels [s56]. | A new member gets a provisional band after about 20 minutes. |
| F006 | coaching | Tuesday session planner with timed blocks (warm-up puzzles → 10–15 min lesson → play → review) and a visible timer. | coach | Should | Coaches suggest a 30-min lesson then play [s70], or 10–15 min of theory [s71]. ChessKid has a week-by-week planner [s35]. | A plan built from a template in under 5 min runs on the projector with block timers. |
| F007 | coaching | Season curriculum map: a topic per group for each Tuesday until Oct 24 and beyond. | coach | Should | ChessKid's planner runs 30 weeks with an objective per unit [s35]. Silman orders endgames by rating class [s83]. | Every Tuesday through Oct 20 has a topic per group, and completed weeks are marked. |
| F008 | coaching | Lesson library of positions (FEN/PGN) with notes. Can import a Lichess study PGN. | coach | Should | The Lichess API supports study PGN export [s7]. Lichess Class posts studies to a class board [s1]. | Importing a multi-chapter study PGN shows each chapter as a lesson. |
| F009 | coaching | Guided "find the move" lessons authored by the coach, with hints and feedback for wrong moves. | coach, player | Could | Lichess interactive lessons offer hints and custom wrong-move branches [s16]. | Coach builds a 10-move lesson with 2 hints and 1 wrong branch in under 15 min. |
| F010 | coaching | Projector/demo board: large board, arrows, arrow-key stepping, readable from the back of a room. | coach | Should | Coaches use a big screen to "demonstrate tactics an unlimited number of times" [s72]. The Lichess simul request stresses arrows [s4]. | Legible at 1080p from 8 m, and keyboard stepping works on a Chromebook. |
| F011 | coaching | One-page player report card: online ratings, activity, homework done, top weaknesses, goals, notes. | coach | Must | ChessKid has report cards [s32]. Lichess Class lets teachers "monitor the progress of your students" [s1]. | Any player's card opens in 2 taps and loads in under 2 s. |
| F012 | coaching | Private, timestamped coach notes per player. | coach | Should | **judgement**: a single coach needs memory across weeks. | A note saves in under 10 s and never appears in the player view. |
| F013 | coaching | 1–3 process goals per player (e.g., "blunder-check every move", "use half my clock"), agreed with the player. | coach, player | Should | Heisman's thought-process principles [s80]. ChessMood argues for process over rating [s42]. | Each player has 3 or fewer active goals, shown on their home screen. |
| F014 | coaching | "Needs attention" list: inactive for 2+ weeks, overdue homework, sharp drop in results. | coach | Should | ChessKid lets coaches "see which puzzles kids are struggling with" [s33]. **judgement** on the triggers. | Updates automatically each week, and every name shows a reason. |
| F015 | coaching | Club-wide weakness overview: most-missed tactic themes, the game phase where decisive errors happen, common openings faced. | coach | Must | NSCF: prepare for "what positions will they actually get" [s69]. Lichess Insights crosses results by phase and opening [s18]. | Shows the club's top 3 weaknesses from the last 30 days of games, so the coach can pick the next lesson. |
| F016 | coaching | Buddy pairing between experienced members and beginners. | coach | Could | High-school students mentor at ChessKid schools [s34]. Clubs mix veterans with newcomers [s70]. | Every beginner has a named buddy, visible to both. |
| F017 | coaching | Coach "Tuesday dashboard": today's plan, attendance, homework due, announcements and alerts on one screen. | coach | Must | **judgement**: a single coach needs fewer clicks. The brief favours features that remove work. | A whole meeting runs from one screen without navigating away. |
| F018 | coaching | "Start here" path for unrated beginners: rules, basic mates, touch-move, notation. Links to free Lichess Learn/Practice. | player | Should | The US Chess guide says players below 800 get frustrated without encouragement [s56]. Lichess teachers want beginners limited to the basics [s2]. Lichess Practice is free [s21]. | An unrated member sees a 10-step path, and completion shows on the coach card. |
| F019 | training | Assign work (puzzle sets, lessons, "play N rapid games", annotate a game) with due dates, to a group or individual. | coach, player | Must | ChessKid: "Play 7 games, solve 50 puzzles" [s33]. Lichess Class homework board [s1]. | Assigning to a group takes under 1 min, and the player sees it on their home screen. |
| F020 | training | Completion tracked automatically: in-app puzzles and lessons, plus imported games counted by time control. No self-reporting needed. | coach | Must | ChessKid planner tracks completion [s35]. Lichess teachers ask for a lesson-tracking dashboard [s3]. | The coach sees completion % per assignment without any student input. |
| F021 | training | Tactics trainer built on the CC0 Lichess puzzle database, filtered by theme and by rating near the player's level. | player | Must | 6.1M rated, tagged puzzles under CC0 [s12]. Themes range from forks to back-rank mates [s19]. Tactics are 70% of study for 1000–1500 players [s41]. | Puzzles are served within ±150 of the player's puzzle rating, the theme filter works, and nothing calls a paid service. |
| F022 | training | Personal puzzle sets built from the player's own missed motifs (e.g., forks missed in their games). | player | Should | Lichess puzzle dashboard shows strengths and weaknesses by theme [s20]. Learn from your mistakes [s17]. | After import, a player with a clear weak theme gets 10 or more matching puzzles. |
| F023 | training | Personal puzzle-theme dashboard (success rate and trend per theme), framed as private feedback. | player, coach | Should | Lichess puzzle dashboard. Users call it "a tool, not a goal" [s20]. | Theme stats update after every session and are visible only to the player and coach. |
| F024 | training | Spaced-repetition review of missed puzzles and positions (misses come back after about 1, 3 and 7 days). | player | Should | Chessable intervals run from 4 h to 6 months and reset on a mistake [s37]. Practice testing and distributed practice are the highest-utility techniques [s87]. | A failed item reappears on schedule, and the review queue shows a count. |
| F025 | training | Woodpecker-style fixed set (50–150 puzzles) repeated in cycles, tracking time and accuracy each cycle. | player | Could | Woodpecker Method: repeat the same set faster each cycle [s82]. | The set records cycle number, total time and accuracy. Cycle 2 is visibly faster. |
| F026 | training | "Tournament-mode" puzzles: no timer, and the full line must be entered before the answer is checked. | player | Could | NSCF: "Solve problems mindfully … write down your solutions" [s69]. | The answer stays hidden until a full line is submitted. |
| F027 | training | Club puzzle race on the projector: everyone joins from a Chromebook or phone, results shown live. | player | Should | Lichess Puzzle Racer has "Race your friends" [s22]. ChessKid Puzzle Duel [s36]. Puzzle contests motivate [s70]. | 30 players join one race by code, and results display within 5 s of the end. |
| F028 | training | Endgame curriculum by rating band: <1000 basic mates; 1000–1199 opposition and rook pawns; 1200–1399 king-and-pawn; 1400–1599 Lucena, Philidor, opposite-coloured bishops. | player | Must | Silman's rating-class structure [s83]. Lichess Practice endgames [s21]. Coaches teach opposition and the rule of the square [s71]. | Each player sees their band's set, and completion is tracked before Oct 24. |
| F029 | training | Play out endgame positions against in-browser Stockfish until a win or draw is achieved. | player | Should | Lichess Practice exercises [s21]. Stockfish.js lite recommended [s44]. | K+R vs K practice runs smoothly on a Chromebook, and success is detected automatically. |
| F030 | training | Tablebase check for endgame drills (7 pieces or fewer) via Lichess's free tablebase API. | player | Could | Lichess tablebase endpoint needs no authentication [s10]. | Feedback labels the position win/draw/loss correctly in drill positions. |
| F031 | training | Mini-repertoire per player: one White system, one reply to 1.e4 and one to 1.d4, stored as a shallow tree with plans in words. | player, coach | Should | ChessMood: openings are 15% of study, focus on plans over memorisation [s41]. A review found openings matter least under 1400 [s39]. | Each line is about 8–10 moves or fewer, with a one-sentence plan, editable by the coach. |
| F032 | training | Short spaced-repetition drill of the player's own repertoire lines, capped per day. | player | Could | Chessable MoveTrainer [s37]. Clear reviews before adding new lines [s38]. | Only the player's lines are drilled, and daily review is capped at about 10 min. |
| F033 | training | Notation trainer: see a move and type its SAN, or read SAN and play it; timed. Includes castling, captures, promotions and disambiguation (Nbd7). | player | Must | Official scoresheets are required at scholastic events [s53]. Poorly written sheets take 10–20 min to transcribe [s84]. | A player records a 40-move game with at least 95% accuracy in the drill. |
| F034 | training | Coordinate / board-vision trainer. | player | Could | Lichess Learn includes coordinates [s2]. Heisman: "You can't play what you don't see" [s80]. | A 30-second square-naming quiz with a best-score history. |
| F035 | training | Thinking checklist shown during slow practice games (checks, captures, threats; blunder check before moving), with a self-rating afterwards. | player | Should | Heisman: "Real chess" versus "hope chess", and write the move down then sanity-check it [s80]. | The checklist appears in practice mode, and a post-game self-rating is saved. |
| F036 | training | Practise at the tournament's time control (e.g., G/30 d5 or G/60 d5) with scoresheets at Tuesday meetings or against the engine. | player | Must | A scholastic example uses G/60 d5 for grades 6–12 [s75]. Coaches report gains from "wait 5 seconds before making any move" [s73]. | At least two slow practice games per registered player before Oct 24. |
| F037 | training | On-screen two-sided chess clock with **delay** and increment, for Tuesdays when physical clocks run short. | coach, player | Could | US Chess guide recommends digital clocks [s56]. Delay controls are standard in scholastic play [s53]. | A d5 delay behaves correctly (time isn't deducted during the delay) on phone and Chromebook. |
| F038 | training | Weekly personal plan from the hours a player says they have, using a study/play/fix split for their level. | player | Could | ChessMood: 25/65/10 below 1000, and 35/55/10 for 1000–1500 [s40][s41]. | The plan fits the stated hours and lists this week's tasks. |
| F039 | training | Guess-the-move with an instructive master game each week. | player | Could | Coaches recommend going through historical games move by move [s72]. Lichess interactive lessons [s16]. | One game a week, scored per move, with the key ideas explained in text. |
| F040 | training | Play from any lesson or game position against the engine at adjustable strength. | player | Could | Stockfish.js runs in all modern browsers [s44]. | Works offline once the engine is cached, and strength is selectable. |
| F041 | training | Rules and etiquette quiz for US Chess scholastic play: touch-move, illegal move = +2 min to opponent, scorekeeping below 5 min, phones off, no talking to coaches, handshake. | player | Must | USCF vs FIDE differences [s55]. Device rules [s53]. Parents and coaches can't advise during games [s75]. Etiquette [s72]. | A 10-question quiz; 80% or more marks the player "rules ready". |
| F042 | training | Offline puzzle pack cached for weak home internet, synced later. | player | Could | **judgement**. | 50 puzzles solvable in airplane mode and synced on reconnect. |
| F043 | games & analysis | Automatic import of each member's Chess.com monthly archives and Lichess games (nightly, plus on demand). | coach, player | Must | Chess.com PubAPI archive and PGN endpoints need no auth [s27]. Lichess export with `since`, `perfType`, `clocks`, `evals`, `opening` [s8]. | The last 90 days for 30 members import on first run, with nightly updates. |
| F044 | games & analysis | Polite syncing: serial requests, ETag / If-Modified-Since, Lichess `since`, back off for a minute on HTTP 429. | coach | Must | Chess.com: serial requests are never rate-limited, ETag is supported [s27]. Lichess: one request at a time, wait a minute after 429 [s7]. | A nightly sync finishes with no 429s, and re-syncs fetch only new games. |
| F045 | games & analysis | Time-control filter: coaching views default to rapid and classical; bullet is excluded. | coach, player | Should | ChessMood: avoid bullet, minimum 3+2, prefer 5+3 up to 30+20 [s40][s41]. Lichess `perfType` filter [s8]. | Default reports exclude bullet, and a toggle shows it. |
| F046 | games & analysis | In-browser Stockfish (lite, single-threaded WASM) with an analysis queue so Chromebooks aren't frozen. | player, coach | Must | Stockfish.js lite (~7 MB) recommended as the best balance [s44]. | A 40-move game is analysed on a typical school Chromebook in about 2 min or less (**judgement** target), and the UI stays responsive. |
| F047 | games & analysis | Use Lichess cloud eval for cached positions (mostly openings) before running the local engine. | coach | Could | Cloud-eval endpoint needs no auth and returns cached positions only [s9]. | Opening positions resolve without local engine time when cached. |
| F048 | games & analysis | Store each game's analysis once in Postgres so no game is analysed twice. | coach | Should | **judgement**. | Re-opening an analysed game uses 0 engine time. |
| F049 | games & analysis | Classify mistakes by change in winning chances, not raw centipawns, with tolerance in the opening. | player, coach | Should | Lichess uses a non-linear winning-chance curve and checks against master games [s17]. | Small eval drops in already won or lost positions aren't flagged as blunders. |
| F050 | games & analysis | "Big blunders" view for players under 1500: only hung pieces, missed mates and missed tactics, at most about 5 per game. | player | Must | ChessMood: focus analysis on big blunders (undefended pieces, missed tactics, missed mates) [s40][s41]. | Each game shows 5 or fewer highlighted moments, each with its motif. |
| F051 | games & analysis | "Find the better move" retry drills from every mistake in the player's own games. | player | Must | Lichess: "It gives you a chance to rethink the position by yourself. That's how we learn." [s17] | Every analysed game produces retry exercises, and results feed F024. |
| F052 | games & analysis | Self-annotation first: the player marks critical moments and writes what they were thinking before engine lines appear. | player | Should | Heisman's *Improving Annotator* sets the player's own notes beside engine checks [s81]. Lichess "rethink by yourself" [s17]. **judgement** on the hiding rule. | Engine lines stay hidden until 3 or more comments are saved. Coach can turn this off per player. |
| F053 | games & analysis | Coach comments on specific moves that the player sees next time they open the game. | coach, player | Should | Lichess teachers ask for game commentary [s6]. ChessKid game-analysis tools [s33]. | A comment on move 17 appears with a badge on the player's next visit. |
| F054 | games & analysis | Time-use chart per game from `%clk` data, flagging blunders played quickly while plenty of time remained. | player, coach | Must | Lichess `clocks` export [s8]. Chess.com PGNs carry `[%clk]` [s26]. Heisman says use your time [s80]. "Wait 5 seconds" advice [s73]. | Chart shows seconds per move. Blunders made in under 5 s with more than 5 min left are flagged. |
| F055 | games & analysis | Personal trends: blunders per 100 moves, time-trouble rate, results by colour and time control, rating history. | player, coach | Should | Metrics players track [s86]. Lichess Insights dimensions [s18]. | 3-month trend lines per metric. |
| F056 | games & analysis | Opening results per player (as White and Black): frequency, score %, the move where they usually go wrong. | player, coach | Should | Lichess Insights by opening [s18]. | Top 5 openings per colour with score % and a typical error move. |
| F057 | games & analysis | Opening names and ECO codes on every game, from the CC0 Lichess dataset stored locally. | coach | Should | lichess-org/chess-openings is CC0 [s13]. | At least 95% of imported games get a name without an external call. |
| F058 | games & analysis | Club opening explorer built only from members' games: what our players face, and results by move. | coach | Could | NSCF: prepare for positions players will really get [s69]. The Lichess explorer now needs auth [s24]. | A move tree with counts and score % from club games only. |
| F059 | games & analysis | Repertoire deviation check: after each game, show where it left the player's repertoire and what followed. | player | Could | NSCF: after each game, go one move deeper in your lines [s69]. | The game view marks the first deviation move. |
| F060 | games & analysis | Automatic critical moments: 3–5 turning points per game for a quick review. | player, coach | Should | Lichess "Learn from your mistakes" picks moments that change the result [s17]. | 5 or fewer moments per game, each with the eval swing. |
| F061 | games & analysis | Tag the phase (opening, middlegame, endgame) where the decisive error happened. | coach | Could | Lichess export `division` marks middlegame and endgame [s8]. Insights by phase [s18]. | Each decisive game is tagged by phase, rolled up in F015. |
| F062 | games & analysis | Club game database search by player, opening, result, date, event and tag. | coach | Should | **judgement**. | "Our games as Black in the Italian" returns in under 10 s. |
| F063 | games & analysis | Game of the week: the coach flags an instructive member game (with the player's OK) for projector review. | coach | Should | US Chess guide encourages post-mortems [s56]. Coaches have students analyse their own games [s72]. | Flagged game opens in projector mode with coach notes. |
| F064 | games & analysis | PGN export (one or many games) and "open in Lichess" via the import endpoint. | coach, player | Should | Lichess import allows 100 anonymous games an hour [s11]. | Exported PGN re-imports into Lichess without errors. |
| F065 | games & analysis | OTB scoresheet entry: click moves or type SAN with legal-move autocomplete; the first illegal or ambiguous move is highlighted to fix. | player, coach | Must | OCR apps struggle with handwriting and need manual correction [s84]. Illegal moves on scoresheets confuse PGN entry [s85]. | A 40-move sheet is entered in under 5 min, and an illegal move is flagged at the exact ply. |
| F066 | games & analysis | Repair gaps: mark missing moves as unknown, set up the position from the board (FEN) and continue. | player, coach | Should | Scholastic sheets often have missing or wrong moves [s84][s85]. | A game with 2 unreadable moves can still be saved and analysed from move 20. |
| F067 | games & analysis | Optional compressed scoresheet photo stored next to the entered game for checking. | player | Could | Manual verification is essential [s84]. **judgement** on size caps. | Photo is 300 KB or less, viewable beside the moves, and can be deleted after checking. |
| F068 | games & analysis | OTB game tags: event, round, board, colour, result, time control, and an optional opponent (initials only). | coach | Must | **judgement**: needed for the event report (F090) and privacy (F119). | Every Oct 24 game has event and round tags. |
| F069 | games & analysis | Quick result log for Tuesday casual and club games (who, colour, result, time control). | coach, player | Should | Coaches keep club results for motivation [s70]. The US Chess guide's club rating uses these results [s56]. | Logging 15 boards takes under 2 min. |
| F070 | tournaments | Event calendar with Dallas ISD dates and deadlines (registration the Friday before event week; transport forms 3 weeks before) and reminders. | coach | Must | Dallas ISD chess page [s63]. | The Oct 24 event shows Fri Oct 16 registration and a transport-form deadline around Oct 2–3, with reminders 7 and 2 days before. |
| F071 | tournaments | Availability poll for each event (yes / no / maybe plus a transport note), answered at a meeting or on a phone. | coach, player | Must | **judgement**: needed to apply the Dallas ISD caps [s63]. | All 30 replies collected within one Tuesday. |
| F072 | tournaments | Registration helper enforcing Dallas ISD rules: up to 10 students per coach (2 coaches max), warning below 6 attendees, grade-section check. | coach | Must | Dallas ISD limits and stipend rule [s63]. Grade sections 9–10 and 11–12 in 2023 [s64]. | Selecting an 11th student for one coach shows a warning, and fewer than 6 shows the stipend warning. |
| F073 | tournaments | Registration export: names, grades and sections in the order the district form needs (copy or CSV). | coach | Should | Registration is through dallasisd.org/activities [s63]. | One click copies the list, and no fields are retyped. |
| F074 | tournaments | Per-player readiness checklist: rules quiz, notation drill, 2 slow games, endgame band set, mini-repertoire reviewed. | coach, player | Must | NSCF coach's prep guide [s69]. Tournament checklists [s78]. | By Tue Oct 20 the coach sees readiness % for every registered player. |
| F075 | tournaments | Mock tournament at club: 2–4 rounds at the event time control with scoresheets, over one or two Tuesdays. | coach | Must | US Chess guide: one club round a week [s56]. Tournaments hook students ("34 were hooked") [s70]. | At least two mock rounds are paired and completed before Oct 24. |
| F076 | tournaments | Club Swiss pairing following US Chess basics: score groups, top half vs bottom half, colour equalisation, bye to the lowest-rated in the lowest group, no repeat pairings. | coach | Must | US Chess rules 29A, 29C1, 29D1, 29E4–E5, 28L2 [s51]. An open-source engine (bbpPairings, FIDE Dutch; Apache-2.0 licence option) is an alternative [s45]. | The coach pairs a round of 30 players in under 1 min, with no repeat opponents and colours balanced within 1. |
| F077 | tournaments | Pairing overrides: swap boards, late entries, withdrawals, requested half-point byes, all logged. | coach | Must | SwissSys workflow [s46]. Lichess allows late joining [s14]. The US Chess guide says be flexible about late joiners [s56]. | A swap takes 2 taps, and bye type and reason are stored. |
| F078 | tournaments | Round-robin generator for small groups (e.g., beginners or placement). | coach | Could | Round robin for placement [s56]. SwissSys pairs round robins [s47]. | Correct schedules for 3–10 players, with a bye when the count is odd. |
| F079 | tournaments | Printable pairings, standings and wall chart in large type for the meeting room. | coach | Should | SwissSys prints pairings, standings and wall charts [s47]. | Fits on one page for 15 boards and is readable at 2 m. |
| F080 | tournaments | Tiebreak calculator using the US Chess set (modified median, Solkoff, cumulative, opposition cumulative, Sonneborn-Berger) and the scholastic team order. | coach | Could | Rule 34A (announce in advance) and 34E1–E12 [s52]. Scholastic individual and team tiebreak orders [s53]. WinTD help [s49]. Worked definitions [s62]. | Matches a hand-checked sample crosstable. |
| F081 | tournaments | Team-score projector for "top-N scores count" events, with N set to 3 or 4, live what-ifs each round and team tiebreak order. | coach | Must | Scholastic regs 10.2.1/10.2.2 (top 4 or top 3) and 12.3.2 team tiebreaks [s53]. "Only the top finishing scores … are summed" [s54]. | After each round the projected team score and rank update in under 1 s. |
| F082 | tournaments | Board-order tool for team-vs-team formats: descending rating, configurable tolerance, alternates, violations flagged. | coach | Must | USAT: highest rated on board 1 and fixed order [s59]. AIA allows 75/50-point tolerances [s60]. US Chess guide: strongest on board 1 [s56]. Match vs game points [s61]. | Given ratings, the tool proposes a legal order and flags an out-of-order lineup. |
| F083 | tournaments | Every displayed rating shows its source (US Chess, club, Chess.com rapid, Lichess rapid), with a coach-chosen source for seeding. | coach | Should | Comparing different rating systems "creates a gap with no clear meaning" [s77]. | Every rating shows a source label, and seeding uses the chosen source. |
| F084 | tournaments | Event time-control profile (e.g., G/60 d5) that sets the default for practice clocks and practice games. | coach | Should | Scholastic controls vary by event [s75][s53]. | Setting it once updates F036 and F037 defaults. |
| F085 | tournaments | Tournament-day result entry on the coach's phone: round, colour, result, opponent rating, one-line note. | coach | Must | Players record results on the pairing chart [s79]. **judgement**: the coach needs their own live record. | A round for 10 players is entered in under 1 min. |
| F086 | tournaments | Offline-first tournament mode: roster, entry forms and team projector work without signal and sync later. | coach | Must | **judgement**: gym Wi-Fi is unreliable, and only the coach's device is in use (phones are off in the hall [s53]). | Everything works in airplane mode, and a later sync loses nothing. |
| F087 | tournaments | Morning arrival check-in with alerts for anyone missing before round 1. | coach | Should | National scholastic regs added a 30-minute no-show forfeit [s54]. Parents must report late arrivals to the TD [s79]. | The list shows who has arrived, with an alert 15 min before round 1. |
| F088 | tournaments | One-minute between-round check-in (after leaving the hall): opening, time left, key moment, mood 1–5. | player, coach | Should | NSCF: brief analysis between rounds helps younger players; the coach should "transmit confidence" [s69]. | 5 fields or fewer, and the coach sees all check-ins in one list. |
| F089 | tournaments | Coach prompt cards for between rounds: reset after a loss, rest, eat, fresh air; no deep engine analysis. | coach | Could | NSCF team-room guidance [s69]. Keep routines simple [s74]. | Cards are available offline, one per situation. |
| F090 | tournaments | Post-tournament debrief report: per-player score, upsets, time-trouble incidents, one lesson each, team summary. | coach | Must | NSCF [s69]. US Chess guide post-mortems [s56]. | Generated within a day of all results and sheets being entered. |
| F091 | tournaments | Post-event review queue: every OTB game entered and analysed, and each player reviews one game with the coach. | coach, player | Must | NSCF on reviewing tournament games [s69]. | 100% of Oct 24 games entered by Sat Oct 31. |
| F092 | tournaments | Tournament history per player and per season (events, scores, placements). | coach | Should | **judgement**. The US Chess guide recognises improvement over time [s56]. | Every event is listed with score and placement. |
| F093 | tournaments | Link Lichess team Swiss/arena events or Chess.com club events created by the coach, and show their results in the app. | coach | Could | Lichess Swiss is restricted to teams and exports TRF [s14][s7]. Lichess Team Battles [s15]. Chess.com club Swiss/Arena [s30]. | After an online club event, standings appear in the app. |
| F094 | tournaments | TRF export of club Swiss events so pairings can be cross-checked with an open engine. | coach | Could | bbpPairings reads TRF [s45]. | The exported file is accepted by bbpPairings' checker. |
| F095 | tournaments | Store an optional US Chess ID and link to the official player lookup (no scraping). | coach | Could | US Chess player search [s57]. **judgement**: no public API was found. | The link opens the player's page. |
| F096 | motivation | Private personal-progress view: this month vs last month for ratings, puzzles solved, blunders per 100 moves and games analysed. No comparison with teammates. | player | Must | Rating obsession makes players "play not to lose" [s42]. Use rating comparisons only for concrete decisions [s77]. Low rankings trigger negative emotions that hurt less-competitive learners [s89]. | The home screen shows only the player's own changes and no other member's numbers. |
| F097 | motivation | Weekly (not daily) activity streak with automatic grace weeks and no shaming message when it breaks. | player | Should | Duolingo: a 7-day streak makes learners 3.6× more likely to finish; streak freezes raised daily activity; losing a streak can backfire [s91]. **judgement**: weekly suits a once-a-week club. | The streak survives 1 missed week per month, and no "you lost" message appears. |
| F098 | motivation | Effort badges (100 puzzles, 10 self-annotated games, first OTB tournament, notation ace, endgame band complete). None for beating teammates. | player | Should | Chesscademy points and badges [s43]. ChessKid milestone certificates [s35][s36]. | At least 15 badges, and a 600-rated player can earn every one through effort. |
| F099 | motivation | Opt-in challenge ladder where challenges are limited to 3 spots up. Only participants see it. | player | Should | US Chess guide: "allow challenges only within a certain number of available spots (3 or 5)" [s56]. Coaches use ladders [s71]. | Out-of-range challenges are blocked, and leaving the ladder takes one tap. |
| F100 | motivation | Shared team goal with a progress bar (e.g., "3,000 club puzzles before Oct 24"). | player, coach | Should | Gamification has a large effect on relatedness [s88]. A team focus drives engagement [s70]. | The bar updates automatically from in-app activity and shows on every player's home screen. |
| F101 | motivation | Monthly award suggestions in several categories: most improved, best upset, best newcomer, best annotated game, most homework, plus a coach-picked sportsmanship award. | coach | Should | US Chess guide: prizes for under-1200, newcomers, upsets, and awards based on rating improvement [s56]. | The app proposes candidates with the data behind each, and the coach approves on one screen. |
| F102 | motivation | Leaderboards only if opt-in, within a skill group, on effort metrics, showing the top 5 plus the player's own position. | player | Could | ChessKid weekly and monthly leaderboards [s32]. Effects vary with how competitive students are [s89] and with the user type [s90]. | Off by default. There's no full-club ranking by rating anywhere. |
| F103 | motivation | Fun-format scheduler: bughouse night, vote chess, consultation (team) games, coach simul, puzzle race, with automatic balanced team split. | coach, player | Should | Bughouse and speed events keep interest [s70][s71]. Split-class vote chess [s72]. Chess.com vote chess [s30]. Teachers ask Lichess for class simuls [s4]. | A fun session is set up in under 3 min, including balanced teams. |
| F104 | motivation | Club identity: name, colours, season theme and a records wall of past team results. | player | Could | Relatedness effect of gamification [s88]. **judgement**. | The club page lists past events and team placings. |
| F105 | motivation | Inter-club online matches: show the club's Chess.com club matches, upcoming and finished. | coach | Could | Chess.com club matches, where "your whole club wins or loses" [s29]. PubAPI club matches endpoint [s27]. ChessKid inter-school matches [s32]. | Matches appear automatically once the club's Chess.com ID is set. |
| F106 | motivation | Positive-only club feed of milestones (badges, personal bests). Never losses or rating drops. | player | Could | Duolingo milestone animations improved 7-day retention [s91]. **judgement** on excluding negatives. | The feed contains no losses or rating drops. |
| F107 | motivation | Choice in training: each week the player picks at least one task from 3 suggestions. | player | Should | Gamification has its strongest effect on autonomy after relatedness [s88]. | Every weekly plan includes a task the player chose. |
| F108 | motivation | Club OTB rating (Glicko-2 or simple club points). The coach sees all ratings; each player sees only their own. | coach, player | Should | Lichess uses Glicko-2 [s23]. Glicko-2 works best with 10–15 games per rating period [s94], so use long periods (**judgement**). US Chess guide's simple club points [s56]. | Updates after each logged club game, and the player view shows only the player's own rating. |
| F109 | motivation | Teen-appropriate look and tone (not cartoonish), with dark mode. | player | Should | High-school coaches pick Chess.com over ChessKid because ChessKid "is for little kids" [s31]. | 5 members asked informally rate it "not childish" (**judgement** test). |
| F110 | communication | Club announcement board: one-way from the coach, with pinned items, on the player home screen. | coach, player | Must | Lichess Class bulletin board [s1]. Chess.com club news [s30]. | A pinned announcement stays on top until unpinned. |
| F111 | communication | Parent update drafts: short, positive per-player summary (attendance, effort, one improvement, one way to help) for the coach to send through existing school channels. | coach, parent | Should | 69% of families want daily or weekly progress updates, and only 40% get regular guidance on how to help [s92]. US Chess guide recommends newsletters [s56]. | 30 drafts in under 5 min. The coach edits and copies each in one tap. |
| F112 | communication | Pre-tournament parent info sheet: date, venue, check-in, schedule, meals (the district provides breakfast and lunch), transport form, what to bring, no spectators in the hall, meeting point, pick-up, how results will be shared. | parent | Must | Dallas ISD page (meals, transport forms) [s63]. Parent guides [s76][s79]. No spectators in the playing hall [s53]. | One page, sent by Fri Oct 16. |
| F113 | communication | Post-tournament summary for families and school that automatically leaves out names and photos of students without a media release. | parent, coach | Should | Dallas ISD: don't post names or photos without a release on file [s68]. US Chess guide: "Names sell papers" [s56]. | The export contains no flagged student's name or photo. |
| F114 | communication | Media-release / directory opt-out flag respected by every export, printout and projector view of results. | coach | Must | Dallas ISD directory information and annual consent [s67]. Social media guidelines [s68]. | A test export with a flagged student shows initials only. |
| F115 | communication | Sponsor and school-staff term report: roster size, attendance, events, results, next dates. | coach | Could | Dallas ISD coach stipend depends on students attending [s63]. **judgement**. | A one-page PDF in one click. |
| F116 | communication | Calendar export (.ics) of meetings and tournaments. | player, parent | Should | 62% of families say a central hub would make school communication easier [s92]. | The .ics file imports into Google Calendar with correct Central times. |
| F117 | communication | Weekly digest plus event reminders (1 week and 1 day before), drafted automatically for the coach to approve. | coach, player, parent | Should | Families prefer email (72%) and text (70%) [s92]. **judgement** on the weekly cadence. | The digest is drafted every Monday, and sending takes one tap. |
| F118 | communication | Printable QR handouts that open this week's assignment, for members without reliable devices. | player | Could | US Chess guide uses flyers and printed material [s56]. **judgement**. | The printed QR opens the assignment on a phone or Chromebook camera. |
| F119 | communication | Tournament packing and conduct list: pen, water, snack, warm layer, phone switched off in a bag, arrive early. | player, parent | Should | Tournament checklist [s78]. Device rules [s53]. | A printable one-pager sent with F112. |
| F120 | admin | Data minimisation and yearly clean-up: archive graduates by deleting personal fields and keeping anonymised stats. | coach | Must | SCOPE Act: "limit the collection and use of a minor's personally identifiable information" [s93]. The brief. | One-click archive removes graduates' names and usernames. |
| F121 | admin | Private by default: no public pages or profiles, `noindex` on all pages, no student data in shareable URLs. | coach | Must | SCOPE Act covers services with public or semi-public profiles and user posts [s93]. Lichess managed student accounts default to kid mode [s1][s3]. | Pages carry noindex, and no URL outside the app's existing access shows student data. |
| F122 | admin | Check usernames on entry (Chess.com profile and Lichess user exist). | coach | Should | PubAPI returns 404 for unknown players [s27]. | A mistyped username is flagged immediately. |
| F123 | admin | Free-tier budget guard: store PGN text and summary evals rather than full engine output, cap photo size, show database size. | coach | Should | **judgement**. | Settings shows current size and a projection that a year of 30 members' data fits the chosen free tier. |
| F124 | admin | Load a puzzle subset (e.g., rated 400–2000, popular, every theme) rather than all 6.1M puzzles. | coach | Should | Lichess database size and fields (Rating, Popularity, Themes) [s12]. **judgement** on the subset. | Every theme has 200 or more puzzles in the 600–1600 range. |
| F125 | admin | Full data export (CSV + PGN) and restore, so the club survives a change of coach. | coach | Should | **judgement**. | Exporting and importing into an empty instance restores roster, games and history. |
| F126 | admin | Season roll-over: close a season, keep its history, reset goals and ladders. | coach | Could | ChessKid's planner can be reset each term [s35]. | A new season starts in one step with history intact. |
| F127 | admin | Works on phones (360 px wide) and school Chromebooks: keyboard navigation, large touch targets, colour-blind-safe highlights. | player, coach | Must | The brief (phones and Chromebooks). **judgement**. | Every core flow can be completed on a 360 px phone and with a Chromebook keyboard. |
| F128 | admin | Light first load: the engine and puzzle packs load only when needed, then stay cached. | coach | Should | Stockfish.js sizes: lite about 7 MB, full over 100 MB [s44]. | Non-analysis pages load without downloading the engine. |
| F129 | admin | Licence and IP page: Stockfish GPL-3.0 source link, CC0 data credits, no Chess.com board or piece assets. | coach | Should | Stockfish.js is GPL-3.0 [s44]. PubAPI asks users to respect Chess.com IP [s27]. Lichess data is CC0 [s12][s13]. | The About page lists licences, and the bundle has no Chess.com assets. |
| F130 | admin | "Last synced" labels that explain delays (Chess.com data can lag up to 12–24 h). | player, coach | Could | PubAPI caches refresh at most every 12 or 24 hours [s27]. | Every view of imported data shows its sync time. |

## 3. Tournament-day checklist (W.T. White HS, Sat 24 Oct 2026)

**Format is unknown, so prepare for both.** (a) *Individual Swiss where the school's top N scores
count* [s53][s54]: board order doesn't matter, so get as many strong, reliable players there as
possible and keep everyone playing every round, because each half-point can count (F081).
(b) *Team-vs-team matches*: lineup in rating order within the event's tolerance, with alternates,
submitted by the coach (F082) [s59][s60][s61]. Confirm which applies, plus the time control and
notation rule, with the high-school contact on the Dallas ISD chess page [s63] as early as
possible.

### Before

- [ ] **Tue 29 Sep (meeting)**: availability poll (F071); start readiness checklists (F074); rules and etiquette quiz (F041); ask the district about format, time control and notation.
- [ ] **By Fri 2 Oct**: transportation forms are due 3 weeks before the event [s63] (F070 reminder).
- [ ] **Tue 6 Oct**: mock round 1 at the expected time control with paper scoresheets (F075, F036, F084); players enter their own scoresheets afterwards (F065); assign endgame band sets (F028) and notation drills (F033).
- [ ] **Tue 13 Oct**: mock round 2; select registrants with the helper (F072): 10 or fewer per coach, 6 or more expected to attend, grade sections checked; project the team score (F081) or draft the board order (F082).
- [ ] **Fri 16 Oct**: registration closes, so export the list (F073) [s63].
- [ ] **Tue 20 Oct**: light final session. Players do big-blunder retry drills from their mock and online games (F051) and review their time use (F054). The coach checks readiness % (F074). No new openings this week (**judgement**, in line with [s41]). Send the parent info sheet (F112) and packing list (F119).
- [ ] **Fri 23 Oct**: coach syncs offline tournament mode (F086), checks the roster and emergency contact plan, charges the phone.

### During (Sat 24 Oct)

- [ ] Arrival check-in (F087). The national no-show rule is 30 minutes [s54], so check the local rule.
- [ ] Remind players that phones must be switched off and bagged, or placed face-up and off, and that the app is not used in the playing hall [s53].
- [ ] Each round: once players have left the hall, the coach enters results (F085) and players fill the 1-minute check-in (F088). Update the team projection (F081).
- [ ] Between rounds: newer players look briefly at one key moment. Stronger players rest; no deep engine analysis [s69]. Use prompt cards (F089). Keep the team area calm; players eat, drink and get air [s69].
- [ ] Make sure every player keeps their scoresheet (or a copy, if the event gives copies) for entry later (**judgement**).
- [ ] End of day: record final standings, team placing and awards (F092). Photos only of students with a media release (F114) [s68].

### After

- [ ] **Sun 25 Oct**: sync offline data (F086); open the review queue (F091).
- [ ] **Tue 27 Oct (meeting)**: players enter their own scoresheets at about 5 minutes each (F065, F066); analysis runs in the background (F046). Debrief using the event report and club weaknesses (F090, F015). Suggest awards (F101).
- [ ] **By Sat 31 Oct**: every Oct 24 game entered and each player has reviewed one game with the coach (F091). Send the families and school summary with the media-release filter applied (F113). Adjust the curriculum map for the spring tournament (F007).

## 4. Things to avoid

| Looks good | Why it hurts this club | Evidence |
|---|---|---|
| A club-wide rating leaderboard ranking all 30 members | Low rankings create negative emotions that cut motivation for less-competitive students [s89]. Rating fixation makes players "play not to lose" [s42]. Comparing ratings from different systems means little [s77]. It works against goal 3 (keep it fun). | [s89][s42][s77] |
| Daily streaks with "you lost your streak" messages | Losing a streak can demotivate [s91]. A once-a-week club with homework can't expect daily play (**judgement**). Use weekly streaks with grace (F097). | [s91] |
| Opening-memorisation courses for 600–1400 players | Openings are 15% of study for 1000–1500 players [s41]. Heavy spaced repetition of lines gives "the illusion of progress" and correct moves players can't explain [s39]. | [s39][s41] |
| Showing the engine eval bar and best moves as soon as a game opens | Players should rethink positions themselves first [s17][s81]. An always-visible engine turns review into passive reading (**judgement**). | [s17][s81] |
| Accuracy %, or theme ratings, used as grades | Users call the puzzle dashboard "a tool, not a goal", and theme ratings can't be compared across themes [s20]. Grading on them invites gaming and discouragement (**judgement**). | [s20] |
| Using the app at the board (notation, clocks, notes) during OTB games | Official paper scoresheets are required, and devices must be off during play [s53]. Even having one in the hall can cost a game. | [s53] |
| Student-to-student messages, chat, social feed or public profiles | Lichess teachers flag private student chats as a bullying risk they can't see [s2]. Texas's SCOPE Act targets services with public profiles and user posts; there is an education-services exemption [s93], but avoiding social features sidesteps the question (**judgement**, not legal advice). | [s2][s93] |
| Posting names, photos or results publicly without checking media releases | Dallas ISD guidelines say not to post names or photos without a release on file [s68]. | [s67][s68] |
| Scouting opponents from other schools (looking up other teens' online games) | Pairings often come out just before the round [s74], so prep time is minimal. Profiling other schools' minors is a privacy problem (**judgement**). | [s74] |
| Paid AI "coach explanations" or paid scoresheet OCR | Breaks the free-to-run rule. Chess.com sells coach explanations only on its top tier [s28]. OCR still needs heavy manual correction [s84]. | [s28][s84] |
| Rebuilding a rated tournament-director suite (US Chess rating reports, prize engines) | Mature tools exist (SwissSys $99.95, Swiss-Manager €75–150, WinTD) [s47][s50][s48], and the district runs its own event. A club Swiss (F076) is enough (**judgement**). | [s47][s48][s50] |
| Hosting live online games inside the app | Lichess and Chess.com already offer free Swiss, arena and team events [s14][s15][s30]. Building live play adds fair-play and safety work for one coach (**judgement**). | [s14][s15][s30] |
| Making every student connect their Lichess or Chess.com account (OAuth) | Adds the account and permission flows the brief excludes. The public endpoints already give games, clocks, openings and ratings [s8][s27]. | [s8][s27] |
| Depending on the Lichess opening explorer API | It has required authentication since 2026 [s24][s25][s58]. Use the CC0 opening names and a club-only explorer (F057, F058). | [s24][s25] |
| Shipping the full 100 MB+ Stockfish or all 6.1M puzzles to Chromebooks | The lite engine is about 7 MB and recommended [s44]. A puzzle subset covers the 600–1600 range (F124). | [s12][s44] |
| Parallel bulk API requests to "speed up" imports | Chess.com rate-limits parallel requests with 429s; Lichess asks for one request at a time [s27][s7]. | [s7][s27] |
| Features that need the coach to type data every day | One volunteer coach. Automation (F020, F043) beats manual logs (**judgement**, from the brief). | the brief |
| A cartoonish, kid-style look | High-school coaches steer teens away from ChessKid because it is for younger kids [s31]. | [s31] |
| Many separate notifications | Families want regular updates but prefer one hub [s92]. A single weekly digest (F117) avoids noise (**judgement**). | [s92] |

## 5. Sources

Products and data
- [s1] Lichess, *Lichess Class* — https://lichess.org/page/class
- [s2] Lichess forum, "Lichess Class – Teachers need this feature" — https://lichess.org/forum/lichess-feedback/lichess-class-teachers-need-this-feature
- [s3] Lichess forum, "Lichess Classes – students in kid mode and lesson tracking" — https://lichess.org/forum/lichess-feedback/lichess-classes-students-in-kid-mode-and-lesson-tracking
- [s4] Lichess forum, "Feature request for Lichess Classes: simultaneous exhibitions" — https://lichess.org/forum/lichess-feedback/feature-request-for-lichess-classes-simultaneous-exhibitions-between-teacher-and-students
- [s5] Lichess forum, "Lichess class and team feature request" — https://lichess.org/forum/lichess-feedback/lichess-class-and-team-feature-request
- [s6] Lichess forum, "Feature requests for teachers/kids" — https://lichess.org/forum/lichess-feedback/feature-requests-for-teacherskids
- [s7] Lichess API documentation — https://lichess.org/api
- [s8] Lichess API spec, "Export games of a user" — https://github.com/lichess-org/api/blob/master/doc/specs/tags/games/api-games-user-username.yaml
- [s9] Lichess API spec, "Cloud evaluation" — https://github.com/lichess-org/api/blob/master/doc/specs/tags/analysis/api-cloud-eval.yaml
- [s10] Lichess API spec, "Tablebase lookup" — https://github.com/lichess-org/api/blob/master/doc/specs/tags/tablebase/standard.yaml
- [s11] Lichess API spec, "Import one game" — https://github.com/lichess-org/api/blob/master/doc/specs/tags/games/api-import.yaml
- [s12] Lichess open database (puzzles, evaluations; CC0) — https://database.lichess.org/
- [s13] lichess-org/chess-openings (CC0 opening names) — https://github.com/lichess-org/chess-openings
- [s14] Lichess, Swiss tournaments FAQ — https://lichess.org/swiss
- [s15] Lichess, Team Battle FAQ — https://lichess.org/page/team-battle-faq
- [s16] Lichess blog, "Interactive lessons" — https://lichess.org/@/lichess/blog/interactive-lessons/WtDErSQA
- [s17] Lichess blog, "Learn from your mistakes" — https://lichess.org/blog/WFvLpiQAACMA8e9D/learn-from-your-mistakes
- [s18] Lichess blog, "Chess Insights" — https://lichess.org/@/lichess/blog/chess-insights/VmZbaigA
- [s19] Lichess, puzzle themes — https://lichess.org/training/themes
- [s20] Lichess forum, "With the new(ish) puzzle dashboard…" — https://lichess.org/forum/general-chess-discussion/with-the-newish-lichess-puzzle-dashboard-does-anyone-else-find-a-big-difference-in-theme-strength
- [s21] Lichess Practice — https://lichess.org/practice
- [s22] Lichess Puzzle Racer — https://lichess.org/racer
- [s23] Lichess FAQ (Glicko-2 ratings) — https://lichess.org/faq
- [s24] Lichess forum, "The opening explorer now requires authentication" — https://lichess.org/forum/community-blog-discussions/ublog-FSWh9Zg3
- [s25] GitHub issue noting the 2026 opening-explorer authentication change — https://github.com/aaweaver-actuary/tempo/issues/3
- [s26] Lichess forum, "chess.com PGN timestamps…" (confirms `[%clk]` in Chess.com PGNs) — https://lichess.org/forum/lichess-feedback/chesscom-pgn-timestamps-dont-work-on-lichess
- [s27] Chess.com, Published-Data API — https://www.chess.com/news/view/published-data-api
- [s28] Chess.com Help, "What does each level of Premium membership get me?" — https://support.chess.com/en/articles/8562418-what-does-each-level-of-premium-membership-get-me
- [s29] Chess.com Help, "What are Club Matches?" — https://support.chess.com/en/articles/8649115-what-are-club-matches
- [s30] Chess.com, "Run chess events online" — https://www.chess.com/article/view/how-to-run-chess-events-online
- [s31] Chess.com forum, "Starting high school chess club… Chess.com or ChessKid.com?" — https://www.chess.com/forum/view/scholastic-chess/starting-high-school-chess-club--chesscom-or-chesskidcom
- [s32] ChessKid Help, "What are the special features available to schools & groups?" — https://support.chesskid.com/en/articles/8864339-coach-school-what-are-the-special-features-available-to-schools-groups
- [s33] ChessKid, "Chess coaching for kids with ChessKid features" — https://www.chesskid.com/learn/articles/chess-coaching-for-kids
- [s34] ChessKid, "How middle and high school students use ChessKid" — https://www.chesskid.com/learn/articles/how-middle-and-high-school-students-use-chesskid
- [s35] ChessKid, "How to use the ChessKid Classroom Planner" — https://www.chesskid.com/learn/articles/how-to-use-the-chesskid-classroom-planner
- [s36] ChessKid, "The complete guide to ChessKid.com features" — https://www.chesskid.com/learn/articles/complete-guide-to-chesskid
- [s37] Chessable Help, "How does the spaced repetition scheduling work?" — https://support.chessable.com/en/articles/9043598-how-does-the-spaced-repetition-scheduling-work
- [s38] Chessable blog, "Using spaced repetition intelligently" — https://www.chessable.com/blog/using-spaced-repetition-intelligently/
- [s39] CheckmateX, "Chessable review — I tried it for 30 days" — https://checkmatex.app/blog/chessable-review-i-tried-it-for-30-days
- [s40] ChessMood, "Study plan below 1000" — https://chessmood.com/chess-study-plans/for-beginners
- [s41] ChessMood, "Study plan 1000–1500" — https://chessmood.com/chess-study-plans/for-intermediate-players
- [s42] ChessMood blog, "The rating obsession: why it's ruining your progress" — https://chessmood.com/blog/the-rating-obsession-ruining-your-progress
- [s43] Chess.com blog, "Chesscademy, a fun and free way to learn chess" — https://www.chess.com/blog/Matetricks/chesscademy-a-fun-and-free-way-to-learn-chess
- [s44] nmrugg/stockfish.js (engine flavours, sizes, GPL-3.0) — https://github.com/nmrugg/stockfish.js
- [s45] bbpPairings (Dutch/Burstein Swiss pairing engine) — https://github.com/BieremaBoyzProgramming/bbpPairings
- [s46] SwissSys documentation, "Running a tournament" — https://docs.chessroster.com/swisssys/app-docs/getting-started/running-a-tournament/
- [s47] US Chess Sales, SwissSys Tournament Director Software — https://www.uscfsales.com/products/swisssys-tournament-director-software-27218
- [s48] WinTD home page — https://estima.com/chess/
- [s49] WinTD help, "Tie breaker (US Chess rules)" — https://estima.com/chess/wintdhelp/topics/tiebreakersuschess.html
- [s50] Swiss-Manager home page — https://swiss-manager.at/

Rules and tournaments
- [s51] US Chess, *Official Rules of Chess* 7th ed., Chapter 2 (pairing rules 27–29) — https://new.uschess.org/sites/default/files/media/documents/us-chess-rule-book-online-only-edition-chp-2-1-1-20.pdf
- [s52] US Chess, *Official Rules of Chess* 7th ed., Chapter 2 rev. 8/24/20 (Rule 34 tiebreaks) — https://new.uschess.org/sites/default/files/media/documents/us-chess-rule-book-online-only-edition-7-chp-2-8-24-20.pdf
- [s53] US Chess, *National Scholastic Chess Tournament Regulations 2025–26* — https://new.uschess.org/sites/default/files/media/documents/scholregs_2025-26-v-1.0a.pdf
- [s54] US Chess, "Just the Rules: Scholastic Chess Regulations" — https://new.uschess.org/news/just-rules-scholastic-chess-regulations
- [s55] Peoria Chess, "FIDE vs USCF rules" — https://www.peoriachess.com/USCFvsFIDE.html
- [s56] US Chess, *A Guide to Scholastic Chess* (11th ed., rev. 2021) — https://new.uschess.org/sites/default/files/media/documents/11th-edition-guide-to-scholastic-chess-6-29-21.pdf
- [s57] US Chess, Player Search — https://new.uschess.org/players/search
- [s58] Lichess forum, "Why has Lichess now locked the opening explorer behind an account wall?" — https://lichess.org/forum/lichess-feedback/why-has-lichess-now-locked-the-opening-explorer-behind-an-account-wall
- [s59] Chess Weekend, "US Amateur Team North rules" (board order) — https://www.chessweekend.com/us-amateur-team-north-rules
- [s60] Arizona Interscholastic Association, Article 37 Chess 2026–27 (board order tolerance) — https://aiaonline.org/files/87/article-37-chess.pdf
- [s61] ChessPairings.org, "Team chess tournaments: rules, formats & tiebreaks" — https://chesspairings.org/en/guide/team-tournaments/
- [s62] Madison City Chess League, "Tiebreak rules" — https://madisonchess.com/tiebreakrules

Dallas ISD and privacy
- [s63] Dallas ISD, Academic Competitions — Chess (2026–27 schedule, limits, deadlines) — https://www.dallasisd.org/departments/student-activities/academic-competitions/chess
- [s64] Dallas ISD The Hub, "Dallas ISD students compete in districtwide fall chess tournaments" (2023) — https://thehub.dallasisd.org/2023/11/17/dallas-isd-students-compete-in-districtwide-fall-chess-tournaments/
- [s65] Dallas ISD News Archive, "Top district players compete in districtwide chess tournament" (2018) — https://thehub.dallasisd.org/dallas-isd-news-archives/dallas-isd-news-archives-post-page/~board/dallas-isd-news-archives/post/top-district-players-compete-in-districtwide-chess-tournament
- [s66] Dallas ISD Staff News, "Dallas ISD chess tournaments hit record-breaking participation numbers" (2023) — https://staff.dallasisd.org/2023/01/05/dallas-isd-chess-tournaments-hit-record-breaking-participation-numbers/
- [s67] Dallas ISD, FERPA notice of release of information — https://www.dallasisd.org/departments/legal-services/ferpa-notice-of-release-of-information
- [s68] Dallas ISD, Social media guidelines — https://www.dallasisd.org/departments/communication-services/communication-services/social-digital-media/social-media-guidelines

Coaching practice
- [s69] National Scholastic Chess Foundation, "Tournament prep – a coach's guide" — https://nscfchess.org/tournament-prep-a-coachs-guide/
- [s70] Chess.com forum, "How do you run your school chess club?" — https://www.chess.com/forum/view/scholastic-chess/how-do-you-run-your-school-chess-club
- [s71] Chess.com forum, "How to build a strong chess team" — https://www.chess.com/forum/view/general/how-to-build-a-strong-chess-team
- [s72] Chess.com forum, "Chess team instruction" — https://www.chess.com/forum/view/general/chess-team-instruction
- [s73] Chess.com forum, "Popular time control is G30/D5 — best time management strategy for kids?" — https://www.chess.com/forum/view/scholastic-chess/popular-time-control-is-g30-d5-what-is-the-best-time-management-strategy-for-kids-t
- [s74] Chess Tournament Guide, "Chess pre-game routine" — https://chesstournamentguide.com/tournament-guide/chess-pre-game-routine/
- [s75] Chess Tournament Guide, "What is a scholastic chess tournament?" — https://chesstournamentguide.com/tournament-guide/what-is-a-scholastic-chess-tournament/
- [s76] Chess Tournament Guide, "Your child's first chess tournament" — https://chesstournamentguide.com/parents/your-childs-first-chess-tournament/
- [s77] Chess Tournament Guide, "Everyone else's kid is higher rated. Should I worry?" — https://chesstournamentguide.com/parents/everyone-elses-kid-is-higher-rated/
- [s78] ChessWorld, "Chess tournament prep adviser & checklist" — https://www.chessworld.net/chessclubs/openingguide/what-to-bring-to-chess-tournament.asp
- [s79] The Chess Refinery, "Parent guidelines" — https://www.thechessrefinery.org/parent-guidelines.html
- [s80] Dan Heisman, "Thought process principles" — https://www.danheisman.com/thought-process-principles.html
- [s81] Dan Heisman, *The Improving Annotator* — https://www.danheisman.com/the-improving-annotator.html
- [s82] Forward Chess, "What is the Woodpecker Method?" — https://forwardchess.com/blog/what-is-the-woodpecker-method/
- [s83] Library of Congress, table of contents of *Silman's Complete Endgame Course* — https://catdir.loc.gov/catdir/toc/ecip076/2006037884.html
- [s84] US Chess forum, "Scoresheet PGN/OCR scanning software?" — https://forum.uschess.org/t/scoresheet-pgn-ocr-scanning-software/54690
- [s85] Chess.com forum, "During a tournament, how to make sense of illegal PGN?" — https://www.chess.com/forum/view/general/during-a-tournament-how-to-make-sense-of-illegal-pgn
- [s86] Chess.com forum, "Progress metrics and tracking tools" — https://www.chess.com/forum/view/general/progress-metrics-and-tracking-tools
- [s87] Dunlosky et al., "Strengthening the student toolbox" (*American Educator*, 2013) — https://www.aft.org/ae/fall2013/dunlosky

Motivation and communication
- [s88] Li, Ma & Shi (2023), "Gamification enhances student intrinsic motivation, perceptions of autonomy and relatedness, but minimal impact on competency: a meta-analysis", *ETR&D* — https://link.springer.com/article/10.1007/s11423-023-10337-7
- [s89] "Personalization in educational gamification: learners with different trait competitiveness benefit differently from rankings on leaderboards", *Computers & Education* (2024) — https://www.sciencedirect.com/science/article/abs/pii/S0360131524002100
- [s90] Kloc, Belo & Li (2024), "Climbing the ladder or falling behind: the role of leaderboard" — https://rodrigobelo.com/assets/pdf/leaderboards.pdf
- [s91] Duolingo blog, "How Duolingo streak builds habit" — https://blog.duolingo.com/how-duolingo-streak-builds-habit
- [s92] SchoolStatus, "National survey: what K-12 families really want from school comms" — https://www.schoolstatus.com/blog/national-survey-k12-communications-preferences
- [s93] Texas Attorney General, "Securing Children Online through Parental Empowerment (SCOPE) Act" — https://www.texasattorneygeneral.gov/consumer-protection/file-consumer-complaint/consumer-privacy-rights/securing-children-online-through-parental-empowerment
- [s94] Glickman, "Example of the Glicko-2 system" — http://www.glicko.net/glicko/glicko2.pdf

Also used: `BRIEF.md` in this folder (club facts, constraints).

<!-- link definitions -->
[s1]: https://lichess.org/page/class
[s2]: https://lichess.org/forum/lichess-feedback/lichess-class-teachers-need-this-feature
[s3]: https://lichess.org/forum/lichess-feedback/lichess-classes-students-in-kid-mode-and-lesson-tracking
[s4]: https://lichess.org/forum/lichess-feedback/feature-request-for-lichess-classes-simultaneous-exhibitions-between-teacher-and-students
[s5]: https://lichess.org/forum/lichess-feedback/lichess-class-and-team-feature-request
[s6]: https://lichess.org/forum/lichess-feedback/feature-requests-for-teacherskids
[s7]: https://lichess.org/api
[s8]: https://github.com/lichess-org/api/blob/master/doc/specs/tags/games/api-games-user-username.yaml
[s9]: https://github.com/lichess-org/api/blob/master/doc/specs/tags/analysis/api-cloud-eval.yaml
[s10]: https://github.com/lichess-org/api/blob/master/doc/specs/tags/tablebase/standard.yaml
[s11]: https://github.com/lichess-org/api/blob/master/doc/specs/tags/games/api-import.yaml
[s12]: https://database.lichess.org/
[s13]: https://github.com/lichess-org/chess-openings
[s14]: https://lichess.org/swiss
[s15]: https://lichess.org/page/team-battle-faq
[s16]: https://lichess.org/@/lichess/blog/interactive-lessons/WtDErSQA
[s17]: https://lichess.org/blog/WFvLpiQAACMA8e9D/learn-from-your-mistakes
[s18]: https://lichess.org/@/lichess/blog/chess-insights/VmZbaigA
[s19]: https://lichess.org/training/themes
[s20]: https://lichess.org/forum/general-chess-discussion/with-the-newish-lichess-puzzle-dashboard-does-anyone-else-find-a-big-difference-in-theme-strength
[s21]: https://lichess.org/practice
[s22]: https://lichess.org/racer
[s23]: https://lichess.org/faq
[s24]: https://lichess.org/forum/community-blog-discussions/ublog-FSWh9Zg3
[s25]: https://github.com/aaweaver-actuary/tempo/issues/3
[s26]: https://lichess.org/forum/lichess-feedback/chesscom-pgn-timestamps-dont-work-on-lichess
[s27]: https://www.chess.com/news/view/published-data-api
[s28]: https://support.chess.com/en/articles/8562418-what-does-each-level-of-premium-membership-get-me
[s29]: https://support.chess.com/en/articles/8649115-what-are-club-matches
[s30]: https://www.chess.com/article/view/how-to-run-chess-events-online
[s31]: https://www.chess.com/forum/view/scholastic-chess/starting-high-school-chess-club--chesscom-or-chesskidcom
[s32]: https://support.chesskid.com/en/articles/8864339-coach-school-what-are-the-special-features-available-to-schools-groups
[s33]: https://www.chesskid.com/learn/articles/chess-coaching-for-kids
[s34]: https://www.chesskid.com/learn/articles/how-middle-and-high-school-students-use-chesskid
[s35]: https://www.chesskid.com/learn/articles/how-to-use-the-chesskid-classroom-planner
[s36]: https://www.chesskid.com/learn/articles/complete-guide-to-chesskid
[s37]: https://support.chessable.com/en/articles/9043598-how-does-the-spaced-repetition-scheduling-work
[s38]: https://www.chessable.com/blog/using-spaced-repetition-intelligently/
[s39]: https://checkmatex.app/blog/chessable-review-i-tried-it-for-30-days
[s40]: https://chessmood.com/chess-study-plans/for-beginners
[s41]: https://chessmood.com/chess-study-plans/for-intermediate-players
[s42]: https://chessmood.com/blog/the-rating-obsession-ruining-your-progress
[s43]: https://www.chess.com/blog/Matetricks/chesscademy-a-fun-and-free-way-to-learn-chess
[s44]: https://github.com/nmrugg/stockfish.js
[s45]: https://github.com/BieremaBoyzProgramming/bbpPairings
[s46]: https://docs.chessroster.com/swisssys/app-docs/getting-started/running-a-tournament/
[s47]: https://www.uscfsales.com/products/swisssys-tournament-director-software-27218
[s48]: https://estima.com/chess/
[s49]: https://estima.com/chess/wintdhelp/topics/tiebreakersuschess.html
[s50]: https://swiss-manager.at/
[s51]: https://new.uschess.org/sites/default/files/media/documents/us-chess-rule-book-online-only-edition-chp-2-1-1-20.pdf
[s52]: https://new.uschess.org/sites/default/files/media/documents/us-chess-rule-book-online-only-edition-7-chp-2-8-24-20.pdf
[s53]: https://new.uschess.org/sites/default/files/media/documents/scholregs_2025-26-v-1.0a.pdf
[s54]: https://new.uschess.org/news/just-rules-scholastic-chess-regulations
[s55]: https://www.peoriachess.com/USCFvsFIDE.html
[s56]: https://new.uschess.org/sites/default/files/media/documents/11th-edition-guide-to-scholastic-chess-6-29-21.pdf
[s57]: https://new.uschess.org/players/search
[s58]: https://lichess.org/forum/lichess-feedback/why-has-lichess-now-locked-the-opening-explorer-behind-an-account-wall
[s59]: https://www.chessweekend.com/us-amateur-team-north-rules
[s60]: https://aiaonline.org/files/87/article-37-chess.pdf
[s61]: https://chesspairings.org/en/guide/team-tournaments/
[s62]: https://madisonchess.com/tiebreakrules
[s63]: https://www.dallasisd.org/departments/student-activities/academic-competitions/chess
[s64]: https://thehub.dallasisd.org/2023/11/17/dallas-isd-students-compete-in-districtwide-fall-chess-tournaments/
[s65]: https://thehub.dallasisd.org/dallas-isd-news-archives/dallas-isd-news-archives-post-page/~board/dallas-isd-news-archives/post/top-district-players-compete-in-districtwide-chess-tournament
[s66]: https://staff.dallasisd.org/2023/01/05/dallas-isd-chess-tournaments-hit-record-breaking-participation-numbers/
[s67]: https://www.dallasisd.org/departments/legal-services/ferpa-notice-of-release-of-information
[s68]: https://www.dallasisd.org/departments/communication-services/communication-services/social-digital-media/social-media-guidelines
[s69]: https://nscfchess.org/tournament-prep-a-coachs-guide/
[s70]: https://www.chess.com/forum/view/scholastic-chess/how-do-you-run-your-school-chess-club
[s71]: https://www.chess.com/forum/view/general/how-to-build-a-strong-chess-team
[s72]: https://www.chess.com/forum/view/general/chess-team-instruction
[s73]: https://www.chess.com/forum/view/scholastic-chess/popular-time-control-is-g30-d5-what-is-the-best-time-management-strategy-for-kids-t
[s74]: https://chesstournamentguide.com/tournament-guide/chess-pre-game-routine/
[s75]: https://chesstournamentguide.com/tournament-guide/what-is-a-scholastic-chess-tournament/
[s76]: https://chesstournamentguide.com/parents/your-childs-first-chess-tournament/
[s77]: https://chesstournamentguide.com/parents/everyone-elses-kid-is-higher-rated/
[s78]: https://www.chessworld.net/chessclubs/openingguide/what-to-bring-to-chess-tournament.asp
[s79]: https://www.thechessrefinery.org/parent-guidelines.html
[s80]: https://www.danheisman.com/thought-process-principles.html
[s81]: https://www.danheisman.com/the-improving-annotator.html
[s82]: https://forwardchess.com/blog/what-is-the-woodpecker-method/
[s83]: https://catdir.loc.gov/catdir/toc/ecip076/2006037884.html
[s84]: https://forum.uschess.org/t/scoresheet-pgn-ocr-scanning-software/54690
[s85]: https://www.chess.com/forum/view/general/during-a-tournament-how-to-make-sense-of-illegal-pgn
[s86]: https://www.chess.com/forum/view/general/progress-metrics-and-tracking-tools
[s87]: https://www.aft.org/ae/fall2013/dunlosky
[s88]: https://link.springer.com/article/10.1007/s11423-023-10337-7
[s89]: https://www.sciencedirect.com/science/article/abs/pii/S0360131524002100
[s90]: https://rodrigobelo.com/assets/pdf/leaderboards.pdf
[s91]: https://blog.duolingo.com/how-duolingo-streak-builds-habit
[s92]: https://www.schoolstatus.com/blog/national-survey-k12-communications-preferences
[s93]: https://www.texasattorneygeneral.gov/consumer-protection/file-consumer-complaint/consumer-privacy-rights/securing-children-online-through-parental-empowerment
[s94]: http://www.glicko.net/glicko/glicko2.pdf
