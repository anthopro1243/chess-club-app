-- 0020 — homework: the coach sets puzzles on a theme, a fixed puzzle set, or
-- "play N games at X+ minutes", for the club, a group or chosen players,
-- with a due date.
--
-- NOT YET APPLIED. Written without database access; the lead applies it.
--
-- Additive only: two new tables, their indexes, their policies, and their
-- addition to the realtime publication. No ALTER on an existing table, no
-- change to any existing policy, nothing dropped but this file's own
-- policies (so it is safe to run twice).
--
-- Depends on 0005's helpers (is_coach, is_approved, owns_player) and on
-- players.player_id being TEXT, which is what production actually has.
--
-- There is deliberately NO completion table. Whether a player has done their
-- homework is computed (src/data/homework.js, progressFor) from rows that
-- already exist: puzzle_attempts, which the Training page writes for every
-- attempt, and games, which fills itself from play, sync, PGN import and
-- scoresheet entry. A stored "done" flag would be a second copy of those
-- facts, and would disagree with them the first time an attempt synced late
-- or a coach deleted a bad row. Coaches already read every attempt and game;
-- a player reads their own attempts (0006) and the club's games (0005), so
-- both sides compute the same answer.

-- ---------------------------------------------------------------------------
-- 1. The assignment.
--
--   kind = 'theme' : solve `required_count` distinct library puzzles on
--                    `theme`, optionally within one `difficulty` band.
--   kind = 'set'   : solve every puzzle in `puzzle_ids`.
--   kind = 'games' : play `required_count` finished games whose estimated
--                    length is at least `min_minutes` per player (0 = any).
--
-- The shape check keeps a row from being half of one kind and half another.
--
-- The id is text and minted by the client ("HW-…"), the same as games.id:
-- the app must work with no backend at all, so the id has to exist before
-- the database does.
--
-- due_at is an instant, not a date. "Due Tuesday" means the end of Tuesday
-- in the club's time zone; the coach's browser converts it once, here, so no
-- reader has to guess a zone later.
-- ---------------------------------------------------------------------------
create table if not exists public.homework_assignments (
  id              text primary key,
  kind            text not null check (kind in ('theme', 'set', 'games')),
  theme           text,
  difficulty      text check (difficulty in ('beginner', 'easy', 'intermediate', 'hard', 'expert')),
  required_count  integer check (required_count between 1 and 50),
  puzzle_ids      text[] not null default '{}',
  min_minutes     integer check (min_minutes between 0 and 240),
  audience        text not null default 'players' check (audience in ('club', 'group', 'players')),
  group_key       text check (char_length(group_key) <= 60),
  group_label     text check (char_length(group_label) <= 60),
  note            text check (char_length(note) <= 200),
  due_at          timestamptz not null,
  created_at      timestamptz not null default now(),
  created_by      uuid default auth.uid() references auth.users(id) on delete set null,

  constraint homework_assignments_shape check (
    (kind = 'theme'
       and theme is not null
       and required_count is not null
       and min_minutes is null
       and cardinality(puzzle_ids) = 0)
    or
    (kind = 'set'
       and theme is null
       and difficulty is null
       and required_count is null
       and min_minutes is null
       and cardinality(puzzle_ids) between 1 and 50)
    or
    (kind = 'games'
       and theme is null
       and difficulty is null
       and required_count between 1 and 20
       and min_minutes is not null
       and cardinality(puzzle_ids) = 0)
  ),
  -- A group assignment names its group (for display); nothing else does.
  constraint homework_assignments_group check ((audience = 'group') = (group_key is not null)),
  constraint homework_assignments_due_after_created check (due_at > created_at)
);

comment on table public.homework_assignments is
  'Homework set by a coach. Completion is computed from puzzle_attempts and games, never stored.';
comment on column public.homework_assignments.audience is
  'club = every approved member may read it (no target rows); group / players = only the members named in homework_targets.';
comment on column public.homework_assignments.group_key is
  'The roster group it was set for (e.g. commitment:Competitive, grades:9-10). A snapshot: members are expanded into homework_targets when it is set.';

-- ---------------------------------------------------------------------------
-- 2. Who it is for, when it is not the whole club.
--
-- One row per targeted player, for group and chosen-player homework. The
-- group is expanded when the homework is set, so someone who changes grade
-- keeps the homework they were given.
--
-- Club-wide homework has NO target rows: every approved member reads it
-- through is_approved() below, which also lets a member who joins before it
-- is due see it. Homework aimed at particular players is readable only by
-- those players (owns_player on their target row) and coaches — "extra pawn
-- endgames for X" is a judgement about a child, the same class of data as a
-- coach note or a skill score, which stay owner-or-coach.
-- ---------------------------------------------------------------------------
create table if not exists public.homework_targets (
  assignment_id  text not null references public.homework_assignments(id) on delete cascade,
  player_id      text not null references public.players(player_id) on delete cascade,
  primary key (assignment_id, player_id)
);

comment on table public.homework_targets is
  'One row per player a group or chosen-player assignment is for. Club-wide homework has none.';

-- Covering indexes for the foreign keys. The primary key already leads with
-- assignment_id, so only player_id and created_by need their own.
create index if not exists homework_targets_player_idx
  on public.homework_targets (player_id);

create index if not exists homework_assignments_created_by_idx
  on public.homework_assignments (created_by);

create index if not exists homework_assignments_due_idx
  on public.homework_assignments (due_at desc);

-- ---------------------------------------------------------------------------
-- 3. Policies, in the per-command shape 0013 normalised everything to: one
-- SELECT policy per table, role `authenticated`, coach gets everything, and
-- only a coach writes.
-- ---------------------------------------------------------------------------
alter table public.homework_targets enable row level security;
alter table public.homework_assignments enable row level security;

-- ---- homework_targets ----
drop policy if exists homework_targets_select on public.homework_targets;
create policy homework_targets_select on public.homework_targets
  for select to authenticated using (public.is_coach() or public.owns_player(player_id));

drop policy if exists homework_targets_insert on public.homework_targets;
create policy homework_targets_insert on public.homework_targets
  for insert to authenticated with check (public.is_coach());

drop policy if exists homework_targets_update on public.homework_targets;
create policy homework_targets_update on public.homework_targets
  for update to authenticated using (public.is_coach()) with check (public.is_coach());

drop policy if exists homework_targets_delete on public.homework_targets;
create policy homework_targets_delete on public.homework_targets
  for delete to authenticated using (public.is_coach());

-- ---- homework_assignments ----
-- Three ways to read one: a coach reads everything; any approved member reads
-- club-wide homework; a member reads group/chosen homework only through a
-- target row that names them. The sub-select runs under homework_targets'
-- own SELECT policy and never refers back to homework_assignments, so there
-- is no policy recursion.
drop policy if exists homework_assignments_select on public.homework_assignments;
create policy homework_assignments_select on public.homework_assignments
  for select to authenticated using (
    public.is_coach()
    or (audience = 'club' and public.is_approved())
    or exists (
      select 1
        from public.homework_targets t
       where t.assignment_id = homework_assignments.id
         and public.owns_player(t.player_id)
    )
  );

-- Only a coach sets, edits or removes homework. A player finishing it writes
-- to puzzle_attempts or games, which they can already do; nothing here needs
-- a player write.
drop policy if exists homework_assignments_insert on public.homework_assignments;
create policy homework_assignments_insert on public.homework_assignments
  for insert to authenticated with check (public.is_coach());

drop policy if exists homework_assignments_update on public.homework_assignments;
create policy homework_assignments_update on public.homework_assignments
  for update to authenticated using (public.is_coach()) with check (public.is_coach());

drop policy if exists homework_assignments_delete on public.homework_assignments;
create policy homework_assignments_delete on public.homework_assignments
  for delete to authenticated using (public.is_coach());

-- ---------------------------------------------------------------------------
-- 4. Realtime, so a trainee's list updates when the coach sets homework, the
-- same as puzzle_attempts in 0006. Realtime applies the SELECT policies above.
-- ---------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.homework_assignments;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter publication supabase_realtime add table public.homework_targets;
exception
  when duplicate_object then null;
end
$$;
