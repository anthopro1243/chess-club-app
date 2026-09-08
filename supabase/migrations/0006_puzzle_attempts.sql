-- 0006 — every puzzle attempt gets a row.
--
-- Forward-only, additive. Requires 0005 for the role helper functions.
--
-- Until now the Training page counted a solve and forgot everything else:
-- which puzzles were failed, how long they took, whether a hint was needed.
-- That is the only data in the club that generates itself — members produce
-- it just by practising — and it is what every later personalisation feature
-- reads from. One row per attempt, including the failures. Especially the
-- failures.

create table if not exists public.puzzle_attempts (
  id             bigserial primary key,
  player_id      text not null references public.players(player_id) on delete cascade,
  puzzle_id      text not null,
  themes         text[] not null default '{}',
  difficulty     text,                       -- beginner / easy / intermediate / hard / expert
  puzzle_rating  integer,
  correct        boolean not null,
  used_hint      boolean not null default false,
  used_solution  boolean not null default false,
  seconds_taken  integer,
  attempted_at   timestamptz not null default now()
);

comment on table public.puzzle_attempts is
  'One row per attempt at a puzzle, successful or not. Append-only in practice.';

-- The three questions this table exists to answer, in index form:
-- "how is this player doing lately", "how is this player doing on forks",
-- "has anyone ever attempted this puzzle".
create index if not exists puzzle_attempts_player_time_idx
  on public.puzzle_attempts (player_id, attempted_at desc);

create index if not exists puzzle_attempts_themes_idx
  on public.puzzle_attempts using gin (themes);

create index if not exists puzzle_attempts_puzzle_idx
  on public.puzzle_attempts (player_id, puzzle_id);

alter table public.puzzle_attempts enable row level security;

-- A member sees their own practice history and nobody else's. Coaches see
-- everything, which is the entire point of collecting it.
drop policy if exists "Members read their own attempts" on public.puzzle_attempts;
create policy "Members read their own attempts"
  on public.puzzle_attempts for select to authenticated
  using (public.is_coach() or public.owns_player(player_id));

-- Members generate their own attempts by practising. A coach can log one on
-- a member's behalf, for practice done on paper in a club meeting.
drop policy if exists "Members log their own attempts" on public.puzzle_attempts;
create policy "Members log their own attempts"
  on public.puzzle_attempts for insert to authenticated
  with check (public.is_coach() or public.owns_player(player_id));

-- Deliberately no update policy. An attempt is a historical fact; correcting
-- one by editing it would quietly rewrite the training record. Coaches can
-- delete a bad row instead.
drop policy if exists "Only coaches delete attempts" on public.puzzle_attempts;
create policy "Only coaches delete attempts"
  on public.puzzle_attempts for delete to authenticated
  using (public.is_coach());

do $$
begin
  alter publication supabase_realtime add table public.puzzle_attempts;
exception
  when duplicate_object then null;
end
$$;
