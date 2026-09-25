-- 0015_game_analyses_owner_update.sql
-- Applied to production as migration 20260924161500. Everything below this header is the
-- EXACT SQL applied, recovered 2026-09-25 from supabase_migrations.schema_migrations
-- (md5 2c63e0d71d302e172b7c8c247024c8c6). Already applied: do NOT re-run against production.

drop policy if exists game_analyses_update on public.game_analyses;
create policy game_analyses_update on public.game_analyses
  for update
  using (is_coach() or owns_player(player_id))
  with check (is_coach() or owns_player(player_id));
