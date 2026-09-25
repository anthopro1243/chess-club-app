-- 0014_assessment_source_engine.sql
--
-- BACKFILL FILE, written 2026-09-25 overnight WITHOUT database access.
-- Live migration: 20260917194812 assessment_source_engine (already applied).
--
-- STATUS: reconstructed from the application code, NOT confirmed.
-- Certain: `assessments.source` exists with values 'coach' / 'engine'
-- (src/data/assessmentStore.js), and `assessed_on` exists and is part of a
-- unique key, because the store upserts with onConflict 'player_id,assessed_on'
-- (PostgREST refuses an onConflict that no unique index matches).
-- UNCONFIRMED: the default, the check, the exact generated expression for
-- assessed_on (HANDOFF §5 calls it "generated date"), and whether the unique
-- index also includes `source` or has a WHERE clause.
--
-- DO NOT RUN AGAINST PRODUCTION (already applied there). For fresh projects.
-- Guarded with `if not exists`, but a differently named live index or check
-- would be duplicated. On a fresh project, the unique index fails if two
-- assessments for one player fall on the same UTC day — dedupe first.
--
-- Confirm with:
--   select column_name, data_type, column_default, is_generated, generation_expression
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'assessments'
--     and column_name in ('source', 'assessed_on');
--   select indexname, indexdef from pg_indexes where tablename = 'assessments';

begin;

alter table public.assessments
  add column if not exists source text not null default 'coach';   -- UNCONFIRMED default

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.assessments'::regclass and conname = 'assessments_source_check'
  ) then
    alter table public.assessments
      add constraint assessments_source_check check (source in ('coach', 'engine'));   -- UNCONFIRMED
  end if;
end $$;

-- UNCONFIRMED expression. `at time zone 'UTC'` makes it immutable, which a
-- generated column requires; the live column may use a different zone.
alter table public.assessments
  add column if not exists assessed_on date
  generated always as ((assessed_at at time zone 'UTC')::date) stored;

-- UNCONFIRMED shape (see header). Matches the client's onConflict target.
create unique index if not exists assessments_player_day_key
  on public.assessments (player_id, assessed_on);

commit;
