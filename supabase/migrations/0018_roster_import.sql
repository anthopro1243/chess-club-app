-- 0018 — bulk roster import: private intake fields, experience, and retiring CC-003.
--
-- NUMBERING: 0012–0017 are deliberately left free. Six migrations are applied
-- to production with no file in this repo (HANDOFF.md §5); backfilling them is
-- Phase A item 1 and those numbers are reserved for it. This migration is
-- later than all of them in real time, so taking 0018 keeps replay order
-- honest instead of wedging a new feature into a reserved gap.
--
-- Additive. Creates one table, adds one nullable column, and updates exactly
-- one existing row. Drops nothing, truncates nothing. Safe to run twice.
--
-- Depends on 0005's helpers (is_coach, is_approved, owns_player) and on
-- players.player_id being TEXT, which is what production actually has.

-- ---------------------------------------------------------------------------
-- 1. Intake fields that must not be club-readable.
--
-- The signup form collects a DISD student ID and a school email. Every
-- approved member can select from `players`, so putting either there would
-- publish one student's district identifier to the whole club. They live in
-- their own table instead, reachable only by a coach — the same reasoning,
-- and the same shape, as coach_notes in 0005.
--
-- The student ID is also the importer's first dedupe key, so it is UNIQUE:
-- two roster rows claiming one student is precisely the state the import is
-- built to prevent, and the database should refuse it even if the planner
-- is ever bypassed.
-- ---------------------------------------------------------------------------
create table if not exists public.player_private (
  player_id     text primary key references public.players(player_id) on delete cascade,
  student_id    text unique,
  school_email  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists player_private_school_email_idx
  on public.player_private (lower(school_email));

comment on table public.player_private is
  'Intake identifiers (DISD student ID, school email). Coaches only - never club-readable.';

alter table public.player_private enable row level security;

-- Coaches only, for every operation. Deliberately no "members read their own
-- row" policy: a member already knows their own student ID, so a read policy
-- would add exposure surface and buy nothing.
drop policy if exists player_private_coach_all on public.player_private;
create policy player_private_coach_all on public.player_private
  for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

-- ---------------------------------------------------------------------------
-- 2. Self-reported experience, from the signup form.
--
-- Kept separate from the rubric on purpose. The rubric is the coach's
-- judgement and the engine's measurement; this is what the member said about
-- themselves before anyone had seen them play, and it is useful for a first
-- session grouping precisely because it is not either of those.
-- ---------------------------------------------------------------------------
alter table public.players add column if not exists experience text;

comment on column public.players.experience is
  'Self-reported at signup. Not a measurement - never feed this into scoring.';

-- ---------------------------------------------------------------------------
-- 3. Retire CC-003 "Magnus Carlsen" — confirmed test data by the coach.
--
-- A soft delete, per 0008: the row stays, so its 100 games, 20 analyses,
-- 1 puzzle and 7 skill scores keep their foreign keys and nothing in the
-- archive breaks. The name is included in the WHERE clause so that if this
-- ever replays against a database where CC-003 is a real member, it does
-- nothing at all.
--
-- To undo:  update public.players set deleted_at = null where player_id = 'CC-003';
-- ---------------------------------------------------------------------------
update public.players
   set deleted_at = now()
 where player_id = 'CC-003'
   and name = 'Magnus Carlsen'
   and deleted_at is null;
