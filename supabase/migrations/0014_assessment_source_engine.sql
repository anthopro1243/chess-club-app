-- 0014_assessment_source_engine.sql
-- Applied to production as migration 20260917194812. Everything below this header is the
-- EXACT SQL applied, recovered 2026-09-25 from supabase_migrations.schema_migrations
-- (md5 db98020ffd2c4448248f8cc5edcf0e92). Already applied: do NOT re-run against production.

alter table public.assessments
  add column if not exists source text not null default 'coach'
    check (source in ('coach','engine'));

comment on column public.assessments.source is
  'coach = typed by a human and authoritative. engine = derived from analysed games.';

-- A UTC-pinned generated column, because assessed_at::date depends on the
-- session timezone and so cannot be indexed directly.
alter table public.assessments
  add column if not exists assessed_on date
    generated always as (((assessed_at at time zone 'UTC'))::date) stored;

create index if not exists assessments_player_time_idx
  on public.assessments (player_id, assessed_at desc);

-- One engine assessment per player per day. The scores shift a little after
-- every game; a row per game would bury the coach's own entries in noise.
create unique index if not exists assessments_engine_daily_idx
  on public.assessments (player_id, assessed_on)
  where source = 'engine';
