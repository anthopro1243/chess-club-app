-- Migration 4 — linked Chess.com and Lichess accounts.
--
-- Run this once in the Supabase SQL editor. Safe to run more than once.
-- Adds the two columns a player row needs to pull in their online games:
-- which accounts belong to them, and which games have already been counted.

-- Which online accounts this player has linked, keyed by platform:
--   { "chesscom": { "username", "url", "ratings", "connectedAt",
--                   "lastSyncedAt", "lastGameAt" }, "lichess": { ... } }
alter table public.players
  add column if not exists connections jsonb default '{}'::jsonb;

-- Platform game ids already folded into this player's club rating. This is
-- what stops a second sync from rating the same game twice, so it has to
-- live next to the rating it protects.
alter table public.players
  add column if not exists imported_game_ids jsonb default '[]'::jsonb;

update public.players set connections       = '{}'::jsonb where connections       is null;
update public.players set imported_game_ids = '[]'::jsonb where imported_game_ids is null;

-- Imported games are archived alongside club games, so `mode` now also
-- carries 'chesscom' and 'lichess' next to the existing 'human' and
-- 'computer'. No schema change needed — it is already free text — but the
-- index below keeps the Games page's filter fast as the archive grows.
create index if not exists games_mode_idx on public.games (mode);
