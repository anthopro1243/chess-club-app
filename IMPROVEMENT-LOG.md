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
| 2 | **Roster shows Add / Edit / Remove to every member.** "Remove" makes a player vanish from that member's screen (the database silently refuses it), "Edit" on someone else ends in a red "Couldn't save" banner, and a member can rewrite their own coach rubric. Every member can also read every other member's skill assessment, which the analyzer spec (Decision 4) rules out. | every member | open |
| 3 | **Accounts aren't tied to the real student.** An approved member with no player row sees an empty home page; the only way in is a "Join the roster" form hidden in the account menu, which makes a *second* roster row even when the coach already imported that student. My games says "Ask the coach to link it", but there is no way for the coach to link anything. `player_private` (student ID) is coach-only, so a member can't be matched to an imported row. | new members, coach | open |
| 4 | **Training starts on "Practice only".** A member has to pick themselves out of the full roster before puzzles count, and can pick someone else (their solves then change another member's rating). "Positions to review" on the home page says "In Training, pick yourself and choose 'Your mistakes'": three extra taps. | every member | open |
| 5 | **SEM fonts missing.** Oswald + Public Sans aren't loaded; the app uses system fonts. | everyone | open |
| 6 | **Brand-new member home page** tells them to link Chess.com/Lichess "from the account menu" instead of giving them the button. | new members | open |
| 7 | **First load is one 830 kB script** (238 kB gzipped) on phones: every page, the 402 puzzles and the scoresheet editor load before the home page shows. | everyone, on phones | open |

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

---

## For the coach

_Kept current after every push._

**Branch:** `claude/laughing-mccarthy-v2msz3`

Nothing pushed yet beyond this audit. Don't merge yet.
