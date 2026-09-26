-- 0019 — club tournaments: events, entrants, pairings and the override log.
--
-- NOT YET APPLIED. Written on a feature branch with no database access; the
-- lead applies it. Additive only: four new tables, their policies, indexes,
-- triggers and realtime membership. No ALTER on an existing table, no DROP of
-- anything that exists today, no data change. Safe to run twice.
--
-- Depends on 0005's helpers (is_coach, is_approved), on 0011's
-- touch_updated_at(), and on players.player_id and games.id being TEXT,
-- which is what production actually has (HANDOFF.md §5).
--
-- WHO MAY DO WHAT
-- Every approved member may READ an event: pairings and standings go on the
-- wall anyway, and a member needs to see their own board. Only a coach may
-- WRITE: pairing, swaps, byes and results are the director's calls, and a
-- player able to edit a result row could rewrite their own game. Same split
-- as player_rating_overrides in 0010/0013, one policy per operation (0013).
--
-- IDS are TEXT and client-generated (like games.id), because the app is
-- local-first: an event created offline keeps its ids when it syncs.
--
-- PLAYER REFERENCES use ON DELETE SET NULL, never CASCADE. Members are
-- soft-deleted (0008) so this should not fire; if a player row is ever
-- hard-deleted, the event keeps its history (the entrant row carries a name
-- snapshot) instead of silently losing rounds.

-- ---------------------------------------------------------------------------
-- 1. Events.
-- ---------------------------------------------------------------------------
create table if not exists public.tournaments (
  id              text primary key,
  name            text not null check (length(btrim(name)) between 1 and 120),
  starts_on       date,
  format          text not null default 'swiss' check (format in ('swiss', 'round-robin')),
  -- The event's time-control profile as players see it, e.g. 'G/30 d5' (F084).
  time_control    text not null default 'G/30 d5' check (length(time_control) between 1 and 40),
  rounds          integer not null check (rounds between 1 and 15),
  -- One source per event (F083): ratings from different pools are never mixed.
  rating_source   text not null default 'club'
                    check (rating_source in ('club', 'uscf', 'chesscomRapid', 'lichessRapid')),
  -- Announced in advance (US Chess 34A), so stored with the event.
  tiebreak_order  text[] not null
                    default array['modifiedMedian', 'solkoff', 'cumulative', 'oppCumulative', 'sonnebornBerger'],
  initial_colour  text not null default 'w' check (initial_colour in ('w', 'b')),
  -- The last round that has been paired. Kept explicitly rather than derived
  -- from pairings, because a round made only of requested byes has no games.
  paired_rounds   integer not null default 0 check (paired_rounds between 0 and 15),
  status          text not null default 'draft' check (status in ('draft', 'running', 'finished')),
  notes           text,
  created_by      uuid default auth.uid() references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.tournaments is
  'Club events (mock Swiss, round robin). Approved members read; coaches write.';

create index if not exists tournaments_created_by_idx on public.tournaments (created_by);
create index if not exists tournaments_starts_on_idx  on public.tournaments (starts_on desc);

-- ---------------------------------------------------------------------------
-- 2. Entrants. The rating is a snapshot taken at entry, as US Chess seeds on
-- the rating at the start of the event, not whatever it is by round 3.
-- ---------------------------------------------------------------------------
create table if not exists public.tournament_entrants (
  id                    text primary key,
  tournament_id         text not null references public.tournaments(id) on delete cascade,
  player_id             text references public.players(player_id) on delete set null,
  name                  text not null,
  rating                integer check (rating between 0 and 4000),
  rating_source         text not null,
  -- Not paired from this round on. Results before it stand.
  withdrawn_from_round  integer check (withdrawn_from_round between 1 and 15),
  -- First round this entrant is paired in; earlier rounds are unplayed.
  late_entry_round      integer check (late_entry_round between 1 and 15),
  created_at            timestamptz not null default now(),
  unique (tournament_id, player_id)
);

comment on table public.tournament_entrants is
  'Who is in an event, with the seeding rating snapshot and withdrawal / late-entry rounds.';

-- The unique constraint above leads with tournament_id, so it already covers
-- that foreign key; player_id needs its own.
create index if not exists tournament_entrants_player_idx on public.tournament_entrants (player_id);

-- ---------------------------------------------------------------------------
-- 3. Pairings: one row per board, plus one row per bye.
--
-- A bye row has no board, no black player and no result; the player sits in
-- white_player_id (a storage convenience: a bye is never a game with White).
-- bye_type: 'full' (pairing bye, 1 point), 'half' (requested, ½), 'zero'
-- (missing a round without withdrawing, or a round-robin sit-out).
-- Forfeits are results ('1F-0F', '0F-1F', '0F-0F'), not byes: somebody was
-- paired and did not play.
-- ---------------------------------------------------------------------------
create table if not exists public.tournament_pairings (
  id               text primary key,
  tournament_id    text not null references public.tournaments(id) on delete cascade,
  round            integer not null check (round between 1 and 15),
  board            integer check (board >= 1),
  white_player_id  text references public.players(player_id) on delete set null,
  black_player_id  text references public.players(player_id) on delete set null,
  result           text check (result in ('1-0', '0-1', '1/2-1/2', '1F-0F', '0F-1F', '0F-0F')),
  bye_type         text check (bye_type in ('full', 'half', 'zero')),
  -- The archived game for this board, once someone links it (Games page).
  game_id          text references public.games(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint tournament_pairings_shape check (
    (bye_type is null and board is not null)
    or (bye_type is not null and board is null and black_player_id is null and result is null)
  ),
  unique (tournament_id, round, board)
);

comment on table public.tournament_pairings is
  'Boards and byes per round. A bye row keeps its player in white_player_id and has no board.';

-- (tournament_id, round, board) is unique and leads with tournament_id.
create index if not exists tournament_pairings_white_idx on public.tournament_pairings (white_player_id);
create index if not exists tournament_pairings_black_idx on public.tournament_pairings (black_player_id);
create index if not exists tournament_pairings_game_idx  on public.tournament_pairings (game_id);

-- ---------------------------------------------------------------------------
-- 4. The override log (F077): every manual change to what the engine did —
-- who made it, what it was, and why. Append-only in practice: nothing in the
-- app edits a log row, and there is deliberately no update path in the UI.
-- ---------------------------------------------------------------------------
create table if not exists public.tournament_overrides (
  id             text primary key,
  tournament_id  text not null references public.tournaments(id) on delete cascade,
  round          integer check (round between 1 and 15),
  action         text not null check (action in (
                   'swap', 'bye', 'cancel-bye', 'withdraw', 'reinstate', 'late-entry',
                   'result-change', 'unpair', 'entrants', 'settings')),
  detail         jsonb not null default '{}'::jsonb,
  reason         text,
  made_by        uuid default auth.uid() references auth.users(id) on delete set null,
  -- Snapshot of the display name: the log must still say who, after an
  -- account is renamed or removed.
  made_by_name   text,
  created_at     timestamptz not null default now()
);

comment on table public.tournament_overrides is
  'Who changed a pairing or result by hand, what they changed, and why.';

create index if not exists tournament_overrides_event_idx   on public.tournament_overrides (tournament_id, created_at);
create index if not exists tournament_overrides_made_by_idx on public.tournament_overrides (made_by);

-- ---------------------------------------------------------------------------
-- 5. updated_at, via 0011's hardened touch_updated_at().
-- ---------------------------------------------------------------------------
drop trigger if exists tournaments_touch_updated_at on public.tournaments;
create trigger tournaments_touch_updated_at
  before update on public.tournaments
  for each row execute function public.touch_updated_at();

drop trigger if exists tournament_pairings_touch_updated_at on public.tournament_pairings;
create trigger tournament_pairings_touch_updated_at
  before update on public.tournament_pairings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 6. Row level security. Read: approved members. Write: coaches.
-- ---------------------------------------------------------------------------
alter table public.tournaments          enable row level security;
alter table public.tournament_entrants  enable row level security;
alter table public.tournament_pairings  enable row level security;
alter table public.tournament_overrides enable row level security;

-- ---- tournaments ----
drop policy if exists tournaments_select on public.tournaments;
drop policy if exists tournaments_insert on public.tournaments;
drop policy if exists tournaments_update on public.tournaments;
drop policy if exists tournaments_delete on public.tournaments;
create policy tournaments_select on public.tournaments
  for select to authenticated using (public.is_approved());
create policy tournaments_insert on public.tournaments
  for insert to authenticated with check (public.is_coach());
create policy tournaments_update on public.tournaments
  for update to authenticated using (public.is_coach()) with check (public.is_coach());
create policy tournaments_delete on public.tournaments
  for delete to authenticated using (public.is_coach());

-- ---- tournament_entrants ----
drop policy if exists tournament_entrants_select on public.tournament_entrants;
drop policy if exists tournament_entrants_insert on public.tournament_entrants;
drop policy if exists tournament_entrants_update on public.tournament_entrants;
drop policy if exists tournament_entrants_delete on public.tournament_entrants;
create policy tournament_entrants_select on public.tournament_entrants
  for select to authenticated using (public.is_approved());
create policy tournament_entrants_insert on public.tournament_entrants
  for insert to authenticated with check (public.is_coach());
create policy tournament_entrants_update on public.tournament_entrants
  for update to authenticated using (public.is_coach()) with check (public.is_coach());
create policy tournament_entrants_delete on public.tournament_entrants
  for delete to authenticated using (public.is_coach());

-- ---- tournament_pairings ----
drop policy if exists tournament_pairings_select on public.tournament_pairings;
drop policy if exists tournament_pairings_insert on public.tournament_pairings;
drop policy if exists tournament_pairings_update on public.tournament_pairings;
drop policy if exists tournament_pairings_delete on public.tournament_pairings;
create policy tournament_pairings_select on public.tournament_pairings
  for select to authenticated using (public.is_approved());
create policy tournament_pairings_insert on public.tournament_pairings
  for insert to authenticated with check (public.is_coach());
create policy tournament_pairings_update on public.tournament_pairings
  for update to authenticated using (public.is_coach()) with check (public.is_coach());
create policy tournament_pairings_delete on public.tournament_pairings
  for delete to authenticated using (public.is_coach());

-- ---- tournament_overrides ----
drop policy if exists tournament_overrides_select on public.tournament_overrides;
drop policy if exists tournament_overrides_insert on public.tournament_overrides;
drop policy if exists tournament_overrides_update on public.tournament_overrides;
drop policy if exists tournament_overrides_delete on public.tournament_overrides;
create policy tournament_overrides_select on public.tournament_overrides
  for select to authenticated using (public.is_approved());
create policy tournament_overrides_insert on public.tournament_overrides
  for insert to authenticated with check (public.is_coach());
create policy tournament_overrides_update on public.tournament_overrides
  for update to authenticated using (public.is_coach()) with check (public.is_coach());
create policy tournament_overrides_delete on public.tournament_overrides
  for delete to authenticated using (public.is_coach());

-- ---------------------------------------------------------------------------
-- 7. Realtime, so a member's phone shows the next round the moment the coach
-- pairs it. Same guarded form as 0006/0007.
-- ---------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.tournaments;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.tournament_entrants;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.tournament_pairings;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.tournament_overrides;
exception when duplicate_object then null;
end $$;
