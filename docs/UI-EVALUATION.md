# UI and navigation evaluation

November 2026. Every page (Club, Play, Training, Games, My games, Roster, Coach) was used in
local mode at 1280px and at 375px, in both themes, with a roster of eight and eight games.
Dialogs opened: log a game, Import PGN, Enter a scoresheet, Import CSV, report card. The account
menu only exists with a backend, so it was read in code rather than used.

The markup itself was evaluated separately (`html-structure-evaluation.md`, findings H1–H14 and
S1–S11). Most of those were already fixed on the base branch: the nav is real links (H2), rows
have a real control (H3), dialogs are native `<dialog>` (H1), faint text passes contrast (H9).
They are not repeated here. This document is about how the app feels to use and to get around.

## What works

- Nothing scrolls sideways at 375px, on any page, in either theme.
- Both themes are complete. No page has an unreadable colour in light or dark.
- The dialogs open, trap focus, close on Escape and return focus.
- The board is the right size on a phone and on a laptop.

So the app is not broken. It is plain, and it is hard to find your way around.

## Findings, most important first

### 1. Navigation is a flat row of seven words

Club, Play, Training, Games, My games, Roster, Coach sit in one row with equal weight. Nothing
says which are for playing, which are records, and which are the coach's. "Games" and
"My games" read as the same thing. On a phone the row does not fit: it scrolls sideways under a
fade, so Roster and Coach are off screen until you discover the row moves.

*A polished app would:* group the pages by what they are for, give each an icon, and keep the
whole menu visible. On a laptop that is a sidebar; on a phone it is a bottom tab bar with the
four pages people use most and a "More" sheet for the rest.

### 2. No page says where you are

The only page title is hidden (for screen readers). A sighted user's only cue is a tinted word
in the nav. Pages start straight into a panel: Games opens on "Game archive", Roster on
"Roster", Coach on "Analysis queue".

*A polished app would:* give every page a visible title with a line of context, and put the
page's main actions beside it.

### 3. The main actions look like footnotes

"+ Log a game", "Import PGN", "Enter a scoresheet", "Import CSV", "+ Add player", "Report card",
"Edit", "Archive graduate" and "Remove" are all small red text in a panel header. Nothing is a
button, nothing is primary, and a destructive action looks the same as a harmless one. At 375px
the three Games actions wrap onto two ragged lines.

*A polished app would:* use real buttons in the page header, one of them primary, with the
dangerous ones set apart.

### 4. Opening a game loses your place

Clicking a row on Games opens the game in a second panel *below the whole table*. With eight
games that is a screen away; with two hundred it is far off. Nothing scrolls you there, the URL
does not change (so Back does not close it and the game cannot be linked), and there is no way
back to the row you came from. The link column says "PGN" when what opens is the board review.

*A polished app would:* make a game its own view with its own URL, a breadcrumb
(Games › Maya Okafor vs Priya Natarajan) and a back link, so the browser's Back button works.

### 5. There is no way to jump to a player or a game

To see one player you go to Roster and read down the table. To find one game you go to Games
and set two filters. Names on the leaderboard, in the games table and in the coach's lists are
not links.

*A polished app would:* have a quick search (Ctrl K, or a search button) across pages, players
and games, and make names link to the player.

### 6. The Club page opens on a test control and a slogan

In local mode the first thing on the home page is a "Preview a player's home page" select, then
a hero that repeats the app name with two buttons. The stat tiles are four identical boxes. The
leaderboard is a bare table.

*A polished app would:* open on a greeting with the things people come to do (play, train, log
a game) as large targets, show the top of the leaderboard with some presence, and move the
preview control to where a coach would look for it.

### 7. Every surface looks the same

Panels, tiles, tables and forms are the same flat box with the same border. There is no
elevation, almost no use of the accent colour beyond text, no icons anywhere, and one heading
size inside pages. Players are plain text with nothing to tell them apart at a glance.

*A polished app would:* have a visible type scale, a few levels of elevation, initials avatars
for players, icons in navigation and on actions, and tables with clear row states.

### 8. Waiting and empty states are a line of grey text

A page that is loading says "Loading…". An empty list says "No games yet." in hint text. My
games in local mode is a dead end with one sentence and no way on.

*A polished app would:* show a skeleton while loading, and give each empty state an icon, a
sentence and the action that fills it.

### 9. Nothing moves

Pages swap instantly, dialogs appear with no transition, and only buttons have press feedback.

*A polished app would:* fade pages and dialogs in briefly, and turn all of it off under
`prefers-reduced-motion`.

### 10. Coach is one long scroll

Six panels stacked (analysis queue, review queue, club weaknesses, coach tools, player
progress, recent activity) with nothing to jump between them. Links in the review queue use the
browser's default blue.

*A polished app would:* give the page a row of jump links and style its links like the rest of
the app.

### 11. Small things

- The theme switch is a text button ("Light theme") that takes more room than the brand on a
  phone.
- The report card closes with a red text link.
- The footer reads "Chess Club app, v0.1".
- On Play at 1280×800 the clock for the side to move sits at the fold.

## What part 2 builds

In order: the app shell (1), page headers and real actions (2, 3), the game view (4), quick
search and player links (5), the Club page (6), the visual system (7), states (8) and
motion (9), then Coach jump links and the small things (10, 11).

Not in scope: the board, the rules engine, ratings, and anything that touches the database.
