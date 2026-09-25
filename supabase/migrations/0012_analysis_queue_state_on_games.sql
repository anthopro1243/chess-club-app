-- 0012_analysis_queue_state_on_games.sql
--
-- BACKFILL FILE, written 2026-09-25 overnight WITHOUT database access.
-- Live migration: 20260916222241 analysis_queue_state_on_games (already applied).
--
-- STATUS: reconstructed from the application code, NOT confirmed against the
-- live schema. The column NAMES are certain (src/analysis/queue.js and
-- src/data/gamesStore.js read and write every one of them, and the app works
-- against production). The TYPES, DEFAULTS, the CHECK constraint and the
-- index are my best reading and are marked "UNCONFIRMED" below.
--
-- DO NOT RUN AGAINST PRODUCTION: it is already applied there. This file is
-- for replaying supabase/migrations/ onto a FRESH project. Every statement is
-- guarded (`if not exists`), so the columns would be a no-op on production —
-- but if the live constraint or index has a different name, this would add a
-- duplicate one.
--
-- To confirm before relying on this file, run on production and compare:
--   select column_name, data_type, column_default, is_nullable
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'games' and column_name like 'analysis_%'
--   order by column_name;
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.games'::regclass and conname like '%analysis%';
--   select indexname, indexdef from pg_indexes where tablename = 'games' and indexdef like '%analysis%';

begin;

alter table public.games
  -- UNCONFIRMED default. externalSync.js says rows are "inserted with
  -- analysis_status 'pending' by default", which is what this reproduces.
  add column if not exists analysis_status     text not null default 'pending',
  add column if not exists analysis_attempts   integer not null default 0,     -- UNCONFIRMED not null
  add column if not exists analysis_error      text,
  add column if not exists analysis_depth      integer,                        -- UNCONFIRMED (may be smallint)
  add column if not exists analysis_claimed_at timestamptz,
  add column if not exists analysis_updated_at timestamptz;                    -- UNCONFIRMED default (none assumed)

-- UNCONFIRMED: the five states the app uses (queue.js queueCounts()).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.games'::regclass and conname = 'games_analysis_status_check'
  ) then
    alter table public.games
      add constraint games_analysis_status_check
      check (analysis_status in ('pending', 'running', 'done', 'failed', 'skipped'));
  end if;
end $$;

-- UNCONFIRMED: an index for the claim query (status + newest first).
create index if not exists games_analysis_queue_idx
  on public.games (analysis_status, played_at desc)
  where deleted_at is null;

commit;
