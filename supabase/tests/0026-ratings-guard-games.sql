-- Scenario test for 0026 on a scratch Postgres (see README in this folder).
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c0', 'coach@example.test'),
  ('00000000-0000-0000-0000-000000000001', 'm1@example.test'),
  ('00000000-0000-0000-0000-000000000002', 'm2@example.test'),
  ('00000000-0000-0000-0000-000000000003', 'm3@example.test');
insert into public.profiles (user_id, role, status) values
  ('00000000-0000-0000-0000-0000000000c0', 'coach', 'approved'),
  ('00000000-0000-0000-0000-000000000001', 'player', 'approved'),
  ('00000000-0000-0000-0000-000000000002', 'player', 'approved'),
  ('00000000-0000-0000-0000-000000000003', 'player', 'approved');
insert into public.players (player_id, user_id, name, rubric, coach_notes, ratings) values
  ('CC-001', '00000000-0000-0000-0000-0000000000c0', 'Coach', '{}', '', '{}'),
  ('CC-002', '00000000-0000-0000-0000-000000000001', 'Alpha', '{"tactics":5}', 'note', '{"uscf":900,"chesscomRapid":800}'),
  ('CC-003', '00000000-0000-0000-0000-000000000002', 'Bravo', '{"tactics":5}', '', '{"uscf":1000}'),
  ('CC-004', '00000000-0000-0000-0000-000000000003', 'Charlie', '{}', '', '{}');
insert into public.games values ('g1', 'CC-002', 'CC-003', 'Alpha', 'Bravo', '[White "Alpha"]
[Black "Bravo"]');
insert into public.puzzle_attempts (player_id) values ('CC-002');

\i supabase/migrations/0026_ratings_rpc_column_guard_game_inserts.sql
\i supabase/migrations/0026_ratings_rpc_column_guard_game_inserts.sql

set role authenticated;

-- m1 (Alpha) plays m2 (Bravo) on one tablet: both rows rated in one call.
set test.uid = '00000000-0000-0000-0000-000000000001';
do $$ begin
  perform public.record_club_game_ratings(
    'CC-002', '{"rating":1650,"rd":200,"count":1}', '{"rating":1650,"change":150}',
    'CC-003', '{"rating":1350,"rd":200,"count":1}', '{"rating":1350,"change":-150}');
end $$;
reset role;
do $$ begin
  assert (select (club_rating ->> 'rating')::int from public.players where player_id = 'CC-003') = 1350, 'opponent rated';
  assert (select jsonb_array_length(rating_history) from public.players where player_id = 'CC-003') = 1, 'history appended';
end $$;
set role authenticated;

-- m3 (Charlie) can't rate a game between two other members.
set test.uid = '00000000-0000-0000-0000-000000000003';
do $$ begin
  perform public.record_club_game_ratings('CC-002', '{}', null, 'CC-003', '{}', null);
  raise exception 'a bystander rated a game';
exception when insufficient_privilege then null; end $$;

-- m1 edits their own row: goal and platform ratings save, coach fields don't.
set test.uid = '00000000-0000-0000-0000-000000000001';
update public.players
   set goal = 'Reach 1200',
       rubric = '{"tactics":10}',
       coach_notes = 'hacked',
       deleted_at = now(),
       ratings = '{"uscf":2400,"chesscomRapid":850}'
 where player_id = 'CC-002';
reset role;
do $$ begin
  assert (select goal from public.players where player_id = 'CC-002') = 'Reach 1200', 'goal saved';
  assert (select rubric ->> 'tactics' from public.players where player_id = 'CC-002') = '5', 'rubric kept';
  assert (select coach_notes from public.players where player_id = 'CC-002') = 'note', 'notes kept';
  assert (select deleted_at from public.players where player_id = 'CC-002') is null, 'not retired';
  assert (select ratings ->> 'uscf' from public.players where player_id = 'CC-002') = '900', 'uscf kept';
  assert (select ratings ->> 'chesscomRapid' from public.players where player_id = 'CC-002') = '850', 'platform rating saved';
end $$;
set role authenticated;

-- The coach can set the coach fields.
set test.uid = '00000000-0000-0000-0000-0000000000c0';
update public.players set rubric = '{"tactics":7}', ratings = '{"uscf":950}' where player_id = 'CC-002';
reset role;
do $$ begin
  assert (select rubric ->> 'tactics' from public.players where player_id = 'CC-002') = '7', 'coach rubric';
  assert (select ratings ->> 'uscf' from public.players where player_id = 'CC-002') = '950', 'coach uscf';
end $$;
set role authenticated;

-- Logging games: own game yes, guest game yes, two classmates no.
set test.uid = '00000000-0000-0000-0000-000000000003';
insert into public.games (id, white_player_id, black_player_id) values ('g2', 'CC-004', null);
insert into public.games (id) values ('g3');
do $$ begin
  insert into public.games (id, white_player_id, black_player_id) values ('g4', 'CC-002', 'CC-003');
  raise exception 'a bystander logged a game between two classmates';
exception when insufficient_privilege then null; end $$;
set test.uid = '00000000-0000-0000-0000-0000000000c0';
insert into public.games (id, white_player_id, black_player_id) values ('g5', 'CC-002', 'CC-003');

-- Erase: members can't, the coach can.
set test.uid = '00000000-0000-0000-0000-000000000001';
do $$ begin
  perform public.erase_student('CC-003');
  raise exception 'a member erased a student';
exception when insufficient_privilege then null; end $$;
set test.uid = '00000000-0000-0000-0000-0000000000c0';
do $$ declare r jsonb; begin
  r := public.erase_student('CC-002');
  assert r ->> 'account_deleted' = 'true', 'account deleted ' || r::text;
end $$;
reset role;
do $$ begin
  assert not exists (select 1 from public.players where player_id = 'CC-002'), 'row gone';
  assert not exists (select 1 from public.puzzle_attempts where player_id = 'CC-002'), 'attempts cascaded';
  assert not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-000000000001'), 'auth user gone';
  assert (select white_name from public.games where id = 'g1') = 'Former member', 'name scrubbed';
  assert (select pgn from public.games where id = 'g1') not like '%Alpha%', 'pgn scrubbed';
  assert (select black_player_id from public.games where id = 'g1') = 'CC-003', 'opponent keeps the game';
end $$;

select 'ALL 0026 CHECKS PASSED' as result;
