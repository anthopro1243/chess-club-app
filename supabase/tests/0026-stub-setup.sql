-- Scratch-database stand-in for the pieces of Supabase that 0026 depends on.
-- NEVER run this against the real project: it creates a fake auth schema.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;
grant usage on schema auth to authenticated;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'player',
  status text not null default 'pending'
);
create table public.players (
  player_id text primary key,
  user_id uuid unique references auth.users(id) on delete set null,
  name text not null,
  goal text default '',
  rubric jsonb default '{}'::jsonb,
  assessments jsonb default '[]'::jsonb,
  coach_notes text default '',
  ratings jsonb default '{}'::jsonb,
  club_rating jsonb,
  rating_history jsonb default '[]'::jsonb,
  deleted_at timestamptz
);
create table public.games (
  id text primary key,
  white_player_id text references public.players(player_id) on delete set null,
  black_player_id text references public.players(player_id) on delete set null,
  white_name text not null default 'White',
  black_name text not null default 'Black',
  pgn text default ''
);
create table public.puzzle_attempts (
  id serial primary key,
  player_id text not null references public.players(player_id) on delete cascade
);
-- 0005 helpers and policies, verbatim shape.
create function public.is_coach() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('coach', 'admin') from public.profiles where user_id = auth.uid()), false);
$$;
create function public.is_approved() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select status = 'approved' from public.profiles where user_id = auth.uid()), false);
$$;
create function public.my_player_id() returns text language sql stable security definer set search_path = public as $$
  select player_id from public.players where user_id = auth.uid() limit 1;
$$;
create function public.owns_player(p_player_id text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.players where player_id = p_player_id and user_id = auth.uid());
$$;
alter table public.players enable row level security;
create policy players_read on public.players for select to authenticated using (public.is_approved());
create policy players_update on public.players for update to authenticated
  using (public.is_coach() or user_id = auth.uid()) with check (public.is_coach() or user_id = auth.uid());
alter table public.games enable row level security;
create policy games_read on public.games for select to authenticated using (public.is_approved());
create policy "Approved members add games" on public.games for insert to authenticated with check (public.is_approved());
grant select, insert, update, delete on all tables in schema public to authenticated;
