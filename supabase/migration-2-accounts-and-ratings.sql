-- Migration 2 — self-signup accounts + club Glicko-2 ratings.
--
-- Run this once in an existing project that already has schema.sql applied
-- (a fresh project can just run the updated schema.sql instead — it already
-- includes these columns). Safe to run more than once.

alter table public.players
  add column if not exists user_id uuid unique references auth.users(id) on delete set null;

alter table public.players
  add column if not exists club_rating jsonb default '{"rating":1500,"rd":350,"volatility":0.06,"count":0}'::jsonb;

-- Backfill existing rows that predate this column.
update public.players
  set club_rating = '{"rating":1500,"rd":350,"volatility":0.06,"count":0}'::jsonb
  where club_rating is null;
