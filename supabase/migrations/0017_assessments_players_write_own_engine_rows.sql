-- 0017_assessments_players_write_own_engine_rows.sql
-- Applied to production as migration 20260924161942. Everything below this header is the
-- EXACT SQL applied, recovered 2026-09-25 from supabase_migrations.schema_migrations
-- (md5 594a5764ceabf4e28bf12eecb8106d32). Already applied: do NOT re-run against production.

create policy "Players write own engine assessments" on public.assessments for insert
  with check (owns_player(player_id) and source = 'engine');
create policy "Players update own engine assessments" on public.assessments for update
  using (owns_player(player_id) and source = 'engine')
  with check (owns_player(player_id) and source = 'engine');
