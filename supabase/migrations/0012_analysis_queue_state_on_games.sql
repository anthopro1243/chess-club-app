-- 0012_analysis_queue_state_on_games.sql
-- Applied to production as migration 20260916222241. Everything below this header is the
-- EXACT SQL applied, recovered 2026-09-25 from supabase_migrations.schema_migrations
-- (md5 2ef9dc6f68ca6bff9df2b9d85b15d00e). Already applied: do NOT re-run against production.

-- 0012 — analysis queue state, on the games row itself.
--
-- A separate queue table would have to be kept in step with games as they are
-- inserted, deleted and soft-deleted. Putting the state on the row it describes
-- makes "every game has an analysis status" true by construction, and lets the
-- backfill be a single UPDATE.
--
-- claimed_at is the important column: a run that dies mid-analysis (tab closed,
-- laptop shut) leaves a row in 'running' forever unless someone can tell a live
-- claim from a stale one.
alter table public.games
  add column if not exists analysis_status text not null default 'pending'
    check (analysis_status in ('pending','running','done','failed','skipped')),
  add column if not exists analysis_attempts smallint not null default 0,
  add column if not exists analysis_error text,
  add column if not exists analysis_depth smallint,
  add column if not exists analysis_claimed_at timestamptz,
  add column if not exists analysis_updated_at timestamptz;

create index if not exists games_analysis_status_idx
  on public.games (analysis_status, played_at desc)
  where deleted_at is null;

comment on column public.games.analysis_status is
  'pending | running | done | failed | skipped. Drained by the in-app worker.';
comment on column public.games.analysis_claimed_at is
  'When a worker claimed this row. A running row older than ~15 minutes is stale and may be reclaimed.';

-- Mark what is already analysed as done, so the backfill does not redo work.
update public.games g
   set analysis_status = 'done',
       analysis_depth = a.depth,
       analysis_updated_at = a.analyzed_at
  from (select game_id, max(depth) as depth, max(analyzed_at) as analyzed_at
          from public.game_analyses group by game_id) a
 where a.game_id = g.id and g.analysis_status <> 'done';

-- A game with no PGN can never be analysed; saying so is more honest than
-- leaving it pending forever and looking like a backlog.
update public.games
   set analysis_status = 'skipped',
       analysis_error = 'no PGN'
 where (pgn is null or length(pgn) < 20) and analysis_status = 'pending';

-- Reclaim anything wedged in running from a previous life.
update public.games
   set analysis_status = 'pending', analysis_claimed_at = null
 where analysis_status = 'running'
   and (analysis_claimed_at is null or analysis_claimed_at < now() - interval '15 minutes');
