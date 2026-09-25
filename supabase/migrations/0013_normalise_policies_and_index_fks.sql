-- 0013_normalise_policies_and_index_fks.sql
-- Applied to production as migration 20260917193932. Everything below this header is the
-- EXACT SQL applied, recovered 2026-09-25 from supabase_migrations.schema_migrations
-- (md5 b28eb84a718f8a9342c134f58561252c). Already applied: do NOT re-run against production.

-- 0013 — tidy the policies on the newer tables, and index the foreign keys.
--
-- Three things the advisors caught, all of them mine:
--
-- 1. The write policies were declared FOR ALL, which also covers SELECT - so
--    every read evaluated two permissive policies instead of one. Splitting
--    them into INSERT/UPDATE/DELETE leaves exactly one SELECT policy per table.
-- 2. The policies had no role, defaulting to PUBLIC, while the older tables
--    name `authenticated`. Same effect given the USING clauses, but nobody
--    should have to re-derive that. Normalised to `authenticated`.
-- 3. Foreign keys without a covering index.

-- ---- player_puzzles ----
drop policy if exists player_puzzles_select on public.player_puzzles;
drop policy if exists player_puzzles_write  on public.player_puzzles;
create policy player_puzzles_select on public.player_puzzles
  for select to authenticated using (public.is_coach() or public.owns_player(player_id));
create policy player_puzzles_insert on public.player_puzzles
  for insert to authenticated with check (public.is_coach() or public.owns_player(player_id));
create policy player_puzzles_update on public.player_puzzles
  for update to authenticated using (public.is_coach() or public.owns_player(player_id))
  with check (public.is_coach() or public.owns_player(player_id));
create policy player_puzzles_delete on public.player_puzzles
  for delete to authenticated using (public.is_coach() or public.owns_player(player_id));

-- ---- player_platform_ratings ----
-- DELIBERATE CHOICE on visibility (advisor item 5.5):
-- readable by any approved member, NOT owner-only like skill scores.
-- The club leaderboard shows every member's rating, and a player has to be
-- able to read the board they appear on. A platform rating is also already
-- public on Chess.com and Lichess - unlike a coach note or a skill score,
-- which are judgements about a child and stay owner-or-coach.
-- Writes remain owner-or-coach.
drop policy if exists platform_ratings_select on public.player_platform_ratings;
drop policy if exists platform_ratings_write  on public.player_platform_ratings;
create policy platform_ratings_select on public.player_platform_ratings
  for select to authenticated using (public.is_approved());
create policy platform_ratings_insert on public.player_platform_ratings
  for insert to authenticated with check (public.is_coach() or public.owns_player(player_id));
create policy platform_ratings_update on public.player_platform_ratings
  for update to authenticated using (public.is_coach() or public.owns_player(player_id))
  with check (public.is_coach() or public.owns_player(player_id));
create policy platform_ratings_delete on public.player_platform_ratings
  for delete to authenticated using (public.is_coach() or public.owns_player(player_id));

-- ---- player_rating_overrides ----
drop policy if exists rating_overrides_select on public.player_rating_overrides;
drop policy if exists rating_overrides_write  on public.player_rating_overrides;
create policy rating_overrides_select on public.player_rating_overrides
  for select to authenticated using (public.is_approved());
create policy rating_overrides_insert on public.player_rating_overrides
  for insert to authenticated with check (public.is_coach());
create policy rating_overrides_update on public.player_rating_overrides
  for update to authenticated using (public.is_coach()) with check (public.is_coach());
create policy rating_overrides_delete on public.player_rating_overrides
  for delete to authenticated using (public.is_coach());

-- ---- player_skill_scores ----
drop policy if exists skill_scores_select on public.player_skill_scores;
drop policy if exists skill_scores_write  on public.player_skill_scores;
create policy skill_scores_select on public.player_skill_scores
  for select to authenticated using (public.is_coach() or public.owns_player(player_id));
create policy skill_scores_insert on public.player_skill_scores
  for insert to authenticated with check (public.is_coach() or public.owns_player(player_id));
create policy skill_scores_update on public.player_skill_scores
  for update to authenticated using (public.is_coach() or public.owns_player(player_id))
  with check (public.is_coach() or public.owns_player(player_id));
create policy skill_scores_delete on public.player_skill_scores
  for delete to authenticated using (public.is_coach() or public.owns_player(player_id));

-- ---- covering indexes for foreign keys ----
create index if not exists player_puzzles_game_idx          on public.player_puzzles (game_id);
create index if not exists player_skill_history_game_idx    on public.player_skill_history (game_id);
create index if not exists player_rating_overrides_set_idx  on public.player_rating_overrides (set_by);
create index if not exists assessments_author_idx           on public.assessments (author_id);
create index if not exists attendance_recorded_by_idx       on public.attendance (recorded_by);
create index if not exists coach_notes_author_idx           on public.coach_notes (author_id);
create index if not exists consent_records_recorded_by_idx  on public.consent_records (recorded_by);
create index if not exists invite_codes_created_by_idx      on public.invite_codes (created_by);
create index if not exists profiles_approved_by_idx         on public.profiles (approved_by);
