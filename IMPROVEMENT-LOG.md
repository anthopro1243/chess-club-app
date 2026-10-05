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

---


## For the coach

_Kept current after every push. Last updated after change 10._

### 1. Branch

`claude/laughing-mccarthy-v2msz3` (draft PR: https://github.com/anthopro1243/chess-club-app/pull/1).
Branched from `master` at `bf8ae3e`. Nothing has been merged and the production database hasn't been
touched.

### 2. Try the branch on your machine

Run these in `~/Projects/chess-club-app`, one at a time.

```
git fetch origin
git status                      # checkpoint: "nothing to commit". If not, commit or stash first.
git checkout claude/laughing-mccarthy-v2msz3
git pull origin claude/laughing-mccarthy-v2msz3
npm install                     # checkpoint: ends without "ERR!"
npm test                        # checkpoint: "# fail 0" (the RLS suite prints SKIP, that's normal)
npm run build                   # checkpoint: "✓ built in …" (the >500 kB warning is the usual one)
npm run dev                     # checkpoint: open http://localhost:5173 and check the list below
```

What to look at with `npm run dev` (your `.env.local` points it at the real database, so it shows
real data; you're signed in as the coach):

- **Coach tab** is still there for you. (Members no longer see it; to check, sign in with a member
  account in a private window: their nav ends at Roster.)
- **Roster** → before migration 0025, a small **Accounts** panel at the top says "Apply migration
  0025…". After the migration, it shows linked / not linked / rows without an account.
- **Roster** as a member (private window): no "+ Add player", "Edit" or "Remove"; other members' rows
  show "Skill scores and goals are private…"; their own row shows their scores.
- **Training**: you start as your own row (the picker is still there for you). As a member: no picker,
  "Training as <name>." On the Club page, "Review them" opens Training on "Your mistakes".

Stop the dev server with Ctrl+C when done.

### 3. Migration to apply: `0025_link_account_to_student.sql`

Needed for the "Who are you?" step and the Roster accounts panel. Additive (one new table, four new
functions), changes no existing table or policy, safe to run twice. The app works before and after it.

1. Open the Supabase dashboard → project `rftlozmdyetubhjcutht` → **SQL Editor** → **New query**.
2. Pre-check: paste and run

   ```sql
   select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'players'
      and is_nullable = 'NO' and column_default is null;
   ```

   **Checkpoint:** the result is `player_id` and `name` only. If any other column is listed, stop and
   don't apply 0025 (the function that creates new roster rows would fail); tell Claude which column.
3. Open `supabase/migrations/0025_link_account_to_student.sql` from the branch in your editor, copy
   the whole file, paste it into a new SQL Editor query, and press **Run**.
   **Checkpoint:** "Success. No rows returned".
4. Paste and run

   ```sql
   select proname from pg_proc
    where proname in ('my_account_link','link_my_account','coach_link_account','coach_list_accounts')
    order by proname;
   select count(*) from public.account_links;
   ```

   **Checkpoint:** four function names, then a count of `0`.
5. In the app (dev server from step 2, or the live site after merging), open **Roster** as the coach.
   **Checkpoint:** the **Accounts** panel shows counts and your own account under **Linked** with a
   "coach" tag; every approved member account appears either under Linked or under "Accounts with no
   roster row".

Undo, if ever needed (removes the feature's table and functions; player rows and student IDs it
wrote stay):

```sql
drop function if exists public.coach_list_accounts();
drop function if exists public.coach_link_account(uuid, text);
drop function if exists public.link_my_account(text, text, text);
drop function if exists public.my_account_link();
drop table if exists public.account_links;
```

### 4. Merge?

**Don't merge yet**: this session is still adding improvements to the branch. When it stops, this line
will say "merge to master now". If you want what's here already, it is safe to merge as it stands
(tests and build pass, and everything works with or without migration 0025). The merge commands:

```
git checkout master
git pull origin master
git merge claude/laughing-mccarthy-v2msz3
git push origin master
```

Checkpoint after `git merge`: no "CONFLICT" lines. After `git push`, Vercel deploys `master`
automatically (a couple of minutes).

### 5. Check on the live site after Vercel deploys

https://chess-club-app-seven.vercel.app (hard refresh: Ctrl+Shift+R / Cmd+Shift+R)

- Signed in as the coach: the Coach tab is there; Roster has the **Accounts** panel at the top.
- Signed in as a member: no Coach tab; Roster has no Add/Edit/Remove; other members' rows don't show
  skill scores; Training says "Training as <name>." with no picker, and "Review them" on the Club page
  lands on "Your mistakes".
- After migration 0025: a member who hasn't answered sees **Who are you?** once (try it with a member
  whose student ID you imported: they land on their imported row, and the Accounts panel moves them to
  **Linked**). A wrong ID shows up under **Check these** or as "They typed …"; fix it with the "Move
  to…" picker.
