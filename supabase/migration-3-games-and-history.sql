-- Migration 3 — game archive, progress history, attendance.
--
-- Run this once in the Supabase SQL editor. Safe to run more than once.
-- Adds: per-player rating/assessment/attendance history, and a `games`
-- table for the club's game archive.

-- 1. Per-player history, stored on the player row so it syncs with
--    everything else already there.
alter table public.players
  add column if not exists rating_history jsonb default '[]'::jsonb;

alter table public.players
  add column if not exists assessments jsonb default '[]'::jsonb;

alter table public.players
  add column if not exists attendance jsonb default '[]'::jsonb;

update public.players set rating_history = '[]'::jsonb where rating_history is null;
update public.players set assessments   = '[]'::jsonb where assessments   is null;
update public.players set attendance    = '[]'::jsonb where attendance    is null;

-- 2. The game archive. A game belongs to two players at once, so it gets
--    its own table rather than hanging off either player's row.
create table if not exists public.games (
  id text primary key,
  played_at timestamptz not null default now(),
  white_player_id text references public.players(player_id) on delete set null,
  black_player_id text references public.players(player_id) on delete set null,
  white_name text not null default 'White',
  black_name text not null default 'Black',
  result text not null,
  reason text default '',
  move_count integer default 0,
  mode text default 'human',
  computer_elo integer,
  pgn text default ''
);

create index if not exists games_played_at_idx on public.games (played_at desc);
create index if not exists games_white_idx on public.games (white_player_id);
create index if not exists games_black_idx on public.games (black_player_id);

-- Same access model as the roster: signed-in club members can read and
-- write; nobody else can see anything.
alter table public.games enable row level security;

drop policy if exists "Signed-in users can read games" on public.games;
create policy "Signed-in users can read games"
  on public.games for select
  to authenticated
  using (true);

drop policy if exists "Signed-in users can add games" on public.games;
create policy "Signed-in users can add games"
  on public.games for insert
  to authenticated
  with check (true);

drop policy if exists "Signed-in users can edit games" on public.games;
create policy "Signed-in users can edit games"
  on public.games for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Signed-in users can remove games" on public.games;
create policy "Signed-in users can remove games"
  on public.games for delete
  to authenticated
  using (true);

-- Live updates, so a game finished on one device shows up on the coach's
-- screen without a refresh.
do $$
begin
  alter publication supabase_realtime add table public.games;
exception
  when duplicate_object then null;
end
$$;
