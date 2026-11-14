-- 0028: run the "who is asking" checks in row-level policies once per query,
-- not once per row.
--
-- Every policy called is_coach(), is_approved(), owns_player(player_id) and
-- friends as plain function calls, so Postgres ran them again for each row it
-- looked at. On game_analyses (about 1,400 rows) that took ~11 seconds for the
-- coach and hit the 8-second statement timeout: the app loaded but every page
-- that needs analyses stayed blank.
--
-- The fix is Supabase's documented one: wrap the call in a scalar subquery,
-- `(select is_coach())`, which Postgres evaluates once and reuses. The per-row
-- ownership checks become set lookups against the caller's own player and game
-- ids, computed once by two new SECURITY DEFINER helpers. What each policy
-- allows is unchanged.
--
-- Safe to run more than once: already-wrapped calls are not wrapped again.
-- Migrations written after this one should use the wrapped form directly.

create or replace function public.my_player_ids()
returns setof text
language sql stable security definer set search_path = public
as $$
  select player_id from public.players where user_id = auth.uid();
$$;

create or replace function public.my_game_ids()
returns setof text
language sql stable security definer set search_path = public
as $$
  select g.id from public.games g
   where my_player_id() is not null
     and (g.white_player_id = my_player_id() or g.black_player_id = my_player_id());
$$;

revoke all on function public.my_player_ids() from public, anon;
revoke all on function public.my_game_ids() from public, anon;
grant execute on function public.my_player_ids() to authenticated;
grant execute on function public.my_game_ids() to authenticated;

create or replace function pg_temp.once_per_query(expr text)
returns text language plpgsql as $$
begin
  if expr is null then return null; end if;
  expr := regexp_replace(expr, 'owns_player\(([^()]+)\)', '(\1 IN ( SELECT my_player_ids()))', 'g');
  expr := regexp_replace(expr, 'owns_game\(([^()]+)\)',   '(\1 IN ( SELECT my_game_ids()))',   'g');
  expr := regexp_replace(expr, '(?<!SELECT )\m(is_coach|is_approved|my_player_id)\(\)', '( SELECT \1())', 'g');
  expr := regexp_replace(expr, '(?<!SELECT )auth\.uid\(\)', '( SELECT auth.uid())', 'g');
  return expr;
end $$;

do $$
declare
  p record;
  new_using text;
  new_check text;
  stmt text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
  loop
    new_using := pg_temp.once_per_query(p.qual);
    new_check := pg_temp.once_per_query(p.with_check);
    if new_using is not distinct from p.qual and new_check is not distinct from p.with_check then
      continue;
    end if;
    stmt := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if new_using is not null then stmt := stmt || format(' using (%s)', new_using); end if;
    if new_check is not null then stmt := stmt || format(' with check (%s)', new_check); end if;
    execute stmt;
  end loop;
end $$;
