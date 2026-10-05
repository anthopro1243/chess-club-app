-- Scratch-database stand-in for the pieces of Supabase that 0025 depends on,
-- so supabase/tests/0025-link-account.sql can run on a plain local Postgres.
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
  status text not null default 'pending',
  display_name text,
  created_at timestamptz not null default now()
);
create table public.players (
  player_id text primary key,
  user_id uuid unique references auth.users(id) on delete set null,
  name text not null,
  grade text default '',
  joined date,
  commitment text default 'Casual',
  rubric jsonb default '{}'::jsonb,
  deleted_at timestamptz
);
create table public.games (
  id text primary key,
  white_player_id text references public.players(player_id),
  black_player_id text references public.players(player_id)
);
-- 0005 helpers, verbatim.
create function public.is_coach() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('coach', 'admin') from public.profiles where user_id = auth.uid()), false);
$$;
create function public.is_approved() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select status = 'approved' from public.profiles where user_id = auth.uid()), false);
$$;
-- 0018 player_private, verbatim shape and policy.
create table public.player_private (
  player_id text primary key references public.players(player_id) on delete cascade,
  student_id text unique,
  school_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.player_private enable row level security;
create policy player_private_coach_all on public.player_private for all to authenticated
  using (public.is_coach()) with check (public.is_coach());
grant select, insert, update, delete on all tables in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
