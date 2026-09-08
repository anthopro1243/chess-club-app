-- 0008 — parent consent, emergency contacts, and deletes that can be undone.
--
-- Forward-only. Requires 0005. Adds one table and some nullable columns.
-- Drops nothing.
--
-- The club collects names, ages, school year, ratings and coach notes on
-- children. For members under 13, US COPPA requires verifiable parental
-- consent *before* that collection, and a school-affiliated club stacks
-- education-record rules on top. A stored consent record is the whole fix,
-- and it is far cheaper now than after a parent asks what you hold.

-- ---------------------------------------------------------------------------
-- 1. Consent, captured at intake.
-- ---------------------------------------------------------------------------

create table if not exists public.consent_records (
  id                      bigserial primary key,
  player_id               text not null references public.players(player_id) on delete cascade,
  guardian_name           text not null,
  guardian_email          text not null,
  guardian_phone          text,
  relationship            text,
  under_13                boolean not null default false,
  -- What the guardian was actually told we collect, stored verbatim, so a
  -- later change to the intake wording cannot rewrite what they agreed to.
  data_collected          text not null,
  agreed_at               timestamptz not null default now(),
  -- How consent was obtained: 'in_person', 'signed_form', 'email_reply'.
  -- COPPA wants this verifiable, so a bare checkbox is not enough on its own
  -- for an under-13 member.
  method                  text,
  photo_release           boolean not null default false,
  emergency_contact_name  text,
  emergency_contact_phone text,
  withdrawn_at            timestamptz,
  recorded_by             uuid references auth.users(id) on delete set null,
  notes                   text not null default ''
);

create index if not exists consent_player_idx on public.consent_records (player_id);

alter table public.consent_records enable row level security;

-- Guardian contact details and emergency numbers are not club-wide reading.
-- Coaches only, and the member may see their own record exists.
drop policy if exists "Coaches manage consent" on public.consent_records;
create policy "Coaches manage consent"
  on public.consent_records for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

drop policy if exists "Members read their own consent record" on public.consent_records;
create policy "Members read their own consent record"
  on public.consent_records for select to authenticated
  using (public.owns_player(player_id));

-- A guardian email on the player row as well, so a coach can trigger a
-- password reset for a member who has no inbox of their own.
alter table public.players add column if not exists guardian_email text;

-- ---------------------------------------------------------------------------
-- 2. Soft deletes.
--
--    A season of assessments cannot be re-created: you cannot re-score a
--    game a child played in October. One mis-click in March should not be
--    able to erase it, so a delete marks the row inactive instead.
-- ---------------------------------------------------------------------------

alter table public.players add column if not exists deleted_at timestamptz;
alter table public.games   add column if not exists deleted_at timestamptz;

create index if not exists players_active_idx on public.players (deleted_at)
  where deleted_at is null;

-- Removing a player is now an update, not a delete, so the delete policy is
-- narrowed to admins for the rare genuine purge (a data-removal request).
drop policy if exists "Only coaches remove players" on public.players;
create policy "Only admins hard delete players"
  on public.players for delete to authenticated
  using (public.is_admin());

drop policy if exists "Only coaches remove games" on public.games;
create policy "Only admins hard delete games"
  on public.games for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Useful afterwards:
--
--   -- who is missing a consent record
--   select p.player_id, p.name
--     from public.players p
--    where p.deleted_at is null
--      and not exists (select 1 from public.consent_records c
--                       where c.player_id = p.player_id
--                         and c.withdrawn_at is null);
--
--   -- undo a soft delete
--   update public.players set deleted_at = null where player_id = 'CC-004';
-- ---------------------------------------------------------------------------
