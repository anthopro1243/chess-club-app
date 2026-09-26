-- 0021 — tournament preparation: official events and their deadlines.
--
-- NOT YET APPLIED. Written without database access; the lead applies it.
--
-- Strictly additive: new tables only, no ALTER on an existing table, no DROP
-- of anything that already exists, no DELETE. Safe to run twice (every
-- create is `if not exists`, every policy is dropped-then-created by its own
-- new name, the seed row is `on conflict do nothing`).
--
-- Depends on 0005's helpers (is_coach, is_approved, owns_player) and on
-- players.player_id being TEXT, which is what production actually has.
-- Policy shape follows 0013: one SELECT policy per table, separate
-- INSERT/UPDATE/DELETE policies, all `to authenticated`.

-- ---------------------------------------------------------------------------
-- 1. Official events (F070).
--
-- A district tournament the club is preparing for. The two deadlines are
-- NULLABLE on purpose: null means "use the Dallas ISD rule" (registration
-- closes the Friday before the event week; transport forms are due three
-- weeks before), which the app computes from event_date. A coach who types a
-- date overrides the rule for that event only, and the app labels which is
-- which. Storing the computed default instead would freeze it: moving the
-- event would silently leave the deadlines behind.
--
-- id is text, like games.id, so the app can create rows offline and the seed
-- below has a stable, readable key.
-- ---------------------------------------------------------------------------
create table if not exists public.official_events (
  id                   text primary key,
  name                 text not null check (char_length(name) between 1 and 120),
  event_date           date not null,
  venue                text check (char_length(venue) <= 160),
  registration_closes  date,
  transport_due        date,
  coach1_name          text check (char_length(coach1_name) <= 80),
  coach2_name          text check (char_length(coach2_name) <= 80),
  notes                text check (char_length(notes) <= 2000),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (registration_closes is null or registration_closes < event_date),
  check (transport_due is null or transport_due < event_date)
);

create index if not exists official_events_date_idx on public.official_events (event_date);

comment on table public.official_events is
  'District tournaments and their deadlines. Null deadline = the Dallas ISD default rule.';

alter table public.official_events enable row level security;

-- Every approved member may see the calendar: it is the club's own schedule,
-- and members need the date and venue to answer the availability poll.
drop policy if exists official_events_select on public.official_events;
create policy official_events_select on public.official_events
  for select to authenticated using (public.is_approved());

-- Only a coach changes dates.
drop policy if exists official_events_insert on public.official_events;
create policy official_events_insert on public.official_events
  for insert to authenticated with check (public.is_coach());
drop policy if exists official_events_update on public.official_events;
create policy official_events_update on public.official_events
  for update to authenticated using (public.is_coach()) with check (public.is_coach());
drop policy if exists official_events_delete on public.official_events;
create policy official_events_delete on public.official_events
  for delete to authenticated using (public.is_coach());

-- The event the club is preparing for now (research/FEATURE-RESEARCH.md §3).
-- Deadlines left null: the rule gives Fri Oct 16 and Fri Oct 2.
insert into public.official_events (id, name, event_date, venue, notes)
values (
  'disd-hs-fall-2026',
  'Dallas ISD high school fall tournament',
  date '2026-10-24',
  'W.T. White High School',
  'Format, time control and notation rule still to confirm with the district contact.'
)
on conflict (id) do nothing;

do $$
begin
  alter publication supabase_realtime add table public.official_events;
exception
  when duplicate_object then null;
end
$$;
