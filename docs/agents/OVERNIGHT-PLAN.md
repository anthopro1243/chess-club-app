# Overnight autonomous plan

The owner (Anthony) is offline. Work autonomously until usage runs out. Read COWORK-PROMPT.md and HANDOFF.md first and follow them, with these rules for unattended work:

- Never merge or push to master; every push to master deploys to production. Use one feature branch per item, branched from the branch this plan is on, and push each one so Vercel builds a preview.
- You have no database access. Put any schema or data change in a new file in supabase/migrations/ (or supabase/pending/ for one-off data fixes) for Anthony to apply. Never claim something was applied.
- Before each commit, npm test, npm run test:engine and npm run build must all pass. New logic goes in pure modules with tests, including at least one negative case.
- Don't touch auth, sign-up, passwords, invites or security (COWORK-PROMPT §4). Don't start tournament mode; it waits on Anthony's answer about team vs individual scoring.
- Never stop to ask a question. Make the most conservative choice, record it under "Decisions I made overnight" in PROGRESS.md, and continue.

## Work in this order

1. **Finish the bulk roster import** on its branch, following the spec in PROGRESS.md and HANDOFF.md:
   - The CSV comes from a Google Form. Headers: Timestamp, Email Address, Full name, Student ID (exactly 7 digits), Grade (9–12), "Do you want to compete in tournaments?" (Yes → Competitive, else Casual), Experience, Chess.com username, Lichess username, US Chess ID, "What do you want to get better at?", Parent/guardian email.
   - Student ID and school email go in a coach-only table, never in players.
   - Dedupe on Student ID, then email, then name (ignoring case and extra spaces).
   - Show a preview before writing anything. Assign CC-### IDs in Timestamp order.

2. **Hide soft-deleted players everywhere.** CC-003 is soft-deleted test data, but its skill scores and games still load. Filter deleted players out of the leaderboard, club skill profile, Coach page and player pickers. Make the analysis queue skip games whose only club player is deleted. Write supabase/pending/skip-cc003-games.sql to set analysis_status = 'skipped' on CC-003's pending and failed games. Do not apply it.

3. **Wire src/data/pgnImport.js into the Games page.** Add paste and upload of PGN, with a player picker for each side. Imported games are archived and queued for analysis.

4. **Make the app feel seamless:**
   - Nothing should ever look stuck. Every async action gets a loading state, an empty state and a readable error state.
   - No spinner runs forever: add timeouts with automatic retry.
   - Replace manual chores with automatic behaviour where it's safe:
     - sync linked Chess.com/Lichess accounts when the app opens;
     - analyse in the background, the viewer's own games first;
     - retry failed analyses automatically with backoff;
     - save optimistically.
   - Show a small, unobtrusive progress indicator for background analysis.
   - Keep coach decisions (member approval, assessments, export) as buttons.
   - Analysis still needs an open browser tab (HANDOFF §11). Don't try to move it to a server.

5. **If usage remains:** write migrations 0012–0017 as far as HANDOFF §5 documents them, and mark anything that isn't confirmed against the live database.

## After every item
Update HANDOFF.md §6–§9 and §12, append to PROGRESS.md, commit, and push that item's branch.

## When you're about to run out
Push everything. At the top of PROGRESS.md, write a "Morning summary" containing:
- every branch name and its Vercel preview URL;
- the SQL files Anthony must apply;
- the decisions you made;
- what's unfinished.
