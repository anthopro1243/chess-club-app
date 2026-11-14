-- 0027 — errors from members' browsers, for the coach.
--
-- NOT APPLIED. Written 2026-11-13 (EVALUATION.md §4.7). Apply after 0026.
-- Safe to run twice. Until it is applied the app's error reports are simply
-- dropped (src/services/errorLog.js is best effort).
--
-- A failed save or a crashed page used to show only in the one browser where
-- it happened. Each one is now a row here: any signed-in member can add rows
-- (only as themselves), only a coach can read or clear them. Rows are short
-- (500-character message) and the client sends at most 20 per visit.
-- Old rows are removed after 90 days by prune_client_errors(), which the
-- Coach page calls when it loads the list.

create table if not exists public.client_errors (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  user_id     uuid default auth.uid() references auth.users(id) on delete set null,
  place       text not null check (char_length(place) <= 100),
  message     text not null check (char_length(message) <= 500),
  page        text check (char_length(page) <= 60),
  user_agent  text check (char_length(user_agent) <= 200)
);

create index if not exists client_errors_created_at_idx on public.client_errors (created_at desc);

alter table public.client_errors enable row level security;

drop policy if exists client_errors_insert_own on public.client_errors;
create policy client_errors_insert_own on public.client_errors
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists client_errors_coach_read on public.client_errors;
create policy client_errors_coach_read on public.client_errors
  for select to authenticated
  using (public.is_coach());

drop policy if exists client_errors_coach_delete on public.client_errors;
create policy client_errors_coach_delete on public.client_errors
  for delete to authenticated
  using (public.is_coach());

create or replace function public.prune_client_errors()
returns void language sql security definer set search_path = public as $$
  delete from public.client_errors where created_at < now() - interval '90 days';
$$;

revoke all on function public.prune_client_errors() from public, anon;
grant execute on function public.prune_client_errors() to authenticated;
