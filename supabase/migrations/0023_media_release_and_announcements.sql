-- 0023 — media-release flag on players, and a coach announcement board.
--
-- Research rows F001/F114 (media release respected by every export and
-- printout) and F110 (a one-way announcement board). See
-- research/FEATURE-RESEARCH.md and GAP-ANALYSIS.md, cycle 2.
--
-- Additive. Adds one nullable column and creates one table. Drops nothing,
-- rewrites nothing. Safe to run twice. Depends on 0005's helpers (is_coach,
-- is_approved).

-- ---------------------------------------------------------------------------
-- 1. Media release.
--
-- Dallas ISD's guidance: don't post students' names or photos without a
-- release on file. NULL means "not recorded" and is treated exactly like
-- "no" by the app (src/data/privacy.js): a missing form is not consent.
-- It lives on `players` rather than `player_private` because the printable
-- views every member can open (pairings, standings) need to know whether to
-- print a name or initials; the flag itself says nothing sensitive.
-- ---------------------------------------------------------------------------
alter table public.players add column if not exists media_release boolean;

comment on column public.players.media_release is
  'true = media release on file; false = opted out; null = not recorded (treated as no). Controls full names on printed or shared results.';

-- ---------------------------------------------------------------------------
-- 2. Announcements: one-way, coach to club.
--
-- No replies, no member posts: student-to-student messaging is on the
-- research's "things to avoid" list (bullying risk the coach can't see).
-- Archived rather than deleted, so an announcement that went out stays on
-- record.
-- ---------------------------------------------------------------------------
create table if not exists public.announcements (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (length(title) between 1 and 140),
  body         text not null default '' check (length(body) <= 4000),
  pinned       boolean not null default false,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  archived_at  timestamptz
);

create index if not exists announcements_live_idx
  on public.announcements (pinned desc, created_at desc)
  where archived_at is null;
create index if not exists announcements_created_by_idx
  on public.announcements (created_by);

alter table public.announcements enable row level security;

drop policy if exists announcements_select on public.announcements;
create policy announcements_select on public.announcements
  for select to authenticated using (public.is_approved());

drop policy if exists announcements_insert on public.announcements;
create policy announcements_insert on public.announcements
  for insert to authenticated with check (public.is_coach());

drop policy if exists announcements_update on public.announcements;
create policy announcements_update on public.announcements
  for update to authenticated using (public.is_coach()) with check (public.is_coach());
