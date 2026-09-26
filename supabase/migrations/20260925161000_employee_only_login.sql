-- ---------------------------------------------------------------------------
-- One login goes back to being an employee
-- ---------------------------------------------------------------------------
-- A one-off data correction, not a schema change. One person holds an
-- administrator profile and a mentor record alongside their employee record,
-- and should hold only the employee record.
--
-- Three columns decide that, and the application reads all three from different
-- places:
--
--   * `profiles.role` is the authority on what somebody sees. `is_admin()`
--     reads it, and so does `resolveSupabaseIdentity` on every page load.
--
--   * `developers.access_role` is the roster's copy of the same answer. It
--     feeds the profile through `sync_profile_role_from_access_role`, so
--     leaving it as it was would put the old role back on the next roster edit.
--
--   * `mentors.profile_id` is what `current_mentor_id()` keys off. Every mentor
--     policy asks that function, not the profile role, so an account with the
--     role lowered but the mentor record still attached would keep reading
--     mentees' work. Detaching the login is what removes mentor access.
--
-- The mentor record is kept, not deleted. It holds project responsibilities in
-- `project_mentors`, the primary mentor on `projects`, and the assignment
-- history in `mentor_assignments` — none of which is about who signs in.
-- Detaching the login leaves all of it in place, and re-attaching it later is a
-- single update of `profile_id`.
--
-- Where no employee of this name is on the roster, this does nothing and says
-- so, so it is safe to apply to an environment that never had the account.
--
-- Runs after `20260925160000_merge_duplicate_employee.sql`, which is what makes
-- the name unambiguous: before it there were two live records under this name,
-- and the check below would refuse rather than pick one.

do $$
declare
  subject constant text := 'shubham deshmukh';
  v_matches integer;
  v_developer_id uuid;
  v_profile_id uuid;
  v_role text;
  v_mentor_id uuid;
begin
  select count(*)
    into v_matches
    from public.developers d
   where lower(btrim(d.name)) = subject
     and d.deleted_at is null;

  if v_matches = 0 then
    raise notice 'No employee record named "%" is on the roster. Nothing was changed.', subject;
    return;
  end if;

  -- Refused rather than guessed: demoting the wrong colleague is worse than
  -- applying this again with an id.
  if v_matches > 1 then
    raise exception 'More than one employee record is named "%". Name the account by id instead.', subject;
  end if;

  select d.id, d.profile_id
    into v_developer_id, v_profile_id
    from public.developers d
   where lower(btrim(d.name)) = subject
     and d.deleted_at is null;

  update public.developers
     set access_role = 'developer'
   where id = v_developer_id
     and coalesce(access_role, 'developer') <> 'developer';

  if v_profile_id is null then
    raise notice 'The employee record named "%" has no login attached, so there was no role to lower.', subject;
    return;
  end if;

  select p.role into v_role from public.profiles p where p.id = v_profile_id;

  -- The role is not editable anywhere in the application, so an administrator
  -- with database access is the only way back. Removing the last one would
  -- leave nobody who can hand out logins or disable an account.
  if v_role = 'admin'
     and not exists (
       select 1
         from public.profiles p
        where p.id <> v_profile_id
          and p.role = 'admin'
          and p.status = 'active'
     )
  then
    raise exception
      'This is the only active administrator. Give somebody else that role first, or account administration will be unreachable.';
  end if;

  update public.mentors
     set profile_id = null
   where profile_id = v_profile_id
  returning id into v_mentor_id;

  -- `guard_profile_privileges` allows a role change only for an administrator,
  -- and `auth.uid()` is null here. The same escape hatch the backfill in
  -- `20260913180000_account_lifecycle.sql` uses.
  perform set_config('app.profile_role_assignment', 'on', true);

  update public.profiles
     set role = 'developer'
   where id = v_profile_id
     and role <> 'developer';

  perform set_config('app.profile_role_assignment', 'off', true);

  if v_mentor_id is null then
    raise notice '"%" now signs in as an employee.', subject;
  else
    raise notice
      '"%" now signs in as an employee. Mentor record % kept its projects and assignments, with no login attached.',
      subject, v_mentor_id;
  end if;
end;
$$;
