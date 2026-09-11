-- ---------------------------------------------------------------------------
-- Mentor login provisioning
-- ---------------------------------------------------------------------------
-- Mentors are now given logins the same way employees are, which needs two
-- things the database did not previously allow.
--
-- The first is a way for the provisioning function to set a role. The trigger
-- on `auth.users` defaults every new account to `developer`, so a mentor's
-- profile arrives with the wrong role and has to be corrected — and
-- `guard_profile_privileges` refuses role changes from anyone who is not an
-- administrator. Under the service key `auth.uid()` is null, so the function
-- is nobody as far as that guard is concerned and the correction would fail.
--
-- Relaxing the guard for the service role was the obvious fix and the wrong
-- one: the guard is SECURITY DEFINER, so `current_user` inside it is the
-- function owner rather than the caller, and detecting the service role would
-- have meant trusting a JWT claim. A dedicated function that only the service
-- role may execute says the same thing without depending on any of that.
--
-- The second is that the password-change check has to know a mentor's name.

-- ---------------------------------------------------------------------------
-- Assigning a role
-- ---------------------------------------------------------------------------
-- The only way `profiles.role` changes other than by an administrator's own
-- UPDATE. Callable by the service role and nothing else, so it is reachable
-- from the provisioning Edge Functions and not from a browser.
--
-- `admin` is refused outright. Nothing in the provisioning flow has any
-- business granting administrator, and an argument that could would make this
-- function a privilege-escalation route for anybody who ever obtained the
-- service key for a moment.
--
-- `app.profile_role_assignment` is set transaction-locally to get past the
-- guard. PostgREST exposes functions in the `public` schema and nothing else,
-- so `set_config` is not reachable from a client and the setting cannot be
-- forged; being transaction-local, it also cannot outlive this call.

create or replace function public.assign_profile_role(p_profile_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_role not in ('developer', 'mentor') then
    raise exception 'Only developer and mentor roles may be assigned this way.'
      using errcode = '22023';
  end if;

  perform set_config('app.profile_role_assignment', 'on', true);

  update public.profiles
     set role = p_role,
         status = 'active'
   where id = p_profile_id;

  if not found then
    raise exception 'No profile with that id.' using errcode = 'P0002';
  end if;
end;
$$;

comment on function public.assign_profile_role is
  'Sets a profile role and reactivates the account, for the provisioning Edge Functions. Service role only; cannot grant admin.';

revoke all on function public.assign_profile_role(uuid, text) from public, anon, authenticated;
grant execute on function public.assign_profile_role(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- The guard learns about that function
-- ---------------------------------------------------------------------------
-- Identical to the previous definition except for the one new escape hatch,
-- which sits after the password-change check and before everything else. The
-- ordering is the point: `assign_profile_role` may change a role and a status,
-- and may not clear somebody's obligation to replace a temporary password.

create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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
-- The temporary-password check learns about mentors
-- ---------------------------------------------------------------------------
-- Previously the name was taken from the linked developer row, falling back to
-- the display name. A mentor has neither a developer row nor, necessarily, a
-- display name that survived being edited — so their temporary password was
-- re-derived from the wrong name and the check passed without testing
-- anything, which is the one way this function can fail quietly.
--
-- The order matters where somebody is both. The developer name comes first
-- because that is the row an account is provisioned from when the person is
-- an employee too, and so is the name the password was actually derived from.

create or replace function public.complete_password_change()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  expected_name text;
  temporary_password text;
  still_temporary boolean := false;
begin
  if caller_id is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;

  select coalesce(d.name, m.name, p.display_name)
    into expected_name
    from public.profiles p
    left join public.developers d on d.profile_id = p.id
    left join public.mentors m on m.profile_id = p.id
   where p.id = caller_id;

  if expected_name is null then
    raise exception 'Your profile could not be read.' using errcode = 'P0002';
  end if;

  temporary_password := public.initial_password_for(expected_name);

  -- Wrapped because it depends on how GoTrue happens to hash passwords.
  -- bcrypt today, and `crypt` verifies it; were that to change, this would
  -- raise and every account would be permanently stuck on a screen it cannot
  -- leave. Failing the check open is the lesser fault by a wide margin: the
  -- person has already authenticated, and the flag is a prompt to replace a
  -- weak password rather than the thing keeping anybody out.
  begin
    select u.encrypted_password = extensions.crypt(temporary_password, u.encrypted_password)
      into still_temporary
      from auth.users u
     where u.id = caller_id;
  exception
    when others then
      still_temporary := false;
  end;

  if coalesce(still_temporary, false) then
    raise exception 'Your new password must be different from the temporary one you were given.'
      using errcode = '22023';
  end if;

  perform set_config('app.password_change_confirmed', 'on', true);

  update public.profiles
     set must_change_password = false
   where id = caller_id
     and must_change_password;

  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- Existing mentors holding a temporary password
-- ---------------------------------------------------------------------------
-- The earlier backfill decided this column by re-deriving each person's
-- temporary password from their developer name or display name, which for a
-- mentor could have been the wrong name and so answered "no" without
-- checking. Nothing has provisioned a mentor login yet, so this should change
-- no rows — it is here because if that assumption is wrong, the accounts it
-- would have missed are exactly the ones carrying a guessable password.

do $$
begin
  begin
    update public.profiles p
       set must_change_password = true
      from public.mentors m
      join auth.users u on u.id = m.profile_id
     where m.profile_id = p.id
       and p.role <> 'admin'
       and not p.must_change_password
       and u.encrypted_password = extensions.crypt(
             public.initial_password_for(m.name), u.encrypted_password
           );
  exception
    when others then
      raise notice 'Mentor temporary-password backfill skipped: %', sqlerrm;
  end;
end;
$$;
