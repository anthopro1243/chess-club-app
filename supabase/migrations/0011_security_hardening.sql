-- 0011 — security hardening, following the Supabase security advisor.
--
-- WHAT WAS DONE, AND ONE THING THAT WAS DELIBERATELY NOT DONE.
--
-- 1. touch_updated_at had a mutable search_path. Pinned to ''.
--
-- 2. redeem_invite was the real find. It incremented invite_codes.uses BEFORE
--    checking who was calling, and was callable anonymously - so anyone could
--    burn a legitimate invite code by guessing at it, no account needed. It
--    now requires a signed-in caller, is rate limited to 10 attempts an hour
--    per account via public.invite_attempts, and is revoked from anon.
--
-- 3. handle_new_user, protect_profile_privileges and rls_auto_enable are
--    internal trigger functions that nothing should ever call over REST.
--    Revoked from public, anon and authenticated. Triggers still fire: they
--    run as the table owner, not as the caller.
--
-- 4. is_coach, is_approved, is_admin, my_player_id and owns_player REMAIN
--    executable, and the advisor will keep warning about them. This is a
--    deliberate, tested decision, not an oversight:
--
--      RLS policy expressions are evaluated with the CALLER's privileges. A
--      role that cannot EXECUTE a helper named in a policy gets 42501 instead
--      of a filtered result. This was verified against the live database -
--      revoking them from PUBLIC broke every policy that calls them, and
--      authenticated reads of public.players started failing with 42501. The
--      grants were restored immediately and Gate 5 returned to 16/16.
--
--      Exposure is negligible: each takes no meaningful input, each reports
--      only on auth.uid(), and an anonymous caller learns nothing about
--      anybody else. owns_player(text) answers "do *I* own this player", which
--      is already knowable from the roster the caller can read.

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at = now(); return new; end; $$;

create table if not exists public.invite_attempts (
  id           bigserial primary key,
  user_id      uuid references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now(),
  succeeded    boolean not null default false
);
create index if not exists invite_attempts_user_idx
  on public.invite_attempts (user_id, attempted_at desc);
alter table public.invite_attempts enable row level security;
drop policy if exists invite_attempts_coach_read on public.invite_attempts;
create policy invite_attempts_coach_read on public.invite_attempts
  for select to authenticated using (public.is_coach());

create or replace function public.redeem_invite(p_code text)
returns boolean language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_recent integer;
  v_matched boolean := false;
begin
  if v_uid is null then
    raise exception 'sign in before redeeming an invite code' using errcode = '28000';
  end if;
  select count(*) into v_recent from public.invite_attempts
   where user_id = v_uid and attempted_at > now() - interval '1 hour';
  if v_recent >= 10 then
    raise exception 'too many invite attempts, try again later' using errcode = '54000';
  end if;
  update public.invite_codes set uses = uses + 1
   where code = p_code and (expires_at is null or expires_at > now()) and uses < max_uses
  returning true into v_matched;
  insert into public.invite_attempts (user_id, succeeded) values (v_uid, coalesce(v_matched,false));
  if coalesce(v_matched, false) then
    update public.profiles set status = 'approved', approved_at = now()
     where user_id = v_uid and status = 'pending';
    return true;
  end if;
  return false;
end; $$;

revoke all on function public.handle_new_user()            from public, anon, authenticated;
revoke all on function public.protect_profile_privileges() from public, anon, authenticated;
revoke all on function public.rls_auto_enable()            from public, anon, authenticated;

revoke all on function public.redeem_invite(text) from public, anon;
grant execute on function public.redeem_invite(text) to authenticated;

-- Required by RLS policy evaluation - see note 4 above.
grant execute on function public.is_coach()        to anon, authenticated;
grant execute on function public.is_approved()     to anon, authenticated;
grant execute on function public.is_admin()        to anon, authenticated;
grant execute on function public.my_player_id()    to anon, authenticated;
grant execute on function public.owns_player(text) to anon, authenticated;
