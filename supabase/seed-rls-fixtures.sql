-- Recreates the RLS test fixtures. Run this on a BRANCH or a scratch project,
-- run `npm run test:rls`, then run cleanup-test-fixtures.sql.
--
-- These rows exist only so the permission assertions have something real to be
-- denied. Gate 5 passing against empty tables proves nothing: "a player cannot
-- read another player's assessments" is trivially true when no assessments
-- exist. They must NOT live in production.
--
-- Credentials: rls.coach@chessclubapp.org / rls.player@chessclubapp.org
-- Password for both: RlsTest!2026-aQ7x
--
-- Supabase's signup endpoint rejects test domains, so the accounts are created
-- directly. The token columns must be '' rather than NULL or GoTrue's schema
-- scan returns a 500 on sign-in.

do $$
declare
  pw text := 'RlsTest!2026-aQ7x';
  emails text[] := array['rls.coach@chessclubapp.org','rls.player@chessclubapp.org'];
  e text; uid uuid;
begin
  foreach e in array emails loop
    select id into uid from auth.users where email = e;
    if uid is null then
      uid := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
        confirmation_token, recovery_token, email_change,
        email_change_token_new, email_change_token_current,
        phone_change, phone_change_token, reauthentication_token
      ) values (
        '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
        e, extensions.crypt(pw, extensions.gen_salt('bf')),
        now(), now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false, false,
        '', '', '', '', '', '', '', ''
      );
      insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (uid::text, uid, jsonb_build_object('sub', uid::text, 'email', e, 'email_verified', true),
              'email', now(), now(), now());
    end if;
  end loop;
end $$;

insert into public.profiles (user_id, role, status, approved_at, display_name)
select u.id,
       case when u.email like 'rls.coach%' then 'coach' else 'player' end,
       'approved', now(),
       case when u.email like 'rls.coach%' then 'RLS Test Coach' else 'RLS Test Player' end
from auth.users u
where u.email in ('rls.coach@chessclubapp.org','rls.player@chessclubapp.org')
on conflict (user_id) do update set role = excluded.role, status = 'approved', approved_at = now();

insert into public.players (player_id, name, user_id)
select 'CC-RLS-01', 'RLS Test Player (disposable)', u.id
from auth.users u where u.email = 'rls.player@chessclubapp.org'
on conflict (player_id) do update set user_id = excluded.user_id;

-- Rows owned by a DIFFERENT player, so the denials are meaningful.
insert into public.coach_notes (player_id, note)
select 'CC-002', 'RLS FIXTURE: a private coach note that no player may ever read'
where not exists (select 1 from public.coach_notes where note like 'RLS FIXTURE%');
insert into public.assessments (player_id, opening, tactics, positional, endgame, time_management, board_vision, resilience, notation, notes)
select 'CC-002', 6,5,6,4,5,6,5,4, 'RLS FIXTURE'
where not exists (select 1 from public.assessments where notes like 'RLS FIXTURE%');
insert into public.goals (player_id, goal, target_rating, status)
select 'CC-002', 'RLS FIXTURE goal', 1000, 'active'
where not exists (select 1 from public.goals where goal like 'RLS FIXTURE%');
insert into public.consent_records (player_id, guardian_name, guardian_email, under_13, data_collected, method)
select 'CC-002', 'RLS FIXTURE Guardian', 'fixture@chessclubapp.org', true, 'RLS FIXTURE', 'fixture'
where not exists (select 1 from public.consent_records where data_collected like 'RLS FIXTURE%');
insert into public.puzzle_attempts (player_id, puzzle_id, correct, themes)
select 'CC-002', 'rls-fixture-other', true, array['fork']
where not exists (select 1 from public.puzzle_attempts where puzzle_id = 'rls-fixture-other');
