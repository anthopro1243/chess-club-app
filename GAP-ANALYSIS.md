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
