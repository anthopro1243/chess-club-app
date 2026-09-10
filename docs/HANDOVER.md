# Handover

How to pick this project up on a different machine, or hand it to whoever
coaches after you.

## Start here

1. **Read `PROGRESS.md` at the repo root.** It is the ledger: what is done,
   what is half done, and what needs doing next. Continue from the first
   unchecked item.
2. `docs/ARCHITECTURE.md` explains how the code fits together.
3. `docs/RUNBOOK.md` covers backups, migrations and deploys.

If you are Claude Code opening this repo for the first time: read
`PROGRESS.md` before touching anything, and note the ground rules in the
buildout prompt — do not refactor `src/engine/chess.js`, do not add runtime
dependencies without asking, and every schema change is a numbered migration.

## Getting it running

Needs Node 18 or newer.

```bash
npm install
npm test          # 180 assertions, all should pass
npm run dev       # http://localhost:5173
```

### The two environment variables

`.env.local` is deliberately **not** included in any archive of this project,
because credentials should not travel by email. Create it yourself:

```
VITE_SUPABASE_URL=https://rftlozmdyetubhjcutht.supabase.co
VITE_SUPABASE_ANON_KEY=<paste from the dashboard>
```

Get the anon key from **Supabase dashboard → Project Settings → API →
Project API keys → `anon` `public`**. It is safe in a browser bundle — it can
only do what the row-level security policies allow, which is nothing without
a signed-in, approved account — but it is still not something to email.

**Leave both unset** and the app runs entirely on browser-local storage with
no backend at all. That is a genuinely supported mode, useful for trying
things without touching the club's real data.

## What this is

A chess club management app for a 10-20 person scholastic club. React + Vite,
no router, no state library, no UI framework. Supabase for auth, Postgres and
realtime. A dependency-free chess engine in `src/engine/chess.js` verified by
a perft suite, and Stockfish 18 as WASM in `public/stockfish/`.

Deployed at https://chess-club-app-seven.vercel.app
Repo at https://github.com/anthopro1243/chess-club-app

## Deploying

Migration first, deploy second, always. Deploying code that writes columns
the database does not have yet breaks every write.

```bash
npm test
npm run build
npx vercel --prod
```

On Windows PowerShell, if `npx` is blocked by the execution policy, use
`npx.cmd` rather than changing the policy.

## Things that have already gone wrong, so you do not repeat them

- **The Supabase SQL editor commits statement by statement.** A migration that
  fails partway leaves the database half-changed. Every migration here is
  written to be safe to run twice; keep it that way.
- **Migrations were applied out of order once.** Migration 2 was skipped, so
  `players` had no `user_id`, and the failure surfaced eighty lines into a
  later migration as an unrelated-looking error. `0005` now preflights for it.
- **Failed cloud writes used to be invisible.** Every store logged to the
  console and carried on, so a database that had never accepted a single write
  looked completely healthy. `src/data/syncStatus.js` now puts failures on
  screen. Do not go back to swallowing them.
- **A trigger that silently rewrites data is worse than one that errors.** The
  privilege-protection trigger on `profiles` used to revert role changes
  quietly, which made the documented bootstrap step impossible while still
  reporting success.

## Access you will need

- Supabase project `rftlozmdyetubhjcutht` (owner: the coach's account)
- Vercel project `chess-club-app` under the `chess-club2` team
- GitHub repo `anthopro1243/chess-club-app`

Whoever takes this over needs to be added to all three, or given ownership.

## The one thing not to lose

The database. A season of assessments cannot be recreated — you cannot
re-score a game a child played in October. `docs/RUNBOOK.md` has the backup
and restore procedure, and restoring it once, before you need it, is the only
way to know it works.
