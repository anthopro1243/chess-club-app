-- 0024 — mark a game as reviewed (research F091, the review queue).
--
-- Additive only: two NULLABLE columns on games. No existing column, row or
-- policy is touched; games' existing RLS (0005: players edit their own games,
-- coaches edit any) already covers them. Safe to run twice.
--
-- A game leaves the player's review queue once reviewed_at is set. Clearing it
-- (back to null) puts the game back in the queue.

alter table public.games add column if not exists reviewed_at timestamptz;
alter table public.games add column if not exists reviewed_by uuid references auth.users(id) on delete set null;

comment on column public.games.reviewed_at is
  'When the game was gone over (player alone or with the coach). Null = still in the review queue.';
comment on column public.games.reviewed_by is
  'Who marked it reviewed.';
