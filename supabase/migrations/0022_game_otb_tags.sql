-- 0022 — over-the-board game tags: event, round, board, time control.
--
-- NOT YET APPLIED. Written without database access; the lead applies it.
--
-- Additive only: four NULLABLE columns on games, two checks on them, and one
-- index. No existing column, row or policy is touched; games' existing RLS
-- (0005/0008) already covers new columns. Safe to run twice.
--
-- Why columns and not only PGN tags: the scoresheet entry writes these into
-- the PGN as well (Event, Round, Board, TimeControl), but the Oct 24 event
-- report needs "every game from this event, by round and board", and parsing
-- 150 PGNs in the browser to answer that is the wrong shape. The PGN stays the
-- full record; these are the structured copy a query can use.
--
-- The app writes these only when they are set, and if the columns are missing
-- (this file not yet applied) it retries the save without them — the tags are
-- still inside the PGN — so nothing breaks before this is applied.

alter table public.games add column if not exists event        text;
alter table public.games add column if not exists round        text;
alter table public.games add column if not exists board        integer;
alter table public.games add column if not exists time_control text;

comment on column public.games.event is
  'OTB event name, e.g. "DISD District Championship". Null for online and casual games.';
comment on column public.games.round is
  'Round label as the pairing sheet prints it ("3", "2.1"). Text, not a number, on purpose.';
comment on column public.games.board is
  'Board number in that round.';
comment on column public.games.time_control is
  'US Chess notation, e.g. "G/30;d5". The PGN TimeControl tag holds the same control in seconds.';

-- Named, and added only when absent, so a second run does not fail.
do $$
begin
  alter table public.games
    add constraint games_board_positive check (board is null or board between 1 and 500);
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.games
    add constraint games_otb_text_lengths check (
      (event is null or char_length(event) <= 100)
      and (round is null or char_length(round) <= 12)
      and (time_control is null or char_length(time_control) <= 40)
    );
exception
  when duplicate_object then null;
end
$$;

-- "Every game from this event" is the question the event report asks.
create index if not exists games_event_round_idx
  on public.games (event, round)
  where event is not null;
