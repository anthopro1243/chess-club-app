-- 0026 — two-player game ratings, coach-only player fields, who may log a
-- game, and erasing one student on request.
--
-- NOT APPLIED. Written 2026-11-13 with the fixes from EVALUATION.md
-- (§2.4, §3.3, §3.4, §3.11). Apply after 0025, from the Supabase SQL editor
-- or the connector. Safe to run twice. The app works before it is applied:
-- the client falls back to the old behaviour when record_club_game_ratings
-- is missing.
--
-- Depends on 0005 (is_coach, is_approved, owns_player, my_player_id) and
-- 0008 (players.deleted_at).

-- ---------------------------------------------------------------------------
-- 1. A club game between two members, rated in one transaction.
--
--    The browser computes the Glicko-2 result (glicko2.js) and sends each
--    side's new club_rating plus the one history entry to append. Anyone who
--    played in the game may call it, or a coach. Two members playing on one
--    tablet used to end in "Couldn't save the roster" because a member may
--    only write their own row.
-- ---------------------------------------------------------------------------
create or replace function public.record_club_game_ratings(
  p_white text, p_white_rating jsonb, p_white_entry jsonb,
  p_black text, p_black_rating jsonb, p_black_entry jsonb
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me text := public.my_player_id();
begin
  if auth.uid() is null or not public.is_approved() then
    raise exception 'Only approved members can do this.' using errcode = '42501';
  end if;
  if not public.is_coach() and v_me is distinct from p_white and v_me is distinct from p_black then
    raise exception 'Only the players in a game, or a coach, can rate it.' using errcode = '42501';
  end if;
  if p_white = p_black then
    raise exception 'A game needs two different players.' using errcode = '22023';
  end if;

  update public.players
     set club_rating = p_white_rating,
         rating_history = (
           select coalesce(jsonb_agg(e order by ord), '[]'::jsonb)
             from (
               select e, ord
                 from jsonb_array_elements(coalesce(rating_history, '[]'::jsonb)
                        || case when p_white_entry is null then '[]'::jsonb else jsonb_build_array(p_white_entry) end)
                      with ordinality as t(e, ord)
                order by ord desc
                limit 500
             ) newest
         )
   where player_id = p_white and deleted_at is null;

  update public.players
     set club_rating = p_black_rating,
         rating_history = (
           select coalesce(jsonb_agg(e order by ord), '[]'::jsonb)
             from (
               select e, ord
                 from jsonb_array_elements(coalesce(rating_history, '[]'::jsonb)
                        || case when p_black_entry is null then '[]'::jsonb else jsonb_build_array(p_black_entry) end)
                      with ordinality as t(e, ord)
                order by ord desc
                limit 500
             ) newest
         )
   where player_id = p_black and deleted_at is null;
end;
$$;

revoke all on function public.record_club_game_ratings(text, jsonb, jsonb, text, jsonb, jsonb) from public, anon;
grant execute on function public.record_club_game_ratings(text, jsonb, jsonb, text, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Fields only a coach sets.
--
--    A member may update their own row (puzzle stats, linked accounts, their
--    goal), but the coach's judgements stay the coach's: the rubric, dated
--    assessments, coach notes, the US Chess rating (which tops the
--    leaderboard) and whether the row is retired. Same pattern as
--    protect_profile_privileges in 0005.
--
--    Not SECURITY DEFINER on purpose: current_user is then 'authenticated'
--    for a request from the app, but the function owner inside definer
--    functions such as link_my_account, which must still be able to retire
--    an empty row.
-- ---------------------------------------------------------------------------
create or replace function public.protect_player_coach_fields()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') or public.is_coach() then
    return new;
  end if;
  new.rubric      := old.rubric;
  new.assessments := old.assessments;
  new.coach_notes := old.coach_notes;
  new.deleted_at  := old.deleted_at;
  new.ratings     := jsonb_set(
                       coalesce(new.ratings, '{}'::jsonb), '{uscf}',
                       coalesce(old.ratings -> 'uscf', 'null'::jsonb));
  return new;
end;
$$;

drop trigger if exists players_protect_coach_fields on public.players;
create trigger players_protect_coach_fields
  before update on public.players
  for each row execute function public.protect_player_coach_fields();

-- ---------------------------------------------------------------------------
-- 3. Who may log a game: a coach, a player in it, or anyone for a game with
--    no club player on either side (a guest game). A member could otherwise
--    put games between two classmates into both of their My games, where
--    they are analysed and turned into puzzles.
-- ---------------------------------------------------------------------------
drop policy if exists "Approved members add games" on public.games;
create policy "Approved members add games"
  on public.games for insert to authenticated
  with check (
    public.is_approved() and (
      public.is_coach()
      or public.owns_player(white_player_id)
      or public.owns_player(black_player_id)
      or (white_player_id is null and black_player_id is null)
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Erase one student completely, for a family's request (coach only).
--
--    Soft delete (Remove on the Roster page) keeps everything so a season's
--    records stay intact. This is the other path: the player row goes, which
--    cascades to their analyses, skill scores, puzzles, attempts, private
--    row and assessments. Games stay for the opponent, with this student's
--    side renamed and unlinked. The sign-in account is deleted too.
--
--    Usage (SQL editor or the app):  select public.erase_student('CC-012');
-- ---------------------------------------------------------------------------
create or replace function public.erase_student(p_player_id text)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  v_user uuid;
begin
  if auth.uid() is not null and not public.is_coach() then
    raise exception 'Only a coach can erase a student.' using errcode = '42501';
  end if;
  select user_id into v_user from public.players where player_id = p_player_id;
  if not found then
    raise exception 'No player %.', p_player_id using errcode = '22023';
  end if;

  update public.games set white_name = 'Former member', white_player_id = null,
         pgn = regexp_replace(coalesce(pgn, ''), '\[White "[^"]*"\]', '[White "Former member"]')
   where white_player_id = p_player_id;
  update public.games set black_name = 'Former member', black_player_id = null,
         pgn = regexp_replace(coalesce(pgn, ''), '\[Black "[^"]*"\]', '[Black "Former member"]')
   where black_player_id = p_player_id;

  delete from public.players where player_id = p_player_id;
  if v_user is not null then
    delete from auth.users where id = v_user;
  end if;

  return jsonb_build_object('player_id', p_player_id, 'account_deleted', v_user is not null);
end;
$$;

revoke all on function public.erase_student(text) from public, anon;
grant execute on function public.erase_student(text) to authenticated;
