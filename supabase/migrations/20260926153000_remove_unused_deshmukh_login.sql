-- ---------------------------------------------------------------------------
-- The login the merge left behind
-- ---------------------------------------------------------------------------
-- A one-off data correction, not a schema change, and the last step of
-- `20260925160000_merge_duplicate_employee.sql`.
--
-- That merge kept DEV019 and moved the login in use onto it. `profile_id` is
-- unique, so the address DEV019 had been carrying, `s.deshmukh@handt.ai`, had
-- to be released — and it was left in place, enabled, attached to nothing.
--
-- An enabled login with no employee record is worse than it looks. It
-- authenticates, so it is not refused at the door; `current_developer_id()` is
-- null for it, so every policy that asks who you are declines; and the Accounts
-- screen lists it under the same name as the account that does work, which is
-- the duplicate-name confusion the merge was undoing.
--
-- It goes from `auth.users`, not from `public.profiles`: the cascade runs that
-- way and not the other, so removing only the profile would leave an account
-- that still signs in and then fails on a missing profile. `record_history`
-- keeps its account of what this login did regardless — `changed_by` is
-- deliberately not a foreign key, and `changed_by_name` holds the display name
-- as it was at the time.
--
-- The link is checked first. Deleting a profile sets `developers.profile_id`
-- and `mentors.profile_id` to null, which is how somebody loses their access
-- while keeping every record that describes it, so this refuses rather than
-- detaching anybody.

do $$
declare
  unused_email constant text := 's.deshmukh@handt.ai';

  v_profile_id uuid;
  v_blocker text;
  v_deleted integer;
begin
  select p.id into v_profile_id
    from public.profiles p
   where lower(btrim(p.email)) = unused_email;

  if v_profile_id is null then
    raise notice 'No login is registered as %. Nothing was changed.', unused_email;
    return;
  end if;

  select 'employee record ' || d.code
    into v_blocker
    from public.developers d
   where d.profile_id = v_profile_id
   limit 1;

  if v_blocker is null then
    select 'mentor record ' || m.code
      into v_blocker
      from public.mentors m
     where m.profile_id = v_profile_id
     limit 1;
  end if;

  -- Deleted rows count. One restored from the Recently deleted screen would
  -- come back expecting its login to still be there.
  if v_blocker is not null then
    raise exception
      'Login % belongs to %, so it was left alone.',
      unused_email, v_blocker;
  end if;

  delete from auth.users u where u.id = v_profile_id;
  get diagnostics v_deleted = row_count;

  if v_deleted = 0 then
    raise notice
      'Profile % has no account behind it, so there was no login to remove.',
      unused_email;
  else
    raise notice 'Login % removed. Its profile went with it.', unused_email;
  end if;
end;
$$;
