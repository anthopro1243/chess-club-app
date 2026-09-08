-- Chess Club app — shared roster table.
--
-- Run this once, in the Supabase dashboard's SQL editor, for a new project.
-- After it's run, set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see
-- .env.example) and the app switches from browser-local storage to this
-- table automatically, synced live across every signed-in device.

create table if not exists public.players (
  player_id text primary key,
  user_id uuid unique references auth.users(id) on delete set null,
  name text not null,
  grade text default '',
  joined date,
  board_role text default '',
  commitment text default 'Casual',
  ratings jsonb default '{}'::jsonb,
  preferred_openings text[] default '{}',
  style text default '',
  rubric jsonb default '{}'::jsonb,
  goal text default '',
  training_focus text default '',
  coach_notes text default '',
  puzzle_stats jsonb default '{"solvedIds":[],"attempts":0,"lastPlayed":null}'::jsonb,
  club_rating jsonb default '{"rating":1500,"rd":350,"volatility":0.06,"count":0}'::jsonb,
  rating_history jsonb default '[]'::jsonb,
  assessments jsonb default '[]'::jsonb,
  attendance jsonb default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- The club's game archive. A game belongs to two players at once, so it
-- gets its own table rather than hanging off either player's row.
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

-- Keep updated_at current on every write.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists players_touch_updated_at on public.players;
create trigger players_touch_updated_at
  before update on public.players
  for each row execute function public.touch_updated_at();

-- Any signed-in club member can read and write the shared roster — there's
-- no per-user ownership model here, it's one roster for the whole coaching
-- staff, same as when it lived in one browser's local storage. Signing in
-- (email magic link, see src/data/auth.js) is what gates access at all.
alter table public.players enable row level security;

create policy "Signed-in users can read the roster"
  on public.players for select
  to authenticated
  using (true);

create policy "Signed-in users can add players"
  on public.players for insert
  to authenticated
  with check (true);

create policy "Signed-in users can edit players"
  on public.players for update
  to authenticated
  using (true)
  with check (true);

create policy "Signed-in users can remove players"
  on public.players for delete
  to authenticated
  using (true);

-- Same access model for the game archive.
alter table public.games enable row level security;

create policy "Signed-in users can read games"
  on public.games for select
  to authenticated
  using (true);

create policy "Signed-in users can add games"
  on public.games for insert
  to authenticated
  with check (true);

create policy "Signed-in users can edit games"
  on public.games for update
  to authenticated
  using (true)
  with check (true);

create policy "Signed-in users can remove games"
  on public.games for delete
  to authenticated
  using (true);

-- Every open tab sees changes as they happen.
alter publication supabase_realtime add table public.players;
alter publication supabase_realtime add table public.games;
