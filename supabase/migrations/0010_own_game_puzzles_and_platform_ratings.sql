-- 0010 — own-game puzzles with spaced repetition, and per-platform ratings.
--
-- Strictly additive: three new tables, no ALTER on an existing table, no
-- DELETE, no DROP. Safe to run twice.
--
-- Depends on 0005's helpers (is_coach, is_approved, owns_player) and on
-- players.player_id / games.id being TEXT, which is what production actually
-- has — note that 0009 as committed says uuid and players(id), but the version
-- applied by hand uses text and players(player_id). Production is the truth.

-- ---------------------------------------------------------------------------
-- 1. Own-game puzzles.
--
-- Every critical moment in an analysed game is a position plus the move that
-- should have been played, which is the definition of a puzzle. Re-solving the
-- position you actually dropped a rook in, two days later, is the highest-value
-- drill in the app, and it is nearly free once analysis exists.
-- ---------------------------------------------------------------------------
create table if not exists public.player_puzzles (
  id                bigserial primary key,
  player_id         text not null references public.players(player_id) on delete cascade,
  game_id           text references public.games(id) on delete set null,

  fen               text not null,          -- position to solve, before the mistake
  solution          text not null,          -- the move that should have been played (UCI)
  played            text,                   -- what they actually played (UCI)
  san               text,                   -- the played move in SAN, for display
  fullmove          integer,
  themes            text[] not null default '{}',
  source            text not null default 'own-game'
                      check (source in ('own-game', 'assigned', 'imported')),
  win_percent_lost  numeric(5,2),
  label             text,                   -- blunder / mistake / inaccuracy

  -- Spaced repetition state (SM-2 style, simplified).
  due_at            timestamptz not null default now(),
  interval_days     integer not null default 0,
  ease              numeric(4,2) not null default 2.50,
  reps              integer not null default 0,
  lapses            integer not null default 0,
  last_result       text check (last_result in ('again','hard','good','easy')),
  last_reviewed_at  timestamptz,
  retired           boolean not null default false,

  created_at        timestamptz not null default now(),

  -- One puzzle per position per player. Re-analysing a game must not multiply
  -- the same blunder into a dozen identical drills.
  unique (player_id, fen)
);

create index if not exists player_puzzles_due_idx
  on public.player_puzzles (player_id, retired, due_at);

comment on table public.player_puzzles is
  'Positions a player actually got wrong in their own games, scheduled for review.';

alter table public.player_puzzles enable row level security;

drop policy if exists player_puzzles_select on public.player_puzzles;
create policy player_puzzles_select on public.player_puzzles
  for select using (public.is_coach() or public.owns_player(player_id));

drop policy if exists player_puzzles_write on public.player_puzzles;
create policy player_puzzles_write on public.player_puzzles
  for all using (public.is_coach() or public.owns_player(player_id))
  with check (public.is_coach() or public.owns_player(player_id));

-- ---------------------------------------------------------------------------
-- 2. Per-platform, per-time-control ratings.
--
-- Lichess and Chess.com use different scales, and each splits ratings by time
-- control. There is no official conversion between them, or to FIDE/USCF. So
-- these are stored as separate rows and NEVER averaged into one number: the
-- primary key is deliberately (player, platform, time control).
-- ---------------------------------------------------------------------------
create table if not exists public.player_platform_ratings (
  player_id     text not null references public.players(player_id) on delete cascade,
  platform      text not null check (platform in ('chesscom','lichess','uscf','fide')),
  time_control  text not null,              -- bullet | blitz | rapid | daily | classical | puzzle | overall
  rating        integer,
  rd            integer,                    -- deviation, where the platform reports one
  games         integer,
  provisional   boolean not null default false,
  fetched_at    timestamptz not null default now(),
  primary key (player_id, platform, time_control)
);

comment on table public.player_platform_ratings is
  'Raw ratings as reported by each platform. Never merged - no official conversion exists.';

alter table public.player_platform_ratings enable row level security;

drop policy if exists platform_ratings_select on public.player_platform_ratings;
create policy platform_ratings_select on public.player_platform_ratings
  for select using (public.is_approved());

drop policy if exists platform_ratings_write on public.player_platform_ratings;
create policy platform_ratings_write on public.player_platform_ratings
  for all using (public.is_coach() or public.owns_player(player_id))
  with check (public.is_coach() or public.owns_player(player_id));

-- ---------------------------------------------------------------------------
-- 3. The coach's override.
--
-- Same shape as coach_note and the manual rubric: the engine (or an imported
-- platform rating) proposes, the coach disposes, and the two are stored
-- separately so you can always see where they disagree.
-- ---------------------------------------------------------------------------
create table if not exists public.player_rating_overrides (
  player_id     text primary key references public.players(player_id) on delete cascade,
  club_rating   integer check (club_rating between 0 and 4000),
  note          text,
  set_by        uuid references auth.users(id),
  set_at        timestamptz not null default now()
);

comment on table public.player_rating_overrides is
  'A coach-entered rating that wins over any derived or imported number.';

alter table public.player_rating_overrides enable row level security;

drop policy if exists rating_overrides_select on public.player_rating_overrides;
create policy rating_overrides_select on public.player_rating_overrides
  for select using (public.is_approved());

-- Only a coach overrides a rating; a player must not be able to set their own.
drop policy if exists rating_overrides_write on public.player_rating_overrides;
create policy rating_overrides_write on public.player_rating_overrides
  for all using (public.is_coach()) with check (public.is_coach());
