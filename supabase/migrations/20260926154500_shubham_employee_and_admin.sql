-- ---------------------------------------------------------------------------
-- One login is an employee and an administrator
-- ---------------------------------------------------------------------------
-- A one-off data correction, not a schema change, and a deliberate reversal of
-- `20260925161000_employee_only_login.sql`. That migration lowered this login
-- to employee; this restores the administrator role while keeping the employee
-- record, so the same person logs their own work and administers the roster.
--
-- Both columns are set, because they answer to different readers:
--
--   * `profiles.role` is the authority. `is_admin()` reads it, and so does
--     `resolveSupabaseIdentity` on every page load. Nothing is an administrator
--     until this says so.
--
--   * `developers.access_role` is the roster's copy, and what the Employees
--     screen shows. Left saying developer it would be a visible contradiction,
--     though not a functional one: `sync_profile_role_from_access_role` never
--     demotes an administrator, so it would not have undone the line below.
--
-- The order matters in one direction only. That same trigger returns without
-- doing anything when the access role becomes `admin` — administrators are
-- deliberately not made from the roster table — so the profile has to be
-- written here rather than left to follow.
--
-- What this does not restore is mentor access. `current_mentor_id()` keys off
-- `mentors.profile_id`, which the earlier migration detached, and a mentor
-- record is not implied by either column below. Re-attaching it is a single
-- update of that column if it is ever wanted.

do $$
declare
  developer_id constant uuid := '3ec16ff0-9df1-4add-af70-0f593ffbb0c3';

  v_profile_id uuid;
  v_email text;
begin
  select d.profile_id, d.email
    into v_profile_id, v_email
    from public.developers d
   where d.id = developer_id
     and d.deleted_at is null;

  if not found then
    raise notice 'Employee record % is missing or deleted. Nothing was changed.', developer_id;
    return;
  end if;

  update public.developers
     set access_role = 'admin'
   where id = developer_id
     and coalesce(access_role, 'developer') <> 'admin';

  if v_profile_id is null then
    raise notice
      'Employee record % has no login attached, so the roster now reads admin but there is no role to raise.',
      developer_id;
    return;
  end if;

  -- `guard_profile_privileges` allows a role change only for an administrator,
  -- and `auth.uid()` is null here. The same escape hatch the backfill in
  -- `20260913180000_account_lifecycle.sql` uses.
  perform set_config('app.profile_role_assignment', 'on', true);

  update public.profiles
     set role = 'admin'
   where id = v_profile_id
     and role <> 'admin';

  perform set_config('app.profile_role_assignment', 'off', true);

  raise notice
    '% now signs in as an administrator, and keeps employee record %.',
    coalesce(v_email, v_profile_id::text), developer_id;
end;
$$;
