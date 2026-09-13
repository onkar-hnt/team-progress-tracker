-- ---------------------------------------------------------------------------
-- Account lifecycle
-- ---------------------------------------------------------------------------
-- Three gaps between the roster and the logins attached to it.
--
-- The first: nothing in the application ever wrote `profiles.status`. Sign-in
-- reads it and refuses an inactive account — `resolveSupabaseIdentity` throws
-- `InactiveAccountError` on it — and the column has been there since the first
-- migration, but the only way to set it was the Supabase dashboard. So
-- somebody taken off the roster kept working credentials, and the Employees
-- form said as much in a hint that read like an apology.
--
-- The second: `developers.access_role` and `profiles.role` are two answers to
-- one question, and on this data source only the second decides anything. An
-- administrator changing an employee's access role was changing a column that
-- nothing consults, while the access it describes stayed where it was. Now the
-- profile follows it.
--
-- The third follows from the second. Once that column feeds a profile role it
-- can no longer be writable by a mentor, or maintaining the roster would be a
-- route to handing out mentor access — so it becomes an administrator's field,
-- refused in the database rather than merely disabled in the form.

-- ---------------------------------------------------------------------------
-- Deciding who may change an account's state
-- ---------------------------------------------------------------------------
-- The mirror of `may_reset_password`, and deliberately narrower than it.
--
-- Administrators only. A mentor may hand out a login and reset the password of
-- somebody assigned to them, because both are things that get a person working;
-- taking access away is not, and the roster's own `active` flag already lets a
-- mentor say somebody has left.
--
-- Two targets are refused whatever the caller's role:
--
--   * Themselves. An administrator disabling their own sign-in would be locked
--     out by their next request, and where they are the only administrator
--     there is nobody left who could undo it.
--
--   * Another administrator. Same reasoning as `may_reset_password`: an
--     administrator account is the thing the whole access model rests on, and
--     it is not administered from inside the application it protects.
--
-- Written out in full rather than deriving from `may_reset_password`, because
-- the two answer different questions and a shared helper would invite one
-- change to quietly alter both.

create or replace function public.may_manage_account(
  p_actor_profile_id uuid,
  p_target_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with actor as (
    select role, status
      from public.profiles
     where id = p_actor_profile_id
  ),
  target as (
    select role
      from public.profiles
     where id = p_target_profile_id
  )
  select
    p_actor_profile_id is distinct from p_target_profile_id
    and exists (select 1 from actor where role = 'admin' and status = 'active')
    and exists (select 1 from target where role <> 'admin');
$$;

comment on function public.may_manage_account is
  'Whether an actor may enable or disable another account. Active administrators only; never themselves, never another administrator. Service role only.';

revoke all on function public.may_manage_account(uuid, uuid) from public, anon, authenticated;
grant execute on function public.may_manage_account(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Writing the status
-- ---------------------------------------------------------------------------
-- Needed for the same reason `assign_profile_role` is: `guard_profile_privileges`
-- allows a status change only to `is_admin()`, and under the service key
-- `auth.uid()` is null — so the Edge Function is nobody as far as that guard is
-- concerned, and a plain UPDATE from it would be refused.
--
-- It does not repeat the authorization question. `may_manage_account` above is
-- asked by the caller, once, with the actor's id; this function is the write.
-- Keeping them apart is what lets the Edge Function refuse in one place and
-- report a reason, rather than reading a raised exception back out of Postgres.
--
-- The administrator check is still repeated here as a last line, because this
-- function is reachable by anything holding the service key and a target it was
-- never meant to touch is worth refusing twice.

create or replace function public.set_profile_status(p_profile_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_role text;
begin
  if p_status not in ('active', 'inactive') then
    raise exception 'Account status must be active or inactive.' using errcode = '22023';
  end if;

  select role into target_role from public.profiles where id = p_profile_id;

  if target_role is null then
    raise exception 'No profile with that id.' using errcode = 'P0002';
  end if;

  if target_role = 'admin' then
    raise exception 'An administrator account is not enabled or disabled from the application.'
      using errcode = '42501';
  end if;

  perform set_config('app.profile_role_assignment', 'on', true);

  update public.profiles
     set status = p_status
   where id = p_profile_id;

  -- Put back rather than left set. The setting is transaction-local, so it would
  -- otherwise stay on for whatever else the same request went on to do.
  perform set_config('app.profile_role_assignment', 'off', true);
end;
$$;

comment on function public.set_profile_status is
  'Enables or disables an account, for the set-account-state Edge Function. Service role only; refuses administrator accounts.';

revoke all on function public.set_profile_status(uuid, text) from public, anon, authenticated;
grant execute on function public.set_profile_status(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- The guard gains one rail
-- ---------------------------------------------------------------------------
-- Identical to the definition in `20260911100000_mentor_provisioning.sql` except
-- for the self-disable refusal, which sits ahead of everything else so that it
-- applies to administrators too — they are the only people the rest of this
-- function lets through, and so the only ones who could do it.
--
-- It cannot interfere with the server-side path: `auth.uid()` is null under the
-- service key, so the comparison is false there and `set_profile_status` above
-- passes through.

create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     and new.status <> 'active'
     and new.id = auth.uid()
  then
    raise exception 'You cannot disable your own sign-in.'
      using errcode = '42501';
  end if;

  if new.must_change_password is distinct from old.must_change_password
     and new.must_change_password = false
     and coalesce(current_setting('app.password_change_confirmed', true), '') <> 'on'
  then
    raise exception
      'The password-change requirement is cleared by public.complete_password_change(), not by updating the column.'
      using errcode = '42501';
  end if;

  if coalesce(current_setting('app.profile_role_assignment', true), '') = 'on' then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'Only an administrator may change a role.'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    raise exception 'Only an administrator may change account status.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- The access role becomes an administrator's field
-- ---------------------------------------------------------------------------
-- Not `security definer`, exactly like `guard_identity_link` and for the same
-- reason: `current_user` has to be the role PostgREST switched to for the
-- request, so the provisioning functions (`service_role`) pass straight through
-- and a signed-in person is asked who they are. Inside a `security definer`
-- function it would be the owner instead and the test would never fire.
--
-- Mentors keep every other column on this table, including `active`. What they
-- lose is the one column that now grants access.

create or replace function public.guard_developer_access_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.access_role is not distinct from old.access_role then
    return new;
  end if;

  if current_user <> 'authenticated' or public.is_admin() then
    return new;
  end if;

  raise exception 'Only an administrator may change an access role.'
    using errcode = '42501';
end;
$$;

comment on function public.guard_developer_access_role is
  'Keeps developers.access_role writable only by administrators and the provisioning functions, because it now decides the profile role.';

drop trigger if exists developers_guard_access_role on public.developers;
create trigger developers_guard_access_role
  before update on public.developers
  for each row execute function public.guard_developer_access_role();

-- ---------------------------------------------------------------------------
-- And the profile follows it
-- ---------------------------------------------------------------------------
-- Fires on two changes, because the column and the link can arrive in either
-- order: an access role edited on somebody who already has a login, and a login
-- attached to a row whose access role was set while they had none. The second is
-- what the provisioning function cannot get right on its own — it always creates
-- a developer profile from the Employees screen, so a row already marked mentor
-- would have ended up disagreeing with itself the moment it was provisioned.
--
-- Three things it will not do:
--
--   * Grant `admin`. An access role of admin on an employee row stays a note to
--     whoever reads the roster; administrators are not made from this table.
--
--   * Touch an administrator's profile, so a roster edit cannot demote one.
--
--   * Lower a profile that has a mentor record to `developer`. One person is
--     often both, their employee row carries the column's default while their
--     profile says mentor because a mentor login was provisioned for them — and
--     an edit to their location should not take their mentor access away.

create or replace function public.sync_profile_role_from_access_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_role text;
begin
  if new.profile_id is null then
    return null;
  end if;

  if new.access_role is not distinct from old.access_role
     and new.profile_id is not distinct from old.profile_id
  then
    return null;
  end if;

  -- Absent means developer, which is how every reader of this column treats it.
  target_role := coalesce(new.access_role, 'developer');

  if target_role = 'admin' then
    return null;
  end if;

  if target_role = 'developer'
     and exists (select 1 from public.mentors m where m.profile_id = new.profile_id)
  then
    return null;
  end if;

  perform set_config('app.profile_role_assignment', 'on', true);

  update public.profiles
     set role = target_role
   where id = new.profile_id
     and role <> 'admin'
     and role <> target_role;

  perform set_config('app.profile_role_assignment', 'off', true);

  return null;
end;
$$;

comment on function public.sync_profile_role_from_access_role is
  'Keeps profiles.role in step with developers.access_role. Never grants admin, never demotes an administrator, never lowers somebody who also holds a mentor record.';

drop trigger if exists developers_sync_profile_role on public.developers;
create trigger developers_sync_profile_role
  after update on public.developers
  for each row execute function public.sync_profile_role_from_access_role();

-- ---------------------------------------------------------------------------
-- Whatever has already drifted
-- ---------------------------------------------------------------------------
-- The same rule applied once to what is already stored. Written as a `do` block
-- rather than a bare statement so that the escape hatch is set and cleared in
-- the same place the trigger does it, and with the identical three exclusions —
-- a backfill that demoted a mentor who also holds an employee row would be a
-- worse outcome than the drift it was fixing.

do $$
begin
  perform set_config('app.profile_role_assignment', 'on', true);

  update public.profiles p
     set role = coalesce(d.access_role, 'developer')
    from public.developers d
   where d.profile_id = p.id
     and coalesce(d.access_role, 'developer') in ('developer', 'mentor')
     and p.role <> 'admin'
     and p.role <> coalesce(d.access_role, 'developer')
     and not (
       coalesce(d.access_role, 'developer') = 'developer'
       and exists (select 1 from public.mentors m where m.profile_id = p.id)
     );

  perform set_config('app.profile_role_assignment', 'off', true);
end;
$$;
