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

-- ---------------------------------------------------------------------------
-- 2. Availability poll (F071).
--
-- One answer per member per event. A member may insert and update ONLY their
-- own row (owns_player); a coach may do anything, which is how answers for a
-- whole room get recorded on the coach's phone at a Tuesday meeting. Reads
-- are owner-or-coach: whether a classmate can come is not club-wide news,
-- and a transport note ("needs the bus") can say something about a family.
-- Only a coach deletes (undoing a mis-tap); a member just changes the answer.
-- ---------------------------------------------------------------------------
create table if not exists public.event_availability (
  event_id        text not null references public.official_events(id) on delete cascade,
  player_id       text not null references public.players(player_id) on delete cascade,
  answer          text not null check (answer in ('yes', 'maybe', 'no')),
  transport_note  text check (char_length(transport_note) <= 200),
  answered_at     timestamptz not null default now(),
  primary key (event_id, player_id)
);

-- The primary key covers event_id; this covers the player foreign key.
create index if not exists event_availability_player_idx on public.event_availability (player_id);

comment on table public.event_availability is
  'Yes / maybe / no per member per event, plus an optional transport note.';

alter table public.event_availability enable row level security;

drop policy if exists event_availability_select on public.event_availability;
create policy event_availability_select on public.event_availability
  for select to authenticated using (public.is_coach() or public.owns_player(player_id));
drop policy if exists event_availability_insert on public.event_availability;
create policy event_availability_insert on public.event_availability
  for insert to authenticated with check (public.is_coach() or public.owns_player(player_id));
drop policy if exists event_availability_update on public.event_availability;
create policy event_availability_update on public.event_availability
  for update to authenticated using (public.is_coach() or public.owns_player(player_id))
  with check (public.is_coach() or public.owns_player(player_id));
drop policy if exists event_availability_delete on public.event_availability;
create policy event_availability_delete on public.event_availability
  for delete to authenticated using (public.is_coach());

do $$
begin
  alter publication supabase_realtime add table public.event_availability;
exception
  when duplicate_object then null;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Registrations (F072, F073) and the coach's repertoire tick (F074).
--
-- Who the coach has put on the district form, under which of the campus's
-- (at most two) coaches. The 10-per-coach limit is enforced by the app
-- before every add (src/data/registrationRules.js), not by a trigger: the
-- district could change the number, and a trigger would then refuse a list
-- the district accepts.
--
-- Coach-only writes. A member may read their own row, so they can see their
-- own readiness (which includes the coach's "mini-repertoire reviewed" tick).
-- ---------------------------------------------------------------------------
create table if not exists public.event_registrations (
  event_id             text not null references public.official_events(id) on delete cascade,
  player_id            text not null references public.players(player_id) on delete cascade,
  coach_slot           smallint not null check (coach_slot in (1, 2)),
  repertoire_reviewed  boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  primary key (event_id, player_id)
);

create index if not exists event_registrations_player_idx on public.event_registrations (player_id);

comment on table public.event_registrations is
  'Players the coach registered for an event, by coach slot (1 or 2). App enforces 10 per coach.';

alter table public.event_registrations enable row level security;

drop policy if exists event_registrations_select on public.event_registrations;
create policy event_registrations_select on public.event_registrations
  for select to authenticated using (public.is_coach() or public.owns_player(player_id));
drop policy if exists event_registrations_insert on public.event_registrations;
create policy event_registrations_insert on public.event_registrations
  for insert to authenticated with check (public.is_coach());
drop policy if exists event_registrations_update on public.event_registrations;
create policy event_registrations_update on public.event_registrations
  for update to authenticated using (public.is_coach()) with check (public.is_coach());
drop policy if exists event_registrations_delete on public.event_registrations;
create policy event_registrations_delete on public.event_registrations
  for delete to authenticated using (public.is_coach());

do $$
begin
  alter publication supabase_realtime add table public.event_registrations;
exception
  when duplicate_object then null;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Quiz and drill results (F041, F033) — the "quiz rows".
--
-- One row per player per drill: the best attempt, the latest attempt, how
-- many attempts, and when the player first passed (sticky, so a bad retake
-- the week of the event does not un-ready them). The readiness checklist
-- (F074) reads these.
--
-- A member may insert and update ONLY their own rows (owns_player); a coach
-- may do anything, e.g. save a result for a member who took the quiz on the
-- coach's laptop. Reads are owner-or-coach, like skill scores: a quiz score
-- is a judgement about one student and stays between them and the coach.
-- The drill list is closed on purpose; a new drill is a new migration.
-- ---------------------------------------------------------------------------
create table if not exists public.prep_results (
  player_id     text not null references public.players(player_id) on delete cascade,
  drill         text not null check (drill in (
                  'rules-quiz',
                  'notation-game-type',
                  'notation-game-play',
                  'notation-skills-type',
                  'notation-skills-play'
                )),
  best_score    integer check (best_score >= 0),
  best_total    integer check (best_total > 0),
  best_seconds  integer check (best_seconds >= 0),
  best_at       timestamptz,
  last_score    integer check (last_score >= 0),
  last_total    integer check (last_total > 0),
  last_seconds  integer check (last_seconds >= 0),
  last_at       timestamptz,
  attempts      integer not null default 0 check (attempts >= 0),
  passed_at     timestamptz,
  updated_at    timestamptz not null default now(),
  primary key (player_id, drill),
  check (best_score is null or best_score <= best_total),
  check (last_score is null or last_score <= last_total)
);

comment on table public.prep_results is
  'Best and latest result per player per tournament-prep drill (rules quiz, notation trainer).';

alter table public.prep_results enable row level security;

drop policy if exists prep_results_select on public.prep_results;
create policy prep_results_select on public.prep_results
  for select to authenticated using (public.is_coach() or public.owns_player(player_id));
drop policy if exists prep_results_insert on public.prep_results;
create policy prep_results_insert on public.prep_results
  for insert to authenticated with check (public.is_coach() or public.owns_player(player_id));
drop policy if exists prep_results_update on public.prep_results;
create policy prep_results_update on public.prep_results
  for update to authenticated using (public.is_coach() or public.owns_player(player_id))
  with check (public.is_coach() or public.owns_player(player_id));
drop policy if exists prep_results_delete on public.prep_results;
create policy prep_results_delete on public.prep_results
  for delete to authenticated using (public.is_coach());

do $$
begin
  alter publication supabase_realtime add table public.prep_results;
exception
  when duplicate_object then null;
end
$$;
