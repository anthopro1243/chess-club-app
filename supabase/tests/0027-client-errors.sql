-- Scenario test for 0027 on a scratch Postgres (uses the 0026 stub).
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c0', 'coach@example.test'),
  ('00000000-0000-0000-0000-000000000001', 'm1@example.test');
insert into public.profiles (user_id, role, status) values
  ('00000000-0000-0000-0000-0000000000c0', 'coach', 'approved'),
  ('00000000-0000-0000-0000-000000000001', 'player', 'approved');

\i supabase/migrations/0027_client_errors.sql
\i supabase/migrations/0027_client_errors.sql

set role authenticated;
set test.uid = '00000000-0000-0000-0000-000000000001';
insert into public.client_errors (place, message, page) values ('page crash', 'boom', '#/play');
do $$ begin
  assert (select count(*) from public.client_errors) = 0, 'a member cannot read errors';
  insert into public.client_errors (user_id, place, message)
    values ('00000000-0000-0000-0000-0000000000c0', 'x', 'pretending to be the coach');
  raise exception 'a member wrote a row as someone else';
exception when insufficient_privilege then null; end $$;

set test.uid = '00000000-0000-0000-0000-0000000000c0';
do $$ begin
  assert (select count(*) from public.client_errors) = 1, 'the coach reads errors';
  assert (select user_id from public.client_errors) = '00000000-0000-0000-0000-000000000001', 'stamped with the member';
  perform public.prune_client_errors();
  assert (select count(*) from public.client_errors) = 1, 'recent rows kept';
end $$;
delete from public.client_errors;
reset role;
do $$ begin
  assert (select count(*) from public.client_errors) = 0, 'the coach cleared them';
end $$;

select 'ALL 0027 CHECKS PASSED' as result;
