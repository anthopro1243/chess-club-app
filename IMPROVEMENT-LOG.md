# Improvement log

Session started 2026-10-05 on branch `claude/laughing-mccarthy-v2msz3` (from `master` at `bf8ae3e`).
Scope: game analysis and improvement only (no tournament tools, no security/auth work, nothing the
coach has to keep doing by hand, no paid services, no production database writes).

## Audit (2026-10-05)

Starting point: `npm install` OK, `npm run build` OK (one >500 kB chunk warning), `npm test` 451 + 180
legacy assertions pass, `npm run test:engine` 15/15. `test:rls` skips (needs real accounts). No linter
is configured in the repo, so there is nothing to lint. Pages checked in code and in a local Chromium at
390 px wide (no page scrolls sideways).

### Ranked findings (most member-visible and most broken first)

| # | Finding | Who sees it | Status |
|---|---|---|---|
| 1 | ✅ **Coach page is open to every member.** The nav shows "Coach" to everyone and the page has no role check: members get the approval panel, Export spreadsheet, the review queue for all players and "Assess" buttons that fail. | every member | fixed (1) |
| 2 | ✅ **Roster shows Add / Edit / Remove to every member.** "Remove" makes a player vanish from that member's screen (the database silently refuses it), "Edit" on someone else ends in a red "Couldn't save" banner, and a member can rewrite their own coach rubric. Every member can also read every other member's skill assessment, which the analyzer spec (Decision 4) rules out. | every member | fixed (2) |
| 3 | ✅ **Accounts aren't tied to the real student.** An approved member with no player row sees an empty home page; the only way in is a "Join the roster" form hidden in the account menu, which makes a *second* roster row even when the coach already imported that student. My games says "Ask the coach to link it", but there is no way for the coach to link anything. `player_private` (student ID) is coach-only, so a member can't be matched to an imported row. | new members, coach | built (3); needs migration 0025 |
| 4 | ✅ **Training starts on "Practice only".** A member has to pick themselves out of the full roster before puzzles count, and can pick someone else (their solves then change another member's rating). "Positions to review" on the home page says "In Training, pick yourself and choose 'Your mistakes'": three extra taps. | every member | fixed (4) |
| 5 | ✅ **SEM fonts missing.** Oswald + Public Sans aren't loaded; the app uses system fonts. | everyone | fixed (6) |
| 6 | ✅ **Brand-new member home page** tells them to link Chess.com/Lichess "from the account menu" instead of giving them the button. | new members | fixed (7) |
| 8 | ✅ **Top bar wraps on phones when signed in**: the account button pushes the Light/Dark toggle onto its own line above the nav. | every member, on phones | fixed (5) |
| 9 | ✅ **Leaderboard says "No one has joined yet. Sign in up top…"** to signed-in members whenever nobody has a rating yet (the usual state for a new club), even with a full roster. | every member | fixed (8) |
| 10 | ✅ **Text boxes under 16 px on phones** (e.g. the Chess.com/Lichess username boxes, unstyled): iPhones zoom the whole page in when one is tapped. | every member, on iPhones | fixed (9) |
| 7 | ✅ **First load is one 830 kB script** (238 kB gzipped) on phones: every page, the 402 puzzles and the scoresheet editor load before the home page shows. | everyone, on phones | fixed (10) |

**Round 2 (after the first seven):**

| # | Finding | Who sees it | Status |
|---|---|---|---|
| 11 | ✅ **Game analysis panel repeats the turning points in engine notation** ("lost 35.3%. Better was f6d7", raw labels like `onlyMove`) right under the board's plain-English "Big mistakes" list; "Patterns: hangingPiece ×1"; "ACPL" and "depth" shown to members; eight rows of "not enough games yet" after one game. | every member | fixed (11) |
| 13 | ✅ **My games doesn't fit a phone**: the 7-column table (unstyled; its CSS classes didn't exist) pushed the page to 426 px wide; the four replay buttons stacked full-width; results read "0-1" rather than won/lost. | every member, on phones | fixed (13) |
| 14 | ✅ **Games archive and Roster tables run off a phone screen** (738 px and 470 px wide inside a 326 px box; the result column was off-screen). | every member, on phones | fixed (14) |
| 15 | ✅ **Mistake headline runs into its sentence** in the board's list ("A turning point This cost White…"). | every member | fixed (15) |
| 16 | ✅ **Play starts every seat on "Guest (not rated)"**: a member's game is a guest game unless they pick themselves first, so it never reaches My games and is never analysed. On phones the eight game buttons stacked full-width and the seat name was cut to 100 px. | every member | fixed (16) |
| 17 | ✅ **Member Club page clutter**: "How you're trending" lists eight "not enough games yet" rows; "Teach to the whole group" (the coach's lesson planner) shows to members, empty for a new club. | every member | fixed (17) |
| 18 | ✅ **Solving your last due mistake shows "No puzzles match. Try another theme or difficulty."** instead of "Solved" (the position leaves the due list the moment it's solved); own-game positions show a puzzle rating of "0". | every member | fixed (18) |
| 19 | ✅ **Coach's Accounts panel pushes the Roster page sideways on a phone** (pickers sized to their longest option). | coach, on phones | fixed (19) |
| 12 | ✅ **Coach export still writes an "Attendance" sheet** (removed feature). | coach | fixed (12) |

(The list is re-ranked as items are fixed and new ones turn up; see the entries below.)

## Changes

_(newest last; one entry per pushed improvement)_

### 1. Coach page hidden from members
- **What:** the "Coach" tab only shows for coach/admin accounts. A member who follows an old
  `#/coach` link gets a short "Coaches only" panel with a button back to the Club page.
- **Why:** the page had no role check, so members saw tools that failed or didn't apply to them.
- **Where:** `src/data/navRoutes.js` (new; the rule), `src/App.jsx` (uses it).
- **Checked:** `src/data/navRoutes.test.js` (3 tests, including a member typing `#/coach`); build OK;
  `npm test` 454 pass.
- **Coach to do:** nothing.

### 2. Roster: coach-only controls, private records stay private
- **What:** "+ Add player", "Edit" and "Remove" only show for the coach. A member opening someone
  else's row sees the club facts (joined, grade, experience, style, openings, puzzles solved, online
  accounts) and a line saying skill scores and goals are private; on their own row they see their own
  skill assessment, goal and training focus (read only).
- **Why:** members' edits were refused by the database (red banner, or a "removed" player vanishing
  until reload), members could rewrite their own coach rubric, and every member could read every
  other member's scores.
- **Where:** `src/data/rosterAccess.js` (new; the rule), `src/pages/RosterPage.jsx`.
- **Checked:** `src/data/rosterAccess.test.js` (4 tests); build OK; `npm test` 458 pass; local Chromium
  at 390 px: coach can still add a player, Edit shows, skill assessment shows.
- **Coach to do:** nothing.

### 3. Each account linked to the real student ("Who are you?")
- **Member side:** after approval, a member who hasn't answered sees one screen instead of the page:
  first name, last name, DISD student ID (7 digits; spaces and dashes are fine). Saving shows "Thanks!
  You're linked…" and the app opens normally. It is never asked again. Coaches are never asked. A
  member's own ID shows in their account menu ("only you and the coach see this"); nobody else's
  ever does.
- **Matching (database function `link_my_account`, migration 0025):**
  - ID matches a row the coach imported, and that row has no account yet → the account is linked to
    it (the coach's name for the row is kept).
  - No match → the member's own row gets their real name and the ID, or a new row (next `CC-###`) is
    made from what they typed.
  - Member had an empty row from the old "Join the roster" and the ID matches an imported row → moved
    to the imported row; the empty one is retired. If their old row already has games, it is kept and
    flagged for the coach instead.
  - ID already on someone else's row → the member still gets in (on their own row, without the ID)
    and the coach sees it under "Check these".
  - Every answer is stored in a new coach-only table `account_links`; it also fills the account's
    display name, so Member approval shows a name instead of an id fragment.
- **Coach side (Roster page, top, coach only):** an **Accounts** panel with counts (linked / not linked /
  rows without an account) and:
  - **Check these**: clashes, with "Move to <row>" when the row holding that ID is free, or "It's fine".
  - **Accounts with no roster row**: sign-in email, what they typed, and a "Link to…" picker of free
    roster rows (one choice = done).
  - **Linked** (collapsed): name, CC id, email, student ID, a warning when what they typed differs from
    the row's ID, "Move to…" picker and "Unlink" (unlink asks the member "Who are you?" again).
    Moving an account off a row the step made for it retires that row if it has no games, so a typo
    leaves no stray roster entry.
  - **Roster rows nobody has signed in as** (collapsed).
- **Before 0025 is applied** nothing changes for anyone: the step doesn't show, the old "Join the
  roster" in the account menu still works, and the Roster panel says to apply 0025.
- **Where:** `supabase/migrations/0025_link_account_to_student.sql` (new; **not applied**),
  `src/data/accountLinking.js` (pure rules) + `accountLinking.test.js`, `src/data/accountLinkStore.js`
  (calls), `src/components/WhoAreYou.jsx`, `src/components/AccountLinksPanel.jsx`, `src/App.jsx`,
  `src/components/AccountControl.jsx`, `src/pages/RosterPage.jsx`, `src/pages/MyGamesPage.jsx`,
  `refreshRoster()` / `refreshPrivate()` added to the two stores. Student IDs stay in `player_private`,
  whose coach-only policy is untouched.
- **Checked:**
  - `src/data/accountLinking.test.js`: 10 tests (validation incl. a 6-digit ID that must fail, when
    to ask, the coach overview).
  - The migration on a scratch local Postgres 16 with a stub `auth` schema
    (`supabase/tests/0025-stub-setup.sql` + `0025-link-account.sql`, how-to in `supabase/tests/README.md`):
    applied twice, every branch above, refusals (pending account, bad ID, blank name, member calling coach
    functions), members can't read `player_private` or `account_links`, coach move/unlink/relink.
    Three deliberate bugs planted in the function were each caught by it.
  - In Chromium at 390 px against a fake in-browser Supabase (never the real one): member sees the step,
    gets the right field errors, saves, the step goes and the banner shows; an answered member and a
    coach never see it; the coach panel renders without sideways scroll.
  - `npm run build` OK, `npm test` 468 pass.
- **Coach to do:** apply migration 0025 (steps in "For the coach" below).

### 4. Training opens as the signed-in member; "Review them" goes straight to their mistakes
- **What:** a member always trains as themselves; the trainee picker is gone for them ("Training as
  <name>."). The coach keeps the picker and now starts as themselves instead of "Practice only"
  (choosing "Practice only" sticks). New deep link `#/training?mode=mistakes` (also `mode=endgames`)
  opens the player's own positions to review; the home page's "Review them" and the review next-step
  button use it, and the "In Training, pick yourself and choose 'Your mistakes'" instruction is gone.
- **Why:** three extra taps to reach your own mistakes, and members could log puzzles against another
  member's rating.
- **Where:** `src/data/trainingLink.js` (`mode`, `traineeIdFor`), `src/pages/TrainingPage.jsx`,
  `src/analysis/playerHome.js`, `src/components/PlayerHome.jsx`.
- **Checked:** new tests in `trainingLink.test.js` (mode parsing incl. an unknown mode, a member can't
  train as someone else, coach "Practice only" sticks) and `playerHome.test.js` (review links);
  `npm test` 471 pass; Chromium at 390 px with the fake backend: member lands on "Your mistakes" as
  themselves with no picker; coach starts on their own row.
- **Coach to do:** nothing.

### 5. Phone top bar on one row; account menu shows the real rating
- **What:** on phones the account button's name truncates with "…" and is sized from the space left,
  so seal + "Chess Club", account button and Light/Dark sit on one row (below 360 px the seal alone
  stands for the name). The number beside the name in the top bar is gone; the account menu now shows
  "Rating 1234 (USCF)" (or Chess.com/Lichess, or "set by coach"), the same number and label as the
  leaderboard, and nothing when there is no rating.
- **Why:** the toggle wrapped onto its own line on every page. The old number was
  `players.club_rating`, the blended figure HANDOFF §9 item 5 says is wrong and nothing else shows.
- **Where:** `src/components/AccountControl.jsx`, `src/styles/app.css`.
- **Checked:** Chromium at 320, 360 and 390 px: brand, account button and toggle share one row, page
  width = viewport; `npm test` 471 pass.
- **Coach to do:** nothing.

### 6. SEM fonts: Oswald headings, Public Sans text
- **What:** `index.html` loads Oswald (500/600) and Public Sans (400/600/700) from Google Fonts with
  `display=swap`; headings, the "Chess Club" name and the big numbers use Oswald, the rest Public Sans.
  Falls back to the old system fonts if Google Fonts can't be reached.
- **Why:** rule 7, SEM branding (maroon and the seal were already in place; the fonts weren't).
- **Where:** `index.html`, `src/styles/app.css` (`--font`, new `--font-display`).
- **Checked:** Chromium at 390 px with the font files served locally (this sandbox's browser doesn't
  trust its own proxy for fonts.googleapis.com; curl fetched them fine): both fonts load and render;
  top bar still one row; `npm test` 471 pass.
- **Coach to do:** nothing.

### 7. New member home: a real "Link Chess.com or Lichess" button; no repeated hero
- **What:** a member with no games gets a "Link Chess.com or Lichess" button (opens the connected-
  accounts dialog in place) next to "Try some puzzles". The generic "Chess Club / Play a game / View
  roster" hero no longer shows under a member's own home page.
- **Why:** fewer taps from first sign-in to having games to analyse; less scrolling on phones.
- **Where:** `src/components/PlayerHome.jsx`, `src/pages/DashboardPage.jsx`, `src/styles/playerHome.css`.
- **Checked:** Chromium at 390 px with the fake backend: button opens the dialog; hero hidden;
  `npm test` 471 pass.
- **Coach to do:** nothing.

### 8. Leaderboard: an honest message when nobody is ranked yet
- **What:** with members on the roster but nobody ranked: "Nobody is ranked yet. A USCF rating, a
  Chess.com rapid rating from a linked account, or a rating the coach sets puts someone here."
  (Chess.com rapid is the club's ranking basis in `ratings.js`.) Members with another online rating are
  still listed below as "not ranked"; that list used to need at least one ranked member to appear.
- **Why:** signed-in members were told "No one has joined yet. Sign in up top to create a profile."
- **Where:** `src/pages/DashboardPage.jsx`.
- **Checked:** Chromium with the fake backend (5 roster rows, no ratings); `npm test` 471 pass.
- **Coach to do:** nothing.

### 9. Text boxes: one look everywhere, and no iPhone zoom
- **What:** every text/email/password/number/search/date box shares the form-field look (several,
  like the Chess.com/Lichess username boxes and the invite code, were bare browser defaults). At 640 px
  and narrower, text boxes, drop-downs and text areas use 16 px text.
- **Why:** iPhones zoom the whole page in when you tap a box under 16 px, and leave it zoomed.
- **Where:** `src/styles/app.css`.
- **Checked:** Chromium at 390 px: no visible text box under 16 px on any page or in the connected-
  accounts dialog; unchanged at 1200 px; `npm test` 471 pass.
- **Coach to do:** nothing.

### 10. Faster first load: pages load when opened
- **What:** only the Club page ships in the first download; Play, Training, Games, My games, Roster and
  Coach load when first opened ("Loading…" meanwhile). The 400-puzzle library now comes only with
  Training and Coach. First-load script **830 kB → 536 kB (238 → 160 kB gzipped)**.
- **Safety:** after a new deploy, a tab left open would ask for old file names that no longer exist;
  the page reloads itself once and opens normally. If it still can't load (offline) it shows "This page
  didn't load" with a Reload button, never a blank screen or a reload loop.
- **Where:** `src/lazyPage.js` (new), `src/App.jsx`, `vite.config.js` (comment), `src/styles/app.css`.
- **Checked:** build sizes above; `vite preview` of the real build: all seven pages open; a chunk that
  404s once → one reload → page opens; a chunk that always 404s → one reload then the error panel (no
  loop); `npm test` 471 pass.
- **Coach to do:** nothing.

### 11. Game analysis panel: plain words for members, no duplicate list
- **What:** the panel under a game no longer repeats the turning points (the board's "Big mistakes"
  list already explains each in words, with the better move in normal notation). "Patterns in this game:
  Allowing forks (2), Leaving pieces hanging (1)." For members, ACPL and engine depth are hidden (the
  coach still sees them) and eight "not enough games yet" rows collapse to one line.
- **Why:** members were reading "Better was f6d7" and "hangingPiece ×1".
- **Where:** `src/components/GameAnalysisPanel.jsx`, `src/analysis/clubWeaknesses.js`
  (`describeMotifs`), `src/analysis/presentation.js` (`memberCategoryLines`).
- **Checked:** new tests in `clubWeaknesses.test.js` and `presentation.test.js`; `npm test` 473 pass;
  Chromium with one analysed game: "f3d4" appears nowhere on the page.
- **Coach to do:** nothing.

### 12. Coach export: no more Attendance sheet
- **What:** "Export spreadsheet" no longer writes an empty "Attendance" sheet (Club Summary, Player
  Master, Skill Assessments, Ratings Log, Games remain). The `attendance` table is untouched.
- **Why:** attendance was removed from the app on purpose (scope cut, 2026-09-27).
- **Where:** `src/data/exportWorkbook.js`.
- **Checked:** clicked Export in Chromium and read the downloaded file's sheet names back; `npm test`
  473 pass.
- **Coach to do:** nothing.

### 13. My games fits a phone
- **What:** the games table uses the app's table style (its old CSS classes didn't exist); on phones
  Moves, Type and Colour are hidden, dates read "Oct 1", long opponent names end in "…", and the result
  reads Won / Lost / Draw. The whole row opens the game. Start / Back / Next / End stay on one row.
- **Why:** the page was 426 px wide on a 390 px phone, and the replay buttons pushed the moves and
  mistakes a screen further down.
- **Where:** `src/pages/MyGamesPage.jsx`, `src/analysis/playerHome.js` (`shortGameDate`, reuses
  `gameFromPlayerSide`), `src/styles/app.css`.
- **Checked:** `shortGameDate` tests; Chromium at 390 px with a 30-character opponent name: table fits
  exactly, row tap opens, link tap toggles once; `npm test` 474 pass.
- **Coach to do:** nothing.

### 14. Games archive and Roster tables fit a phone
- **What:** at 640 px and narrower the Games archive hides Moves, Type, end reason and the PGN link,
  shows "Oct 1" dates, the scoreline ("1-0", "½-½") and trims long names; the Roster hides ID and Board
  and lets names wrap. Desktop unchanged.
- **Why:** both tables scrolled sideways inside their box, hiding the result.
- **Where:** `src/pages/GamesPage.jsx`, `src/pages/RosterPage.jsx`, `src/styles/app.css`.
- **Checked:** Chromium at 390 px with long names: both tables fit exactly; `npm test` 474 pass.
- **Coach to do:** nothing.

### 15. Big mistakes list: headline on its own line
- **What:** each mistake's headline ("Left a piece hanging", "Allowed mate in 2", …) sits on its own
  line above its explanation.
- **Why:** it read as one broken sentence: "A turning point This cost White about 23%…".
- **Where:** `src/styles/explain.css`.
- **Checked:** Chromium at 390 px, the list item reads in three separate lines.
- **Coach to do:** nothing.

### 16. Play: the member is seated automatically; tidier on phones
- **What:** on a fresh game with no seat picked, the signed-in member is put in their seat (once per
  visit, before any move, so picking Guest or someone else sticks). On phones the game buttons sit two
  per row and the seat name uses the whole bar instead of 100 px.
- **Why:** guest games never reach My games and are never analysed, which silently broke the
  analyse → practise loop for anyone who didn't pick themselves.
- **Where:** `src/pages/PlayPage.jsx`, `src/styles/app.css`.
- **Checked:** Chromium at 390 px: the member's name is in the White seat on arrival, picking Guest
  sticks; `npm test` 474 pass.
- **Coach to do:** nothing.

### 17. Member Club page: less clutter
- **What:** "How you're trending" lists only skills with a real score plus one line for the rest
  (Notation, which games can't measure, isn't counted). "Teach to the whole group" is coach-only, with
  an empty-state line.
- **Why:** a new member's page was mostly rows saying there was nothing to show yet.
- **Where:** `src/components/PlayerHome.jsx`, `src/pages/DashboardPage.jsx`.
- **Checked:** Chromium with the fake backend, member and coach views; `npm test` 474 pass.
- **Coach to do:** nothing.

### 18. "Your mistakes": a solved position stays on screen
- **What:** the positions in a "Your mistakes" round are fixed when it opens, so the one you solve
  stays on the board with "Solved" (it is still rescheduled). With nothing due, the page says "Nothing to
  review right now…" instead of the library's "No puzzles match… try another theme". Own-game
  positions no longer show a puzzle rating of "0".
- **Why:** getting your own mistake right ended in an error-looking message.
- **Where:** `src/pages/TrainingPage.jsx`.
- **Checked:** Chromium with one due position: Club page "Review them" → that position in 2 taps, the
  right move shows "Solved"; library ↔ mistakes switching works; `npm test` 474 pass.
- **Coach to do:** nothing.

### 19. Accounts panel fits a phone
- **What:** the "Link to…" / "Move to…" pickers in the coach's Accounts panel shrink to the row
  instead of growing to their longest option.
- **Why:** a long name + CC id + student ID pushed the Roster page to 421 px wide on a 390 px phone.
- **Where:** `src/styles/app.css`.
- **Checked:** Chromium at 390 px as the coach: nothing wider than the screen, page width 390;
  `npm test` 474 pass, `npm run test:engine` 15/15.
- **Coach to do:** nothing.

---

## For the coach

_Final. Session ended 2026-10-05 after change 19._

### 1. Branch

`claude/laughing-mccarthy-v2msz3`, PR https://github.com/anthopro1243/chess-club-app/pull/1 (ready for
review). Branched from `master` at `bf8ae3e`; 19 improvements, one commit each, plus docs. Nothing is
merged and the production database hasn't been touched. Every push built green on Vercel's preview.

### 2. Try the branch on your machine

In `~/Projects/chess-club-app`, one step at a time:

```
git fetch origin
git status                      # checkpoint: "nothing to commit, working tree clean". If not, commit or stash first.
git checkout claude/laughing-mccarthy-v2msz3
git pull origin claude/laughing-mccarthy-v2msz3
npm install                     # checkpoint: ends without "ERR!"
npm test                        # checkpoint: "# pass 474" and "# fail 0" (the RLS suite prints SKIP; normal)
npm run test:engine             # checkpoint: "# pass 15", "# fail 0"
npm run build                   # checkpoint: "✓ built in …" (one >500 kB warning is the usual one)
npm run dev                     # checkpoint: open http://localhost:5173 and check the list below
```

`npm run dev` uses your `.env.local`, so it shows real data and you're signed in as the coach. Check:

- **Coach** tab is there for you. In a private window signed in as a member: the nav ends at Roster.
- **Roster**: an **Accounts** panel at the top. Before migration 0025 it says "Apply migration 0025…";
  after, it shows linked / not linked / rows without an account.
- **Roster** as a member: no "+ Add player", "Edit" or "Remove"; other members' rows say "Skill scores
  and goals are private…"; their own row shows their scores.
- **Play**: your name is already in the White seat on a fresh game.
- **Training**: you start as your own row (picker still there for you). As a member: no picker,
  "Training as <name>."; on the Club page, "Review them" opens "Your mistakes".
- **My games** / **Games** on a phone (or a narrow window): no sideways scrolling; results read Won/Lost.
- Headings in Oswald, text in Public Sans.

Stop the dev server with Ctrl+C.

### 3. Migration to apply: `0025_link_account_to_student.sql`

Needed for the "Who are you?" step and the Roster Accounts panel. Additive (one new table, four new
functions), changes no existing table or policy, safe to run twice. The app works before and after it,
so it can go before or after the merge; doing it first means the step shows as soon as the deploy lands.

1. Supabase dashboard → project `rftlozmdyetubhjcutht` → **SQL Editor** → **New query**.
2. Pre-check, paste and run:

   ```sql
   select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'players'
      and is_nullable = 'NO' and column_default is null;
   ```

   **Checkpoint:** only `player_id` and `name`. If any other column appears, stop (the function that
   creates new roster rows would fail) and note which column.
3. Copy the whole of `supabase/migrations/0025_link_account_to_student.sql` from the branch into a new
   query and press **Run**. **Checkpoint:** "Success. No rows returned".
4. Paste and run:

   ```sql
   select proname from pg_proc
    where proname in ('my_account_link','link_my_account','coach_link_account','coach_list_accounts')
    order by proname;
   select count(*) from public.account_links;
   ```

   **Checkpoint:** four function names, then `0`.
5. Open **Roster** as the coach (dev server or, after merging, the live site). **Checkpoint:** the
   Accounts panel shows counts, your account under **Linked** with a "coach" tag, and every approved
   member either under Linked or under "Accounts with no roster row".

Undo if ever needed (removes the table and functions; player rows and student IDs it wrote stay):

```sql
drop function if exists public.coach_list_accounts();
drop function if exists public.coach_link_account(uuid, text);
drop function if exists public.link_my_account(text, text, text);
drop function if exists public.my_account_link();
drop table if exists public.account_links;
```

### 4. Merge?

**Merge to master now.** Tests (474 + 15 engine) and the build pass, every Vercel preview built, and
everything works with or without migration 0025.

```
git checkout master
git pull origin master
git merge claude/laughing-mccarthy-v2msz3
git push origin master
```

Checkpoint after `git merge`: no "CONFLICT" lines. After `git push`, Vercel deploys `master` in a couple
of minutes.

### 5. Check on the live site after Vercel deploys

https://chess-club-app-seven.vercel.app (hard refresh: Ctrl+Shift+R / Cmd+Shift+R). A tab left open from
before the deploy reloads itself once when you change page; that's expected.

- As the coach: Coach tab present; Roster has the **Accounts** panel; Export spreadsheet has no
  Attendance sheet.
- As a member, on a phone: no Coach tab; top bar on one row; Roster has no Add/Edit/Remove and no other
  members' scores; Play seats them; Training "Training as <name>."; "Review them" → "Your mistakes", and
  solving one shows "Solved"; My games fits the screen.
- After migration 0025: a member who hasn't answered sees **Who are you?** once. Try one whose student ID
  you imported: they land on their imported row and move to **Linked** in the Accounts panel. A wrong ID
  shows under **Check these** or as "They typed …"; fix it with "Move to…" (or "Unlink" to have them
  answer again).
