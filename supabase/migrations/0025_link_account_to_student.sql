-- 0025 — link each member's account to the real student ("Who are you?").
--
-- NOT APPLIED. Written 2026-10-05; the coach applies it (IMPROVEMENT-LOG.md →
-- "For the coach"). The app works without it: the "Who are you?" step simply
-- doesn't show until these functions exist.
--
-- Additive only. One new table, four new functions. No existing table,
-- column, row or policy is changed. Safe to run twice.
--
-- How it works
--   After a member is approved, the app asks once for their first name, last
--   name and DISD student ID, and calls link_my_account(). That function:
--     * matches the ID against player_private (the coach's imported roster)
--       and links the account to that roster row when it has no account yet;
--     * otherwise fills the member's own player row, or creates one, and
--       stores the ID in player_private;
--     * never overwrites a link or an ID the coach already has: if the ID is
--       on someone else's row, the answer is recorded as a "clash" for the
--       coach to sort out on the Roster page, and the member still gets in.
--   Each answer is kept in account_links (coach-only), which is also what
--   stops the question being asked twice.
--
--   Student IDs stay coach-only: player_private's policy is untouched. A
--   member reads back only their own ID, through my_account_link().
--
-- Depends on 0005 (is_coach, is_approved, profiles), 0008 (players.deleted_at)
-- and 0018 (player_private).

-- ---------------------------------------------------------------------------
-- 1. What each member answered, and what the app did with it.
-- ---------------------------------------------------------------------------
create table if not exists public.account_links (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  first_name      text not null,
  last_name       text not null,
  student_id      text not null,
  player_id       text references public.players(player_id) on delete set null,
  -- matched: linked to the coach's imported row with that ID
  -- updated: the member's existing row got the name and ID
  -- created: a new roster row was made from what they typed
  -- clash:   the ID belongs to another row; the coach decides
  outcome         text not null check (outcome in ('matched', 'updated', 'created', 'clash')),
  created_player  boolean not null default false,
  answered_at     timestamptz not null default now(),
  resolved_at     timestamptz
);

comment on table public.account_links is
  'Answers to the one-time "Who are you?" step (name + DISD student ID). Coaches only.';

alter table public.account_links enable row level security;

drop policy if exists account_links_coach_all on public.account_links;
create policy account_links_coach_all on public.account_links
  for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

-- ---------------------------------------------------------------------------
-- 2. The member's side: has this account answered, and what is linked?
--    Returns only the caller's own row and own student ID.
-- ---------------------------------------------------------------------------
create or replace function public.my_account_link()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'answered',   al.user_id is not null,
    'outcome',    al.outcome,
    'player_id',  p.player_id,
    'student_id', pp.student_id
  )
  from (select auth.uid() as uid) me
  left join public.account_links al on al.user_id = me.uid
  left join public.players p on p.user_id = me.uid and p.deleted_at is null
  left join public.player_private pp on pp.player_id = p.player_id
  where me.uid is not null;
$$;

-- ---------------------------------------------------------------------------
-- 3. The member answers "Who are you?".
-- ---------------------------------------------------------------------------
create or replace function public.link_my_account(p_first text, p_last text, p_student_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid          uuid := auth.uid();
  v_first        text := left(btrim(coalesce(p_first, '')), 60);
  v_last         text := left(btrim(coalesce(p_last, '')), 60);
  v_sid          text := regexp_replace(coalesce(p_student_id, ''), '\D', '', 'g');
  v_name         text;
  v_mine         text;
  v_mine_sid     text;
  v_match        text;
  v_match_owner  uuid;
  v_match_gone   boolean;
  v_player       text;
  v_outcome      text;
  v_created      boolean := false;
  v_next         int;
begin
  if v_uid is null or not public.is_approved() then
    raise exception 'Only approved members can do this.' using errcode = '42501';
  end if;
  if v_first = '' or v_last = '' then
    raise exception 'Type your first and last name.' using errcode = '22023';
  end if;
  if v_sid !~ '^\d{7}$' then
    raise exception 'A DISD student ID is 7 digits.' using errcode = '22023';
  end if;
  v_name := v_first || ' ' || v_last;

  -- One link at a time, so two new members can't be handed the same CC-### id.
  perform pg_advisory_xact_lock(hashtext('public.link_my_account'));

  -- A retired row can still hold this account (Remove keeps user_id). It is
  -- off the roster, so free the account for an active row.
  update public.players set user_id = null
   where user_id = v_uid and deleted_at is not null;

  select player_id into v_mine from public.players where user_id = v_uid;

  select pp.player_id, p.user_id, p.deleted_at is not null
    into v_match, v_match_owner, v_match_gone
    from public.player_private pp
    join public.players p on p.player_id = pp.player_id
   where pp.student_id = v_sid;

  if v_match is not null and v_match = v_mine then
    -- Already linked to the row with this ID.
    v_player := v_mine;
    v_outcome := 'matched';

  elsif v_match is not null and v_match_owner is null and not v_match_gone then
    -- The coach imported this student and nobody has claimed the row yet.
    if v_mine is not null
       and exists (select 1 from public.games
                    where white_player_id = v_mine or black_player_id = v_mine) then
      -- Their self-made row already has games: don't move them blindly.
      v_player := v_mine;
      v_outcome := 'clash';
    else
      if v_mine is not null then
        -- An empty row they made with "Join the roster": retire it.
        update public.players set user_id = null, deleted_at = now() where player_id = v_mine;
      end if;
      update public.players set user_id = v_uid where player_id = v_match;
      v_player := v_match;
      v_outcome := 'matched';
    end if;

  elsif v_match is not null then
    -- The ID is on another member's row (or a retired one). Let them in on
    -- their own row and leave the ID question to the coach.
    v_outcome := 'clash';
    v_player := v_mine;

  elsif v_mine is not null then
    select student_id into v_mine_sid from public.player_private where player_id = v_mine;
    v_player := v_mine;
    if v_mine_sid is not null and v_mine_sid <> v_sid then
      -- The coach already has a different ID for this row.
      v_outcome := 'clash';
    else
      insert into public.player_private (player_id, student_id)
      values (v_mine, v_sid)
      on conflict (player_id) do update set student_id = excluded.student_id, updated_at = now();
      update public.players set name = v_name where player_id = v_mine;
      v_outcome := 'updated';
    end if;

  else
    v_outcome := 'created';
  end if;

  -- No row at all yet (new member, or a clash with nothing of their own):
  -- make one from what they typed, so they can use the app today.
  if v_player is null then
    select coalesce(max(nullif(regexp_replace(player_id, '\D', '', 'g'), '')::int), 0) + 1
      into v_next from public.players;
    v_player := 'CC-' || lpad(v_next::text, 3, '0');
    insert into public.players (player_id, user_id, name, joined, commitment, rubric)
    values (
      v_player, v_uid, v_name, current_date, 'Casual',
      '{"opening":5,"tactics":5,"positional":5,"endgame":5,"timeManagement":5,"boardVision":5,"resilience":5,"notation":5}'::jsonb
    );
    v_created := true;
    if v_outcome = 'created' then
      insert into public.player_private (player_id, student_id) values (v_player, v_sid);
    end if;
  end if;

  -- So the coach's member list shows a name instead of an id fragment.
  update public.profiles set display_name = v_name
   where user_id = v_uid and coalesce(display_name, '') = '';

  insert into public.account_links
    (user_id, first_name, last_name, student_id, player_id, outcome, created_player, answered_at, resolved_at)
  values (v_uid, v_first, v_last, v_sid, v_player, v_outcome, v_created, now(), null)
  on conflict (user_id) do update set
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    student_id = excluded.student_id,
    player_id = excluded.player_id,
    outcome = excluded.outcome,
    created_player = excluded.created_player,
    answered_at = excluded.answered_at,
    resolved_at = null;

  return jsonb_build_object('outcome', v_outcome, 'player_id', v_player);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. The coach fixes a link in one click.
--    p_player_id = a roster row: move the account there.
--    p_player_id = null: unlink; the member is asked "Who are you?" again.
--    A row the "Who are you?" step made for this account is retired when the
--    account leaves it, if it has no games, so a wrong ID leaves no stray row.
-- ---------------------------------------------------------------------------
create or replace function public.coach_link_account(p_user_id uuid, p_player_id text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_old text;
begin
  if not public.is_coach() then
    raise exception 'Coaches only.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('public.link_my_account'));

  if p_player_id is not null then
    if not exists (select 1 from public.players where player_id = p_player_id and deleted_at is null) then
      raise exception 'That roster row does not exist.' using errcode = '22023';
    end if;
    if exists (select 1 from public.players
                where player_id = p_player_id and user_id is not null and user_id <> p_user_id) then
      raise exception 'That roster row already has an account. Unlink it first.' using errcode = '22023';
    end if;
  end if;

  select player_id into v_old from public.players where user_id = p_user_id;
  if v_old is not distinct from p_player_id then
    update public.account_links set resolved_at = now() where user_id = p_user_id;
    return;
  end if;

  update public.players set user_id = null where user_id = p_user_id;
  if p_player_id is not null then
    update public.players set user_id = p_user_id where player_id = p_player_id;
  end if;

  if v_old is not null
     and exists (select 1 from public.account_links
                  where user_id = p_user_id and player_id = v_old and created_player)
     and not exists (select 1 from public.games
                      where white_player_id = v_old or black_player_id = v_old) then
    update public.players set deleted_at = now() where player_id = v_old;
    update public.player_private set student_id = null, updated_at = now() where player_id = v_old;
  end if;

  if p_player_id is null then
    delete from public.account_links where user_id = p_user_id;
  else
    update public.account_links
       set player_id = p_player_id, created_player = false, resolved_at = now()
     where user_id = p_user_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. The coach's list of accounts, with the sign-in email, so an account
--    that hasn't answered yet can still be recognised. auth.users is not
--    reachable over the API, hence a coach-only function.
-- ---------------------------------------------------------------------------
create or replace function public.coach_list_accounts()
returns table (user_id uuid, email text, display_name text, role text, status text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_coach() then
    raise exception 'Coaches only.' using errcode = '42501';
  end if;
  return query
    select pr.user_id, u.email::text, pr.display_name, pr.role, pr.status, pr.created_at
      from public.profiles pr
      join auth.users u on u.id = pr.user_id
     order by pr.created_at;
end;
$$;

revoke all on function public.my_account_link()                       from public, anon;
revoke all on function public.link_my_account(text, text, text)       from public, anon;
revoke all on function public.coach_link_account(uuid, text)          from public, anon;
revoke all on function public.coach_list_accounts()                   from public, anon;
grant execute on function public.my_account_link()                    to authenticated;
grant execute on function public.link_my_account(text, text, text)    to authenticated;
grant execute on function public.coach_link_account(uuid, text)       to authenticated;
grant execute on function public.coach_list_accounts()                to authenticated;
