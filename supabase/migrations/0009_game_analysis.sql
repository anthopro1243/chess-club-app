-- ⚠ NOTE ADDED 2026-09-25: THIS FILE DOES NOT MATCH PRODUCTION.
-- It declares game_analyses.game_id / player_id as uuid referencing
-- players(id). In production, players.player_id and games.id are TEXT, and
-- every column referencing them (game_analyses.game_id, .player_id,
-- player_skill_scores.player_id, player_skill_history.player_id/game_id) is
-- text, referencing players(player_id). The migration was applied by hand
-- with those types corrected. The SQL below is left exactly as committed;
-- when rebuilding a fresh project, fix the types before running it
-- (see HANDOFF.md §5).
--
-- supabase/migrations/0xx_game_analysis.sql
-- Renumber to follow your existing migrations. Forward-only. Safe on a database
-- that already has rows: it creates new tables and touches no existing column.
--
-- Three tables:
--   game_analyses        one row per (game, side)  — the engine's verdict on a game
--   player_skill_scores  one row per (player, category) — the tracked 0-100 score now
--   player_skill_history append-only — what the score was over time, for the chart
--
-- Note on plies: the per-move detail is stored as JSONB on game_analyses rather
-- than in its own table. A 40-move game is 80 plies; a season of 20 players is
-- ~50k rows if normalised, for data that is only ever read one game at a time.
-- If you later want cross-game per-move queries ("every fork this club missed"),
-- add a move_analyses table then and backfill from this column.

begin;

-- ─────────────────────────────── game_analyses ───────────────────────────────

create table if not exists public.game_analyses (
  id                uuid primary key default gen_random_uuid(),
  game_id           uuid not null references public.games(id) on delete cascade,
  player_id         uuid references public.players(id) on delete set null,
  side              char(1) not null check (side in ('w','b')),

  -- provenance: you will change depth and engine builds, and old rows must not
  -- silently be compared against new ones
  engine            text not null default 'stockfish-18-lite-single',
  depth             smallint not null,
  multipv           smallint not null default 3,
  schema_version    smallint not null default 1,

  -- headline numbers
  accuracy          numeric(5,2),
  acpl              numeric(7,2),
  mean_win_loss     numeric(5,2),
  moves_played      smallint,
  moves_counted     smallint,

  -- structured detail
  counts            jsonb not null default '{}'::jsonb,   -- {best, excellent, ..., blunder}
  by_phase          jsonb not null default '{}'::jsonb,   -- opening/middlegame/endgame
  raw               jsonb not null default '{}'::jsonb,   -- the metrics rubricScores() consumes
  scores            jsonb not null default '{}'::jsonb,   -- the eight 0-100 scores for THIS game
  critical          jsonb not null default '[]'::jsonb,   -- biggest swings, for the review UI
  motif_counts      jsonb not null default '{}'::jsonb,   -- {fork: 2, hangingPiece: 1}
  plies             jsonb,                                -- full per-move detail

  coach_note        text,                                 -- the human overlay on the engine
  analyzed_at       timestamptz not null default now(),

  unique (game_id, side, schema_version)
);

create index if not exists game_analyses_player_idx on public.game_analyses (player_id, analyzed_at desc);
create index if not exists game_analyses_game_idx   on public.game_analyses (game_id);

-- ──────────────────────────── player_skill_scores ────────────────────────────

create table if not exists public.player_skill_scores (
  player_id    uuid not null references public.players(id) on delete cascade,
  category     text not null check (category in (
                 'openingKnowledge','tacticalVision','positionalUnderstanding',
                 'endgameTechnique','timeManagement','boardVision',
                 'psychologicalResilience','notation')),
  score        smallint check (score between 0 and 100),
  confidence   text not null default 'none' check (confidence in ('none','low','medium','high')),
  observations integer not null default 0,   -- n behind the score, for the shrinkage
  games        integer not null default 0,
  trend        smallint not null default 0,  -- change vs. roughly ten games ago
  source       text not null default 'engine' check (source in ('engine','coach','blend')),
  updated_at   timestamptz not null default now(),
  primary key (player_id, category)
);

-- ─────────────────────────── player_skill_history ────────────────────────────

create table if not exists public.player_skill_history (
  id          bigserial primary key,
  player_id   uuid not null references public.players(id) on delete cascade,
  category    text not null,
  score       smallint not null check (score between 0 and 100),
  confidence  text,
  game_id     uuid references public.games(id) on delete set null,
  recorded_at timestamptz not null default now()
);

create index if not exists skill_history_player_idx
  on public.player_skill_history (player_id, category, recorded_at desc);

-- ─────────────────────────────────── RLS ─────────────────────────────────────
-- Assumes the role model from the gap audit: a profiles table (or a claim) that
-- identifies coaches. Replace is_coach() with whatever you actually built —
-- the shape is what matters: players see their own analysis, coaches see all,
-- nobody sees another player's.

alter table public.game_analyses       enable row level security;
alter table public.player_skill_scores enable row level security;
alter table public.player_skill_history enable row level security;

-- Helper. If you already have one, drop this and use yours.
create or replace function public.is_coach()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role in ('coach','admin')
  );
$$;

create or replace function public.owns_player(p uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.players pl
    where pl.id = p and pl.user_id = auth.uid()
  );
$$;

-- game_analyses
drop policy if exists game_analyses_select on public.game_analyses;
create policy game_analyses_select on public.game_analyses
  for select using (public.is_coach() or public.owns_player(player_id));

drop policy if exists game_analyses_insert on public.game_analyses;
create policy game_analyses_insert on public.game_analyses
  for insert with check (public.is_coach() or public.owns_player(player_id));

drop policy if exists game_analyses_update on public.game_analyses;
create policy game_analyses_update on public.game_analyses
  for update using (public.is_coach())          -- only a coach rewrites a verdict
  with check (public.is_coach());

-- player_skill_scores
drop policy if exists skill_scores_select on public.player_skill_scores;
create policy skill_scores_select on public.player_skill_scores
  for select using (public.is_coach() or public.owns_player(player_id));

drop policy if exists skill_scores_write on public.player_skill_scores;
create policy skill_scores_write on public.player_skill_scores
  for all using (public.is_coach() or public.owns_player(player_id))
  with check (public.is_coach() or public.owns_player(player_id));

-- player_skill_history
drop policy if exists skill_history_select on public.player_skill_history;
create policy skill_history_select on public.player_skill_history
  for select using (public.is_coach() or public.owns_player(player_id));

drop policy if exists skill_history_insert on public.player_skill_history;
create policy skill_history_insert on public.player_skill_history
  for insert with check (public.is_coach() or public.owns_player(player_id));

commit;

-- ───────────────────────────── verification ──────────────────────────────────
-- Run these as a PLAYER account, not as the service role. Both must return zero
-- rows. A permissions test that passes as an admin proves nothing.
--
--   select count(*) from game_analyses       where player_id <> <my player id>;
--   select count(*) from player_skill_scores where player_id <> <my player id>;
--
-- And this must be rejected:
--   update game_analyses set coach_note = 'x' where id = <someone else's row>;
