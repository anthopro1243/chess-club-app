-- Scenario test for 0025 on a scratch Postgres (see README in this folder).
-- Every name and ID here is made up. Stops at the first failed check.
\set ON_ERROR_STOP on
set client_min_messages = warning;

-- People: one coach (c), members m1..m9, one pending account (p).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c0', 'coach@example.test'),
  ('00000000-0000-0000-0000-000000000001', 'm1@example.test'),
  ('00000000-0000-0000-0000-000000000002', 'm2@example.test'),
  ('00000000-0000-0000-0000-000000000003', 'm3@example.test'),
  ('00000000-0000-0000-0000-000000000004', 'm4@example.test'),
  ('00000000-0000-0000-0000-000000000007', 'm7@example.test'),
  ('00000000-0000-0000-0000-000000000008', 'm8@example.test'),
  ('00000000-0000-0000-0000-000000000009', 'm9@example.test'),
  ('00000000-0000-0000-0000-0000000000aa', 'pending@example.test');
insert into public.profiles (user_id, role, status) values
  ('00000000-0000-0000-0000-0000000000c0', 'coach', 'approved'),
  ('00000000-0000-0000-0000-000000000001', 'player', 'approved'),
  ('00000000-0000-0000-0000-000000000002', 'player', 'approved'),
  ('00000000-0000-0000-0000-000000000003', 'player', 'approved'),
  ('00000000-0000-0000-0000-000000000004', 'player', 'approved'),
  ('00000000-0000-0000-0000-000000000007', 'player', 'approved'),
  ('00000000-0000-0000-0000-000000000008', 'player', 'approved'),
  ('00000000-0000-0000-0000-000000000009', 'player', 'approved'),
  ('00000000-0000-0000-0000-0000000000aa', 'player', 'pending');

-- Roster: the coach's row, rows imported from a roster file (with IDs), and
-- rows members made themselves with the old "Join the roster".
insert into public.players (player_id, user_id, name) values
  ('CC-002', '00000000-0000-0000-0000-0000000000c0', 'Coach Example'),
  ('CC-005', null, 'Alpha Imported'),
  ('CC-006', '00000000-0000-0000-0000-000000000003', 'Beta Imported'),
  ('CC-009', '00000000-0000-0000-0000-000000000007', 'self made, empty'),
  ('CC-010', null, 'Gamma Imported'),
  ('CC-011', '00000000-0000-0000-0000-000000000008', 'self made, has games'),
  ('CC-012', null, 'Delta Imported'),
  ('CC-013', '00000000-0000-0000-0000-000000000009', 'm9@example.test');
insert into public.player_private (player_id, student_id) values
  ('CC-005', '1234567'), ('CC-006', '7654321'), ('CC-010', '2222222'), ('CC-012', '3333333');
insert into public.games values ('g1', 'CC-011', 'CC-002');

\i supabase/migrations/0025_link_account_to_student.sql
\i supabase/migrations/0025_link_account_to_student.sql

set role authenticated;

-- m1: ID matches an imported row with no account -> linked to it.
set test.uid = '00000000-0000-0000-0000-000000000001';
do $$ declare r jsonb; begin
  assert (select public.my_account_link() ->> 'answered') = 'false', 'm1 not answered yet';
  r := public.link_my_account(' Alpha ', 'Member', '123-4567');
  assert r ->> 'outcome' = 'matched' and r ->> 'player_id' = 'CC-005', 'm1 matched: ' || r::text;
  r := public.my_account_link();
  assert r ->> 'answered' = 'true' and r ->> 'student_id' = '1234567' and r ->> 'player_id' = 'CC-005', 'm1 status ' || r::text;
  assert (select count(*) from public.player_private) = 0, 'a member must not read player_private';
  assert (select count(*) from public.account_links) = 0, 'a member must not read account_links';
end $$;

-- m2: unknown ID, no row -> a new row with that ID.
set test.uid = '00000000-0000-0000-0000-000000000002';
do $$ declare r jsonb; begin
  r := public.link_my_account('Bravo', 'Member', '1111111');
  assert r ->> 'outcome' = 'created' and r ->> 'player_id' = 'CC-014', 'm2 created: ' || r::text;
  assert (public.my_account_link() ->> 'student_id') = '1111111', 'm2 sees own ID';
end $$;

-- m4: ID already on another member's row -> clash, gets a row without the ID.
set test.uid = '00000000-0000-0000-0000-000000000004';
do $$ declare r jsonb; begin
  r := public.link_my_account('Charlie', 'Member', '7654321');
  assert r ->> 'outcome' = 'clash' and r ->> 'player_id' = 'CC-015', 'm4 clash: ' || r::text;
  r := public.my_account_link();
  assert r ->> 'answered' = 'true' and r ->> 'student_id' is null, 'm4 must not see the other ID ' || r::text;
end $$;

-- m7: empty self-made row + imported row with the ID -> moved, old row retired.
set test.uid = '00000000-0000-0000-0000-000000000007';
do $$ declare r jsonb; begin
  r := public.link_my_account('Echo', 'Member', '2222222');
  assert r ->> 'outcome' = 'matched' and r ->> 'player_id' = 'CC-010', 'm7: ' || r::text;
end $$;

-- m8: self-made row WITH games + imported row -> clash, keeps their row.
set test.uid = '00000000-0000-0000-0000-000000000008';
do $$ declare r jsonb; begin
  r := public.link_my_account('Foxtrot', 'Member', '3333333');
  assert r ->> 'outcome' = 'clash' and r ->> 'player_id' = 'CC-011', 'm8: ' || r::text;
end $$;

-- m9: own row, unknown ID -> row gets the real name and the ID.
set test.uid = '00000000-0000-0000-0000-000000000009';
do $$ declare r jsonb; begin
  r := public.link_my_account('Golf', 'Member', '4444444');
  assert r ->> 'outcome' = 'updated' and r ->> 'player_id' = 'CC-013', 'm9: ' || r::text;
end $$;

-- Refusals: a pending account, a bad ID, a missing name, a member using coach tools.
set test.uid = '00000000-0000-0000-0000-0000000000aa';
do $$ begin
  perform public.link_my_account('Pending', 'Person', '5555555');
  raise exception 'pending account should be refused';
exception when insufficient_privilege then null; end $$;
set test.uid = '00000000-0000-0000-0000-000000000001';
do $$ begin
  perform public.link_my_account('Alpha', 'Member', '12345');
  raise exception 'short ID should be refused';
exception when invalid_parameter_value then null; end $$;
do $$ begin
  perform public.link_my_account('Alpha', '  ', '1234567');
  raise exception 'blank last name should be refused';
exception when invalid_parameter_value then null; end $$;
do $$ begin
  perform public.coach_link_account('00000000-0000-0000-0000-000000000002', 'CC-005');
  raise exception 'member used a coach tool';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform * from public.coach_list_accounts();
  raise exception 'member listed accounts';
exception when insufficient_privilege then null; end $$;

-- Coach checks and fixes.
set test.uid = '00000000-0000-0000-0000-0000000000c0';
do $$ begin
  assert (select count(*) from public.coach_list_accounts()) = 9, 'coach sees every account';
  assert (select email from public.coach_list_accounts() where user_id = '00000000-0000-0000-0000-000000000002') = 'm2@example.test', 'email';
  assert (select display_name from public.profiles where user_id = '00000000-0000-0000-0000-000000000001') = 'Alpha Member', 'display name filled';
  assert (select deleted_at is not null and user_id is null from public.players where player_id = 'CC-009'), 'm7 empty row retired';
  assert (select name from public.players where player_id = 'CC-013') = 'Golf Member', 'm9 name';
  assert (select name from public.players where player_id = 'CC-005') = 'Alpha Imported', 'imported name kept';
  assert (select outcome from public.account_links where user_id = '00000000-0000-0000-0000-000000000004') = 'clash', 'clash recorded';
end $$;

-- m2 "typed the wrong ID": their real row is CC-012 (Delta, 3333333).
do $$ begin
  -- CC-006 already has an account: refused.
  begin
    perform public.coach_link_account('00000000-0000-0000-0000-000000000002', 'CC-006');
    raise exception 'should refuse a row that has an account';
  exception when invalid_parameter_value then null; end;
  perform public.coach_link_account('00000000-0000-0000-0000-000000000002', 'CC-012');
  assert (select user_id from public.players where player_id = 'CC-012') = '00000000-0000-0000-0000-000000000002', 'moved';
  assert (select deleted_at is not null from public.players where player_id = 'CC-014'), 'stray row retired';
  assert (select student_id from public.player_private where player_id = 'CC-014') is null, 'stray ID cleared';
  assert (select resolved_at is not null and player_id = 'CC-012' from public.account_links
           where user_id = '00000000-0000-0000-0000-000000000002'), 'resolved';
  -- Unlink m1: the row is free again and m1 will be asked again.
  perform public.coach_link_account('00000000-0000-0000-0000-000000000001', null);
  assert (select user_id from public.players where player_id = 'CC-005') is null, 'unlinked';
  assert not exists (select 1 from public.account_links where user_id = '00000000-0000-0000-0000-000000000001'), 'asked again';
  assert (select deleted_at from public.players where player_id = 'CC-005') is null, 'imported row kept';
end $$;

set test.uid = '00000000-0000-0000-0000-000000000001';
do $$ declare r jsonb; begin
  assert (public.my_account_link() ->> 'answered') = 'false', 'm1 asked again';
  r := public.link_my_account('Alpha', 'Member', '1234567');
  assert r ->> 'outcome' = 'matched' and r ->> 'player_id' = 'CC-005', 'm1 relinks: ' || r::text;
  -- Answering again while already linked changes nothing.
  r := public.link_my_account('Alpha', 'Member', '1234567');
  assert r ->> 'outcome' = 'matched' and r ->> 'player_id' = 'CC-005', 'm1 again: ' || r::text;
end $$;

reset role;
select 'ALL 0025 CHECKS PASSED' as result;
