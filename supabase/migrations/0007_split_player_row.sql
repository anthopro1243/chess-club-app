-- 0007 — assessments, attendance, ratings and goals become their own tables.
--
-- Forward-only. Requires 0005. Copies data out of the JSON columns on
-- `players` and leaves those columns in place, untouched, as a safety net.
-- Nothing is dropped here. A later migration can remove the old columns once
-- you have looked at the new tables and are satisfied they are complete.
--
-- Why bother: a history stored as a JSON blob cannot answer "show me
-- everyone whose endgame score dropped this month", and every write sends
-- the whole player row, so two people editing one player at once means
-- whoever saves last silently wins. Separate rows fix both.
--
-- Every backfill below is idempotent, guarded by a unique key and
-- `on conflict do nothing`, so running this twice changes nothing.

-- ---------------------------------------------------------------------------
-- 1. Assessments — the eight rubric categories as real columns, matching the
--    tab layout in the club workbook.
-- ---------------------------------------------------------------------------

create table if not exists public.assessments (
  id               bigserial primary key,
  player_id        text not null references public.players(player_id) on delete cascade,
  assessed_at      timestamptz not null default now(),
  opening          integer check (opening between 0 and 10),
  tactics          integer check (tactics between 0 and 10),
  positional       integer check (positional between 0 and 10),
  endgame          integer check (endgame between 0 and 10),
  time_management  integer check (time_management between 0 and 10),
  board_vision     integer check (board_vision between 0 and 10),
  resilience       integer check (resilience between 0 and 10),
  notation         integer check (notation between 0 and 10),
  notes            text not null default '',
  author_id        uuid references auth.users(id) on delete set null
);

create unique index if not exists assessments_player_time_key
  on public.assessments (player_id, assessed_at);

insert into public.assessments (
  player_id, assessed_at, opening, tactics, positional, endgame,
  time_management, board_vision, resilience, notation, notes)
select
  p.player_id,
  coalesce((a ->> 'at')::timestamptz, now()),
  (a -> 'rubric' ->> 'opening')::integer,
  (a -> 'rubric' ->> 'tactics')::integer,
  (a -> 'rubric' ->> 'positional')::integer,
  (a -> 'rubric' ->> 'endgame')::integer,
  (a -> 'rubric' ->> 'timeManagement')::integer,
  (a -> 'rubric' ->> 'boardVision')::integer,
  (a -> 'rubric' ->> 'resilience')::integer,
  (a -> 'rubric' ->> 'notation')::integer,
  coalesce(a ->> 'notes', '')
from public.players p,
     lateral jsonb_array_elements(coalesce(p.assessments, '[]'::jsonb)) a
where jsonb_typeof(coalesce(p.assessments, '[]'::jsonb)) = 'array'
on conflict (player_id, assessed_at) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Attendance — one row per player per session date.
-- ---------------------------------------------------------------------------

create table if not exists public.attendance (
  id            bigserial primary key,
  player_id     text not null references public.players(player_id) on delete cascade,
  session_date  date not null,
  present       boolean not null,
  recorded_at   timestamptz not null default now(),
  recorded_by   uuid references auth.users(id) on delete set null,
  unique (player_id, session_date)
);

insert into public.attendance (player_id, session_date, present)
select p.player_id, (a ->> 'date')::date, coalesce((a ->> 'present')::boolean, false)
from public.players p,
     lateral jsonb_array_elements(coalesce(p.attendance, '[]'::jsonb)) a
where jsonb_typeof(coalesce(p.attendance, '[]'::jsonb)) = 'array'
  and (a ->> 'date') is not null
on conflict (player_id, session_date) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Ratings — every rating a player has, each dated, each labelled by where
--    it came from. Replaces the flat `ratings` JSON blob.
-- ---------------------------------------------------------------------------

create table if not exists public.ratings (
  id           bigserial primary key,
  player_id    text not null references public.players(player_id) on delete cascade,
  rating_type  text not null,   -- uscf | fide | internal | chesscom_rapid | lichess_blitz | ...
  value        numeric,
  rd           numeric,
  recorded_at  timestamptz not null default now(),
  source       text
);

create index if not exists ratings_player_type_time_idx
  on public.ratings (player_id, rating_type, recorded_at desc);

create unique index if not exists ratings_player_type_time_key
  on public.ratings (player_id, rating_type, recorded_at);

-- The club's own Glicko-2 number, which already exists and already moves.
insert into public.ratings (player_id, rating_type, value, rd, recorded_at, source)
select p.player_id, 'internal',
       (p.club_rating ->> 'rating')::numeric,
       (p.club_rating ->> 'rd')::numeric,
       coalesce(p.updated_at, now()),
       'backfill from players.club_rating'
from public.players p
where p.club_rating ? 'rating'
on conflict do nothing;

-- The externally-issued ratings that were sitting in the JSON blob. The key
-- names there are camelCase; they become snake_case rating types here.
insert into public.ratings (player_id, rating_type, value, recorded_at, source)
select p.player_id,
       lower(regexp_replace(kv.key, '([a-z0-9])([A-Z])', '\1_\2', 'g')),
       nullif(kv.value #>> '{}', '')::numeric,
       coalesce(p.updated_at, now()),
       'backfill from players.ratings'
from public.players p,
     lateral jsonb_each(coalesce(p.ratings, '{}'::jsonb)) kv
where jsonb_typeof(kv.value) = 'number'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 4. Goals — a goal with a date is reviewable; a sentence in a text box is not.
-- ---------------------------------------------------------------------------

create table if not exists public.goals (
  id             bigserial primary key,
  player_id      text not null references public.players(player_id) on delete cascade,
  goal           text not null default '',
  target_rating  integer,
  target_date    date,
  status         text not null default 'active'
                   check (status in ('active', 'met', 'missed', 'abandoned')),
  set_at         timestamptz not null default now(),
  met_at         timestamptz,
  notes          text not null default ''
);

create index if not exists goals_player_idx on public.goals (player_id, status);

create unique index if not exists goals_player_text_key
  on public.goals (player_id, goal, set_at);

insert into public.goals (player_id, goal, set_at)
select p.player_id, p.goal, coalesce(p.updated_at, now())
from public.players p
where p.goal is not null and btrim(p.goal) <> ''
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 5. Policies. A member reads their own records; coaches read and write all.
--    Assessments and goals are coach-authored, so members get read-only.
-- ---------------------------------------------------------------------------

alter table public.assessments enable row level security;
alter table public.attendance  enable row level security;
alter table public.ratings     enable row level security;
alter table public.goals       enable row level security;

drop policy if exists "Members read own assessments" on public.assessments;
create policy "Members read own assessments"
  on public.assessments for select to authenticated
  using (public.is_coach() or public.owns_player(player_id));

drop policy if exists "Coaches write assessments" on public.assessments;
create policy "Coaches write assessments"
  on public.assessments for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

drop policy if exists "Members read own attendance" on public.attendance;
create policy "Members read own attendance"
  on public.attendance for select to authenticated
  using (public.is_coach() or public.owns_player(player_id));

drop policy if exists "Coaches write attendance" on public.attendance;
create policy "Coaches write attendance"
  on public.attendance for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

-- Ratings are the leaderboard, so every approved member can read all of them.
drop policy if exists "Approved members read ratings" on public.ratings;
create policy "Approved members read ratings"
  on public.ratings for select to authenticated
  using (public.is_approved());

drop policy if exists "Own or coach writes ratings" on public.ratings;
create policy "Own or coach writes ratings"
  on public.ratings for insert to authenticated
  with check (public.is_coach() or public.owns_player(player_id));

drop policy if exists "Coaches correct ratings" on public.ratings;
create policy "Coaches correct ratings"
  on public.ratings for update to authenticated
  using (public.is_coach()) with check (public.is_coach());

drop policy if exists "Coaches delete ratings" on public.ratings;
create policy "Coaches delete ratings"
  on public.ratings for delete to authenticated
  using (public.is_coach());

drop policy if exists "Members read own goals" on public.goals;
create policy "Members read own goals"
  on public.goals for select to authenticated
  using (public.is_coach() or public.owns_player(player_id));

drop policy if exists "Coaches write goals" on public.goals;
create policy "Coaches write goals"
  on public.goals for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

do $$
begin
  alter publication supabase_realtime add table public.assessments;
  alter publication supabase_realtime add table public.attendance;
  alter publication supabase_realtime add table public.ratings;
  alter publication supabase_realtime add table public.goals;
exception
  when duplicate_object then null;
end
$$;

-- ---------------------------------------------------------------------------
-- Check the backfill before trusting it:
--
--   select 'assessments' t, count(*) from public.assessments
--   union all select 'attendance', count(*) from public.attendance
--   union all select 'ratings',    count(*) from public.ratings
--   union all select 'goals',      count(*) from public.goals;
--
-- Compare against what the JSON columns held:
--
--   select player_id,
--          jsonb_array_length(coalesce(assessments,'[]'::jsonb)) as assessments,
--          jsonb_array_length(coalesce(attendance, '[]'::jsonb)) as attendance
--     from public.players order by player_id;
-- ---------------------------------------------------------------------------
