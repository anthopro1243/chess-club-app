# Chess Club app — new features, for the "How to use the app" section

Give this to Claude Cowork to add to the presentation. The app's purpose: members sign in, analyse
their games, and see exactly what to improve. Menu: Club · Play · Training · Games · My games ·
Roster · Coach (Roster and Coach are for the coach).

**Do not show** (removed from the app): Prep page, Events page, availability poll, rules quiz,
notation trainer, homework, announcements, team tools, attendance.

---

## For members

### 1. Your home page (Club tab, when signed in)
- **What it is:** a private page that only you (and the coach) can see.
- **How to use:** sign in and open **Club**. The card says "Hi, [your name]".
- **What's on it:**
  - **Work on this next:** the single biggest weakness from your analysed games, with a
    button straight to the matching puzzles.
  - **How you're trending:** which skills are going up or down over recent games.
  - **Positions to review:** positions you got wrong in your own games, coming back to practise.
  - **Games to go over:** your review queue (see 4).
  - **Recent games:** your last few games with accuracy.
- **Talking point:** one clear priority instead of a wall of numbers.

### 2. Mistakes explained in plain English (Games → open a game)
- **How to use:** open **Games** (or **My games**), click a game, and look at the review under the
  board. It shows **Big mistakes** first; "Show all turning points" shows every swing.
- **What you get:** each mistake says what happened and why, for example "Walked into a pin: White
  can answer with Bb5, pinning one of Black's pieces to a bigger one behind it". It also gives the
  better move and line.
- **Tactics it recognises:** hanging pieces, forks, back-rank weakness, missed mates, missed free
  captures, and **new:** pins, skewers, discovered attacks, trapped pieces and deflections.
- **Talking point:** you learn why the move was bad, not just that it was.

### 3. Time per move (in the same game analysis)
- A bar chart of how long each move took, with a one-line summary such as "One mistake was played
  in under 5 seconds with lots of time left" or "You were low on time from move 28".
- **Talking point:** shows time trouble and impulsive moves.

### 4. Review queue ("Games to go over")
- **Where:** on your home page, and for the coach on the **Coach** page.
- **What's in it:** games worth going back over, most important first. Games played **in person**
  (entered from a scoresheet) come first, then online games with the most big mistakes.
- **How to use:** tap a game to open it and go through it (ideally with the coach), then press
  **Mark reviewed** to clear it from the queue.

### 5. Puzzles at your level (Training)
- **How to use:** open **Training**, pick yourself as the trainee, and leave Difficulty on
  **"Near [your name]'s rating (~1150)"**, which is the default.
- **How it works:** puzzles are pitched a little above your rating, and ones you haven't solved come
  first. Every puzzle you solve updates your club rating, so the difficulty grows with you.
- Other options: pick a theme (fork, pin, …), or **Your mistakes** to replay positions from your
  own games.

### 6. Endgame trainer (Training → Puzzle type → "Endgames: play them out vs the engine")
- 13 classic endgames in four levels matched to rating (basic mates → opposition → king-and-pawn →
  rook endings). You play the position out against the engine until you win or hold the draw.

### 7. Enter a game played on paper (Games → "Enter a scoresheet")
- Type the moves from your paper scoresheet. The app forgives sloppy notation, flags an illegal
  move and suggests what was meant. Add the event, round and board.
- The game is then analysed like any other and goes to the top of your review queue.

### 8. Chess.com and Lichess games come in automatically
- Link your accounts once in the account menu. New games sync daily and are analysed
  automatically.

---

## For the coach

### 9. Report card (Roster → pick a member → "Report card")
- One page per member:
  - ratings, each labelled with where it comes from (US Chess, club, Chess.com, Lichess);
  - games and puzzles in the last 30 days, with a flag if inactive for 2+ weeks;
  - what they're working on and their weakest areas;
  - the tactics they miss most;
  - their goal and your coach note.
- **Print** gives a clean one-page sheet for a parent meeting.

### 10. Club weaknesses (Coach page)
- Across the whole club over the last 30 days: the tactic themes behind most mistakes, the phase
  where games are decided, and the openings members face most. Use it to plan what to teach.

### 11. Review queue for the whole club (Coach page)
- Every member with games waiting, busiest first. Open a game and go over it with the player, then
  **Mark reviewed**.

### 12. Archive a graduate (Roster → pick a member → "Archive graduate")
- **Use it when** a student graduates. Type their name to confirm.
- **Removed:** their name (shown as "Graduate CC-0xx"), linked accounts and US Chess ID, guardian
  email, goal and notes, and student ID and school email.
- **Kept:** ratings and stats, so club history stays correct.
- **Talking point:** protects students' personal information (data minimisation).

---

## One-slide summary
Sign in → **Club** shows what to **work on next** → **Games** explains every big mistake in plain
English → **Training** serves puzzles at your level → **Games to go over** makes sure every game,
especially the ones played in person, gets reviewed with the coach.
