-- Removes everything this session created for testing. Safe to run whenever
-- you no longer want the disposable accounts and fixture rows around.
--
-- NOTE: this deletes the two accounts Gate 5 needs, so run `npm run test:rls`
-- before this, not after. Nothing here touches your own account or your games.

begin;

-- Fixture rows created so the RLS denials had something real to be denied.
delete from public.coach_notes      where note  like 'RLS FIXTURE%';
delete from public.assessments      where notes like 'RLS FIXTURE%';
delete from public.goals            where goal  like 'RLS FIXTURE%';
delete from public.consent_records  where data_collected like 'RLS FIXTURE%';
delete from public.puzzle_attempts  where puzzle_id in ('rls-fixture-other', 'rls-test-fixture');

-- The disposable test game and everything derived from it.
delete from public.game_analyses        where game_id = 'rls-test-game-01';
delete from public.player_skill_history where game_id = 'rls-test-game-01';
delete from public.games                where id      = 'rls-test-game-01';

-- The disposable test player and its derived rows.
delete from public.player_puzzles          where player_id = 'CC-RLS-01';
delete from public.player_skill_scores     where player_id = 'CC-RLS-01';
delete from public.player_skill_history    where player_id = 'CC-RLS-01';
delete from public.player_platform_ratings where player_id = 'CC-RLS-01';
delete from public.player_rating_overrides where player_id = 'CC-RLS-01';
delete from public.game_analyses           where player_id = 'CC-RLS-01';
delete from public.players                 where player_id = 'CC-RLS-01';

-- The two disposable accounts. Profiles cascade from auth.users.
delete from auth.users where email in ('rls.coach@chessclubapp.org', 'rls.player@chessclubapp.org');

commit;
