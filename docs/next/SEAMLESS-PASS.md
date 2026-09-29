# The "seamless" pass (done 2026-09-29 on the branch; see PROGRESS.md for what changed)

## What the owner asked for (his words)
"What I want right now is a seamless app. Don't add or delete features right now. Go through the app
and look at what buttons/actions are slow and non-responsive, and make it so when I click a button I
can feel the button actually does something rather than just clicking it. Also all the text the app
has feels like AI; make the app just not sound like AI."

Rules: no new features, no removed features. Only feel, speed and wording.

## Findings so far
- 142 buttons in the app. 66 have no class and get almost no styling: no hover, no press state.
  39 are `.link-button`; 22 `.primary`.
- Only `.button-grid` and `.puzzle-controls` buttons have a press effect (`translateY(1px)`,
  `src/styles/app.css` ~line 557). Nothing else moves when tapped.
- No `touch-action: manipulation` anywhere, so phones may add a tap delay.
- Slow (async) actions: nearly all already show a busy label and disable while working
  (PGN import, roster import, scoresheet save, account sync, member approval, analysis queue,
  "Analyse this game", archive graduate). Gaps found:
  - Coach → **Export spreadsheet**: shows a toast but the button is NOT disabled, so it can be
    clicked again while building (`src/pages/CoachPage.jsx` ~line 181).
  - **Mark reviewed** (review queue) and **Copy PGN / Copy FEN** give little or no feedback beyond the
    row vanishing / a toast.
- Not yet measured: which tabs and clicks actually freeze. `docs/next/measure-responsiveness.mjs` does
  it: build with `VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npx vite build --outDir <dir>`, serve with
  `npx vite preview --outDir <dir> --port 4174`, then
  `BASE=http://localhost:4174/ node docs/next/measure-responsiveness.mjs`. It seeds 30 players and 200
  games, slows the CPU 4x (Chromebook-like) and prints time-to-paint plus the longest freeze per action.

## Plan
1. **Press feedback for every button** (one CSS block at the end of app.css so it wins ties): a quick
   press (scale ~0.97), hover and transition on all buttons and link-buttons, a visible keyboard focus
   ring, `touch-action: manipulation`, and no grey tap flash on phones. Disabled stays clearly disabled.
2. **Busy states where missing**: disable Export while it builds ("Building…"); a short confirmation for
   Mark reviewed and copy buttons; a spinner style for `aria-busy` buttons.
3. **Fix real freezes** found by the measuring script (likely candidates: Games list with many games,
   Training puzzle filtering, Coach page summaries). Memoise or defer heavy work; never block a click.
4. **Rewrite the on-screen text** so it sounds like a person (a coach), not an AI:
   - short, plain sentences; no em-dash chains, no "one thing"/"land here"/"nothing here is saved"
     style phrasing, no over-explaining tooltips;
   - keep meaning and every label that the presentation notes (`docs/PRESENTATION-NEW-FEATURES.md`)
     refer to, or update those notes too;
   - covers page headings, buttons, hints, tooltips, empty states, errors and the plain-English mistake
     explanations (`src/analysis/explain.js`; its tests check some wording, so update them together).
5. Check on phone and desktop, run `npm test`, `npm run test:engine`, `npm run build`, push to the
   branch, and only push to `master` (live) when the owner says so.
