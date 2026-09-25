-- 0016_game_analyses_opponent_side_for_own_games.sql
-- Applied to production as migration 20260924161814. Everything below this header is the
-- EXACT SQL applied, recovered 2026-09-25 from supabase_migrations.schema_migrations
-- (md5 8a891d6f883366e0753b17dc28cddc1c). Already applied: do NOT re-run against production.

create or replace function public.owns_game(p_game_id text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.games g
     where g.id = p_game_id
       and my_player_id() is not null
       and (g.white_player_id = my_player_id() or g.black_player_id = my_player_id()));
$$;

drop policy if exists game_analyses_insert on public.game_analyses;
create policy game_analyses_insert on public.game_analyses for insert
  with check (is_coach() or owns_player(player_id) or (player_id is null and owns_game(game_id)));

drop policy if exists game_analyses_update on public.game_analyses;
create policy game_analyses_update on public.game_analyses for update
  using (is_coach() or owns_player(player_id) or (player_id is null and owns_game(game_id)))
  with check (is_coach() or owns_player(player_id) or (player_id is null and owns_game(game_id)));

drop policy if exists game_analyses_select on public.game_analyses;
create policy game_analyses_select on public.game_analyses for select
  using (is_coach() or owns_player(player_id) or (player_id is null and owns_game(game_id)));
