-- 0005 — roles, approval, invite codes, and coach-only notes.
--
-- Forward-only. Safe to run against a database with real rows. Drops
-- nothing and truncates nothing.
--
-- This is the foundation every later migration leans on: it introduces the
-- profile that carries a role, the helper functions that policies call, and
-- it replaces the existing "any signed-in user can do anything" policies on
-- players and games.
--
-- READ THE LAST SECTION BEFORE RUNNING. There is one step you have to
-- complete by hand or you will lock yourself out of your own coach tools.

-- ---------------------------------------------------------------------------
-- 1. Profiles: one per auth user, carrying role and approval status.
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  role          text not null default 'player'
                  check (role in ('player', 'coach', 'admin', 'parent')),
  status        text not null default 'pending'
                  check (status in ('pending', 'approved', 'suspended')),
  display_name  text,
  created_at    timestamptz not null default now(),
  approved_at   timestamptz,
  approved_by   uuid references auth.users(id)
);

comment on table public.profiles is
  'Role and approval state per account. A pending account can sign in but sees nothing.';

-- ---------------------------------------------------------------------------
-- 2. Helper functions.
--
-- All security definer so that a policy on `profiles` can ask about
-- `profiles` without recursing into its own policy. search_path is pinned
-- because a definer function without one is a privilege-escalation hole.
-- ---------------------------------------------------------------------------

create or replace function public.is_coach()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role in ('coach', 'admin') from public.profiles where user_id = auth.uid()),
    false);
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role = 'admin' from public.profiles where user_id = auth.uid()),
    false);
$$;

create or replace function public.is_approved()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select status = 'approved' from public.profiles where user_id = auth.uid()),
    false);
$$;

-- The player row belonging to the current account, if they have claimed one.
create or replace function public.my_player_id()
returns text language sql stable security definer set search_path = public as $$
  select player_id from public.players where user_id = auth.uid() limit 1;
$$;

-- Does the current account own this player row?
create or replace function public.owns_player(p_player_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.players
     where player_id = p_player_id and user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- 3. A profile is created automatically for every new account, as pending.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- A member may edit their own display name, but role and status are not
-- theirs to change. Rather than refusing the write, quietly hold those two
-- columns at their old values unless a coach is making the change.
create or replace function public.protect_profile_privileges()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_coach() then
    new.role   := old.role;
    new.status := old.status;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_privileges on public.profiles;
create trigger profiles_protect_privileges
  before update on public.profiles
  for each row execute function public.protect_profile_privileges();

alter table public.profiles enable row level security;

drop policy if exists "Read own profile, coaches read all" on public.profiles;
create policy "Read own profile, coaches read all"
  on public.profiles for select to authenticated
  using (user_id = auth.uid() or public.is_coach());

drop policy if exists "Update own profile, coaches update all" on public.profiles;
create policy "Update own profile, coaches update all"
  on public.profiles for update to authenticated
  using (user_id = auth.uid() or public.is_coach())
  with check (user_id = auth.uid() or public.is_coach());

-- ---------------------------------------------------------------------------
-- 4. Invite codes. A valid code approves the account immediately; without
--    one, the account waits for a coach.
-- ---------------------------------------------------------------------------

create table if not exists public.invite_codes (
  code        text primary key,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz,
  max_uses    integer not null default 1,
  uses        integer not null default 0,
  note        text
);

alter table public.invite_codes enable row level security;

-- Deliberately no select policy for members: a code should not be readable
-- by the people it gates. Redemption goes through the definer function below.
drop policy if exists "Coaches manage invite codes" on public.invite_codes;
create policy "Coaches manage invite codes"
  on public.invite_codes for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

create or replace function public.redeem_invite(p_code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_matched boolean := false;
begin
  update public.invite_codes
     set uses = uses + 1
   where code = p_code
     and (expires_at is null or expires_at > now())
     and uses < max_uses
  returning true into v_matched;

  if coalesce(v_matched, false) then
    update public.profiles
       set status = 'approved', approved_at = now()
     where user_id = auth.uid() and status = 'pending';
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public.redeem_invite(text) from public;
grant execute on function public.redeem_invite(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Coach notes move out of the player row into a table players cannot read.
--
--    The old column is backfilled and then blanked rather than dropped, so
--    nothing is lost and nothing is left exposed.
-- ---------------------------------------------------------------------------

create table if not exists public.coach_notes (
  id          bigserial primary key,
  player_id   text not null references public.players(player_id) on delete cascade,
  note        text not null default '',
  author_id   uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists coach_notes_player_idx on public.coach_notes (player_id);

alter table public.coach_notes enable row level security;

drop policy if exists "Only coaches touch coach notes" on public.coach_notes;
create policy "Only coaches touch coach notes"
  on public.coach_notes for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

insert into public.coach_notes (player_id, note, created_at)
select player_id, coach_notes, now()
  from public.players
 where coach_notes is not null
   and btrim(coach_notes) <> ''
   and not exists (
     select 1 from public.coach_notes cn where cn.player_id = players.player_id);

update public.players
   set coach_notes = ''
 where coach_notes is not null and btrim(coach_notes) <> '';

-- ---------------------------------------------------------------------------
-- 6. Replace the open policies on players and games.
--
--    Before this migration every policy was `using (true)` for any signed-in
--    account, which meant anyone who could reach the signup page could read
--    every row. Now: approved members read the roster, members edit only
--    their own row, coaches edit anything.
-- ---------------------------------------------------------------------------

drop policy if exists "Signed-in users can read the roster" on public.players;
drop policy if exists "Signed-in users can add players"    on public.players;
drop policy if exists "Signed-in users can edit players"   on public.players;
drop policy if exists "Signed-in users can remove players" on public.players;

create policy "Approved members read the roster"
  on public.players for select to authenticated
  using (public.is_approved());

create policy "Members claim a row, coaches add any"
  on public.players for insert to authenticated
  with check (public.is_coach() or (public.is_approved() and user_id = auth.uid()));

create policy "Members edit their own row, coaches edit any"
  on public.players for update to authenticated
  using (public.is_coach() or user_id = auth.uid())
  with check (public.is_coach() or user_id = auth.uid());

create policy "Only coaches remove players"
  on public.players for delete to authenticated
  using (public.is_coach());

drop policy if exists "Signed-in users can read games"   on public.games;
drop policy if exists "Signed-in users can add games"    on public.games;
drop policy if exists "Signed-in users can edit games"   on public.games;
drop policy if exists "Signed-in users can remove games" on public.games;

create policy "Approved members read games"
  on public.games for select to authenticated
  using (public.is_approved());

create policy "Approved members add games"
  on public.games for insert to authenticated
  with check (public.is_approved());

create policy "Players edit their own games, coaches edit any"
  on public.games for update to authenticated
  using (public.is_coach()
         or white_player_id = public.my_player_id()
         or black_player_id = public.my_player_id())
  with check (public.is_coach()
         or white_player_id = public.my_player_id()
         or black_player_id = public.my_player_id());

create policy "Only coaches remove games"
  on public.games for delete to authenticated
  using (public.is_coach());

-- ---------------------------------------------------------------------------
-- 7. Backfill profiles for accounts that already exist.
--
--    Everyone who signed up before this migration is approved, so nobody
--    loses access they already had.
-- ---------------------------------------------------------------------------

insert into public.profiles (user_id, status, approved_at)
select id, 'approved', now() from auth.users
on conflict (user_id) do nothing;

-- ===========================================================================
-- DO THIS BY HAND, NOW, IN THE SAME SQL EDITOR SESSION
-- ===========================================================================
--
-- Every existing account was just backfilled as role 'player'. Until you
-- make yourself an admin, nobody can approve new members, read coach notes,
-- or use the coach tools — including you.
--
-- Replace the address and run:
--
--   update public.profiles set role = 'admin'
--    where user_id = (select id from auth.users where email = 'you@example.com');
--
-- Then confirm it took:
--
--   select u.email, p.role, p.status
--     from public.profiles p join auth.users u on u.id = p.user_id
--    order by p.created_at;
--
-- ===========================================================================
