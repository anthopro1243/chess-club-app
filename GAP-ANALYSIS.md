# Gap analysis: what the app needs for SEM Chess Club

Living document for the autonomous analyze → build → verify loop that started 2026-09-25 21:54 UTC.
Each cycle re-reads the code and the live database, updates this file, builds the top items, and
records the outcome here. Measured against the club's purpose, not against a generic feature list:

1. **Win 1st at DISD** (next event: W.T. White HS, Sat **Oct 24, 2026**; registration closes Oct 16).
2. **Raise everyone's level**, from a 600–1600 spread.
3. **Keep it fun** for ~30 teenagers who meet every Tuesday.

Status key: ✅ done · 🟡 partial / unverified · 🔨 being built this cycle · ❌ missing · ⏸ waiting on the owner.

---

## Cycle 1 (2026-09-25 21:55 UTC)

### The one gap that outweighs the rest

**The club isn't in the app.** The live database has **one active member** (the coach), zero
attendance rows and zero puzzle attempts. Leaderboards, club weaknesses, the session planner,
homework and recalibration all describe a club of one until members are in. The roster import
exists (🟡, never run live) but three things are missing around it:
- a Google Form that produces the CSV (⏸: the owner creates it; the importer's expected headers
  are in HANDOFF §12);
- a way for an imported member to find their own row when they sign in (the claim flow is auth
  territory, out of scope, so this needs the owner);
- linking Chess.com/Lichess for 30 members. Auto-sync now runs for each member's own accounts
  once they're linked.

### Ranked gaps against the purpose

| # | Gap | Purpose | Status | Why it matters for this club |
|---|---|---|---|---|
| 1 | Verify the branch against the live database, then merge | all | 🔨 (lead) | Nothing built since 2026-09-24 has touched real data. The live site still drops engine assessments and shows CC-003 |
| 2 | Tournament mode (individual Swiss): pair, results, tiebreaks, games linked | 1, 3 | 🔨 agent | Tuesday Swiss events under tournament conditions are the best preparation for Oct 24 and are fun. Tournament games need recording |
| 3 | Plain-English "why was this a mistake" at each critical moment | 2 | 🔨 agent | Chess.com's Game Review and Lichess's analysis explain; ours only shows numbers. Teenagers learn from the sentence, not the eval graph |
| 4 | Player home: one priority, trend, reviews due, recent games | 2, 3 | 🔨 agent | Gives each member a reason to open the app between Tuesdays |
| 5 | Homework with completion from puzzle attempts | 2 | 🔨 agent | ChessKid's coach assignments are the model; completion must be automatic, not self-reported |
| 6 | Tuesday sessions made automatically + lesson planner from club weaknesses | 2 | 🔨 agent | Removes a weekly chore; turns the skill profile into a plan |
| 7 | Opening repertoire view | 1, 2 | 🔨 agent | Tournament prep: each player needs to know what they play and where they go wrong |
| 8 | Remaining motifs (pin, skewer, discovered attack, trapped piece, deflection) | 2 | 🔨 agent | Better motif detection makes items 3 and 5 sharper, and feeds "Your mistakes" |
| 9 | Board keyboard access, typed moves, announced moves | 2 | 🔨 agent | Typed SAN is also the fastest way to enter a scoresheet on a phone at a tournament |
| 10 | Seamless pass (timeouts, empty/error states, dead buttons, phone) | all | 🔨 audit agent → fixes next cycle | Members will judge the app in its first minute on a phone |
| 11 | Clear the 13 stale failed analyses | 2 | 🔨 (lead) | SQL ready; noise on the coach's dashboard |
| 12 | Opening drills (Chessable-style spaced repetition of your own repertoire) | 1, 2 | ❌ next cycle | The repertoire report says what you play; a drill makes you remember it. Spaced repetition already exists for own-game puzzles |
| 13 | Fun loops: puzzle streaks, a weekly club puzzle challenge, a Tuesday ladder | 3 | ❌ next cycle | ChessKid and Lichess's Puzzle Storm keep kids coming back; the app has no social or competitive loop outside games |
| 14 | Tournament-day kit: board list, scoresheet entry on a phone, results straight into the archive | 1 | ❌ after Swiss | Oct 24 games should reach analysis the same evening |
| 15 | Coach's "tournament readiness" view: who's registered, form, weakest area, time-trouble rate | 1 | ❌ next cycle | One screen before Oct 16 registration |
| 16 | Free analysis board (try a variation from any position in GameReview) | 2 | ❌ | Lichess's core study tool; we only replay the game |
| 17 | Monthly parent progress report | 2 | ❌ Phase C | Plain words, never raw engine output |
| 18 | Opening book for `inBook` | 2 | ❌ Phase C | Fallback "first 8 plies" misjudges short or offbeat openings |
| 19 | Stores still write the old JSON blobs on `players` (lost updates) | all | 🟡 | Two coaches editing the same player can overwrite each other |
| 20 | Team scoring / board order | 1 | ⏸ | Waits on how DISD scores |

### Compared with the platforms members already use

| Capability | Lichess | Chess.com | ChessKid | Chessable | This app |
|---|---|---|---|---|---|
| Game review with explanations | analysis + some | ✅ "Coach" | basic | — | 🔨 (item 3) |
| Puzzles by theme | ✅ | ✅ | ✅ | — | ✅ 402 |
| Own-mistake puzzles with spaced repetition | — | partial | — | ✅ (courses) | ✅ |
| Opening repertoire + drilling | studies | lessons | — | ✅ | 🔨 report / ❌ drill |
| Swiss tournaments | ✅ | ✅ | ✅ | — | 🔨 |
| Coach assignments / homework | teams (no) | classrooms | ✅ | — | 🔨 |
| Progress for the coach per player | — | partial | ✅ | — | ✅ rubric + engine scores |
| OTB game entry | ✅ | ✅ | — | — | ✅ PGN import, 🔨 typed moves |
| Timed puzzle modes / streaks | ✅ Storm/Streak | ✅ Rush | ✅ | — | ❌ (item 13) |
| Club attendance + lesson planning | — | — | partial | — | ✅ attendance, 🔨 planner |

What the app has that none of them do: one place where the coach sees engine-measured skill per
category for every member, across Chess.com, Lichess and over-the-board games, with the coach's
own judgement always winning.

### Cycle 1 build plan

- **Lead:** item 1 (live verification with temporary test accounts, the engine-assessment fix
  confirmed in the logs, CC-003 skip applied), item 11, applying the new feature migrations
  (0019–0021) after review, and merging.
- **Agents in parallel (isolated worktrees, merged by the lead):** items 2–10.

### Cycle 1 outcome

_Filled in as work lands._

---

## Cycle 2 (2026-09-26): the research compared with the app

Source: `research/FEATURE-RESEARCH.md` (Cowork, 130 features, 94 sources, written without reading
the code). Every row below was checked against the code on `feature/roster-import-9cg3im`.
Uncertain rows were checked in the files, not from memory.

**Totals:** ✅ 11 built · 🟡 39 partial · ❌ 79 missing · ⏸ 1 needs a decision.
**Musts (40):** ✅ 2 · 🟡 19 · ❌ 19.

### What the research changes

1. **Dates drive the order.** Transport forms due ~Fri Oct 2; availability poll and rules quiz at
   the Tue Sep 29 meeting; mock rounds Oct 6 and 13; registration closes Fri Oct 16; event Sat Oct 24.
2. **The app is for before and after games, never at the board** (US Chess scholastic device
   rules). So scoresheet entry after the game (F065) matters more than anything live.
3. **The Dallas ISD limits** (10 per coach, 2 coaches per campus, stipend halved under 6) make
   selection a real task (F071, F072).
4. **Scoring format unknown → build for both** (top-3/4 projector F081 and board order F082).
5. **Motivation: private progress over public ranking** (F096, things-to-avoid #1).

### Decisions (logged; conservative defaults)

- **D1. The club leaderboard.** The research says a club-wide rating ranking hurts weaker
  members. The app shows one to every member today. Removing it is reversible but it's a feature
  the owner built on purpose, so the default is to **keep it, show members their private progress
  first (F096), and flag it** for the owner.
- **D2. Syncing all members.** The research confirms serial requests are never rate-limited on
  Chess.com and Lichess allows one at a time. So a coach's session may sync every member's linked
  accounts once a day, serially, with 429 back-off (F043/F044). This replaces the overnight
  "own accounts only" decision.
- **D3. No OCR, no paid AI, no in-app live games, no opponent scouting.** Per things-to-avoid.
- **D4. Swiss rules follow US Chess basics** (score groups, top half vs bottom half, colour
  equalisation, bye to the lowest-rated in the lowest group, no repeats). Tiebreaks: modified
  median, Solkoff, cumulative, Sonneborn-Berger, per the scholastic order.

### Build order (by the checklist's dates)

| Wave | Needed by | Features |
|---|---|---|
| 1 | Tue Sep 29 / Fri Oct 2 | Event calendar + DISD deadlines (F070), availability poll (F071), rules quiz (F041), media-release flag + grade section (F001, F114), announcements (F110), `noindex` (F121) |
| 2 | Tue Oct 6 (mock round 1) | Club Swiss with overrides, printable pairings, tiebreaks (F075–F080), event time-control profile (F084), scoresheet entry + repair (F065, F066), OTB tags (F068), notation trainer (F033), homework (F019, F020) |
| 3 | Tue Oct 13 – Fri Oct 16 | Registration helper + export (F072, F073), team projector (F081), board order (F082), readiness checklist (F074), endgame bands (F028), slow-game tracking (F036), time-use chart (F054), big-blunder view + explanations (F050), club weaknesses (F015) |
| 4 | Tue Oct 20 – Sat Oct 24 | Parent info sheet + packing list (F112, F119), report card (F011), Tuesday dashboard (F017), tournament-day result entry (F085), offline write queue (F086), private progress (F096) |
| 5 | Oct 25 – Oct 31 | Review queue (F091), debrief report (F090), media-filtered summary (F113), tournament history (F092) |
| 6 | After | The Shoulds and Coulds, starting with all-member sync (F043/F044), themed puzzle trainer near rating (F021, F124), spaced repetition for missed puzzles (F024), weekly streak and badges (F097, F098), parent drafts (F111), .ics (F116) |

### The full matrix

| ID | Priority | Status | In the app today |
|---|---|---|---|
| F001 | Must | 🟡 | Roster has grade, usernames, US Chess ID; **no media-release flag, no grade section (9–10 / 11–12)** |
| F002 | Should | ✅ | Roster CSV import (built; live check pending) |
| F003 | Must | 🟡 | Attendance by date exists; **no per-member attendance %**, not one-tap from a Tuesday list |
| F004 | Should | ❌ | Skill groups |
| F005 | Could | ❌ | Placement check |
| F006 | Should | 🟡 | Session planner WIP patch (unmerged) |
| F007 | Should | ❌ | Season curriculum map |
| F008 | Should | ❌ | Lesson library / study PGN import |
| F009 | Could | ❌ | Coach-authored guided lessons |
| F010 | Should | ❌ | Projector/demo board (GameReview has arrow keys, no arrows/large mode) |
| F011 | Must | 🟡 | Roster detail has ratings, rubric, notes, goal; **no one-page report card with homework/activity/weaknesses** |
| F012 | Should | 🟡 | One coach note per player (not timestamped entries) |
| F013 | Should | 🟡 | One free-text "goal" field; no process goals shown on the player's home |
| F014 | Should | ❌ | "Needs attention" list |
| F015 | Must | 🟡 | Club skill profile + 3 weakest categories; **no missed tactic themes, decisive-error phase or openings faced** |
| F016 | Could | ❌ | Buddy pairing |
| F017 | Must | ❌ | Coach "Tuesday dashboard" |
| F018 | Should | ❌ | Beginner "start here" path |
| F019 | Must | 🟡 | Homework WIP patch (unmerged) |
| F020 | Must | 🟡 | Homework WIP (completion from puzzle_attempts); games-played targets not covered |
| F021 | Must | 🟡 | 402 puzzles with theme + difficulty filters; **not served near the player's rating; tiny set** |
| F022 | Should | 🟡 | "Your mistakes" = own positions; no matching Lichess puzzles by weak motif |
| F023 | Should | 🟡 | Accuracy + 3 weakest themes on Training; no per-theme trend |
| F024 | Should | 🟡 | Spaced repetition for own-game puzzles only |
| F025 | Could | ❌ | Woodpecker cycles |
| F026 | Could | ❌ | Tournament-mode puzzles |
| F027 | Should | ❌ | Club puzzle race |
| F028 | Must | ❌ | **Endgame curriculum by rating band** |
| F029 | Should | ❌ | Play out endgame positions vs engine (Play starts from the initial position only) |
| F030 | Could | ❌ | Tablebase check |
| F031 | Should | ❌ | Mini-repertoire per player (repertoire.js reports, no stored repertoire) |
| F032 | Could | ❌ | Repertoire drill |
| F033 | Must | ❌ | **Notation trainer** |
| F034 | Could | ❌ | Coordinate trainer |
| F035 | Should | ❌ | Thinking checklist in practice games |
| F036 | Must | 🟡 | Clock with G/30 d5, G/60 d5 exists on Play; **no tracking of slow practice games per player** |
| F037 | Could | 🟡 | Clock is tied to a game on the Play board; no standalone OTB clock |
| F038 | Could | ❌ | Weekly personal plan |
| F039 | Could | ❌ | Guess the move |
| F040 | Could | ❌ | Play from any position vs engine |
| F041 | Must | ❌ | **Rules & etiquette quiz** |
| F042 | Could | ❌ | Offline puzzle pack |
| F043 | Must | 🟡 | Sync + auto-sync on open for the member's OWN accounts; **no daily sync of all members** |
| F044 | Should→Must | 🟡 | Serial + `since`; no ETag, no 429 back-off |
| F045 | Should | ❌ | Bullet excluded from coaching views |
| F046 | Must | ✅ | Stockfish lite in a worker + DB-backed queue |
| F047 | Could | ❌ | Lichess cloud eval |
| F048 | Should | ✅ | Analyses stored once in game_analyses |
| F049 | Should | ✅ | Win-probability classification (scoring.js) |
| F050 | Must | 🟡 | Critical moments exist; **no "big blunders only, ≤5, with motif" view**; plain-English explanation WIP |
| F051 | Must | ✅ | Own-game blunders become retry puzzles with spaced repetition |
| F052 | Should | ❌ | Self-annotation before engine lines |
| F053 | Should | 🟡 | One coach note per analysis, not per move |
| F054 | Must | 🟡 | %clk parsed and feeds the time-management score; **no time-use chart, no "fast blunder" flag** |
| F055 | Should | 🟡 | Skill history + ratings; no blunders/100, time-trouble rate |
| F056 | Should | 🟡 | repertoire.js computes it; UI WIP patch |
| F057 | Should | 🟡 | Uses the PGN's own Opening/ECO tags; no local CC0 dataset |
| F058 | Could | ❌ | Club-only opening explorer |
| F059 | Could | ❌ | Repertoire deviation mark |
| F060 | Should | ✅ | Critical moments in GameReview |
| F061 | Could | 🟡 | by_phase stored per analysis; not rolled up |
| F062 | Should | 🟡 | Filter by player and type only |
| F063 | Should | ❌ | Game of the week |
| F064 | Should | 🟡 | Copy/download PGN; no "open in Lichess" |
| F065 | Must | 🟡 | PGN paste checks legality and names the first illegal move; **no move-by-move scoresheet entry** |
| F066 | Should | ❌ | Repair gaps / continue from FEN |
| F067 | Could | ❌ | Scoresheet photo |
| F068 | Must | 🟡 | Tags kept inside the PGN only; **no structured event/round/board** |
| F069 | Should | ✅ | "Log a game" form |
| F070 | Must | ❌ | **Event calendar with DISD deadlines + reminders** |
| F071 | Must | ❌ | **Availability poll** |
| F072 | Must | ❌ | **Registration helper (10 per coach, <6 stipend warning, sections)** |
| F073 | Should | ❌ | Registration export |
| F074 | Must | ❌ | **Per-player readiness checklist** |
| F075 | Must | ❌ | **Mock tournament** (needs Swiss) |
| F076 | Must | ❌ | **Club Swiss pairing** |
| F077 | Must | ❌ | **Pairing overrides** |
| F078 | Could | ❌ | Round robin |
| F079 | Should | ❌ | Printable pairings/standings |
| F080 | Could | ❌ | US Chess tiebreak set |
| F081 | Must | ❌ | **Team-score projector (top 3/4)** |
| F082 | Must | ❌ | **Board-order tool** |
| F083 | Should | ✅ | Ratings shown with platform + time control; coach override |
| F084 | Should | ❌ | Event time-control profile |
| F085 | Must | ❌ | **Tournament-day result entry** |
| F086 | Must | 🟡 | Stores are local-first; **failed writes are not queued for retry; no offline tournament mode** |
| F087 | Should | ❌ | Arrival check-in |
| F088 | Should | ❌ | Between-round check-in |
| F089 | Could | ❌ | Coach prompt cards |
| F090 | Must | ❌ | **Post-tournament debrief report** |
| F091 | Must | ❌ | **Post-event review queue** |
| F092 | Should | ❌ | Tournament history |
| F093 | Could | ❌ | Link Lichess/Chess.com club events |
| F094 | Could | ❌ | TRF export |
| F095 | Could | 🟡 | US Chess ID stored; no link to the official lookup |
| F096 | Must | 🟡 | Player home WIP patch; **app currently shows a club-wide leaderboard to every member (see decision D1)** |
| F097 | Should | ❌ | Weekly streak with grace |
| F098 | Should | ❌ | Effort badges |
| F099 | Should | ❌ | Opt-in ladder |
| F100 | Should | ❌ | Team goal progress bar |
| F101 | Should | ❌ | Monthly award suggestions |
| F102 | Could | ⏸ | Leaderboards opt-in only: conflicts with the existing club leaderboard (D1) |
| F103 | Should | ❌ | Fun-format scheduler |
| F104 | Could | ❌ | Club identity page |
| F105 | Could | ❌ | Chess.com club matches |
| F106 | Could | ❌ | Positive-only feed |
| F107 | Should | ❌ | Choice in training |
| F108 | Should | 🟡 | Glicko club_rating exists but mixes online games (known wrong, HANDOFF §9.5) |
| F109 | Should | ✅ | Dark mode; neutral look |
| F110 | Must | ❌ | **Announcement board** |
| F111 | Should | ❌ | Parent update drafts |
| F112 | Must | ❌ | **Pre-tournament parent info sheet** |
| F113 | Should | ❌ | Media-filtered post-tournament summary |
| F114 | Must | ❌ | **Media-release flag respected by exports and printouts** |
| F115 | Could | 🟡 | Excel export |
| F116 | Should | ❌ | .ics calendar export |
| F117 | Should | ❌ | Weekly digest drafts |
| F118 | Could | ❌ | QR handouts |
| F119 | Should | ❌ | Packing and conduct list |
| F120 | Must | 🟡 | Soft delete exists; **no graduate archive that strips personal fields** |
| F121 | Must | 🟡 | Everything behind sign-in; **no `noindex`** |
| F122 | Should | ✅ | Linking checks the profile exists (404 → error) |
| F123 | Should | ❌ | Free-tier size guard |
| F124 | Should | 🟡 | 402 puzzles; research wants ≥200 per theme in 600–1600 |
| F125 | Should | 🟡 | Excel export only; no restore |
| F126 | Could | ❌ | Season roll-over |
| F127 | Must | 🟡 | Phone nav fixed; page-by-page phone audit not done |
| F128 | Should | ✅ | Engine and xlsx load on demand |
| F129 | Should | ❌ | Licence/credits page |
| F130 | Could | 🟡 | "Last synced" only in Connected accounts |
