-- ---------------------------------------------------------------------------
-- One mentor, one login
-- ---------------------------------------------------------------------------
-- A one-off data correction, not a schema change. One mentor accumulated three
-- logins, and the one his mentor record points at is not the one he uses:
--
--   * `pr.kambale@handt.ai` has a password he set himself, and is attached to
--     nothing at all. A mentor signing in here has `current_mentor_id()` of
--     null, so every mentor policy refuses and the screens are empty.
--
--   * `p.kambale@handt.ai` is attached to MEN023 and still holds the password
--     it was handed out with, so it has never been signed in with.
--
--   * `p.kambale@rnt.ai` is disabled, attached to nothing, same handed-out
--     password, on a domain this project no longer uses.
--
-- So the link moves to the account in use, and the two unused ones are removed.
-- Three indistinguishable "Prem Kambale" accounts is the same problem a
-- duplicate employee record caused on the Team activity screen: the interface
-- names a person, not an address, so nobody choosing from a list can tell them
-- apart. An unused login still holding a handed-out password is also the
-- weakest credential on the project.
--
-- Two things worth saying about the mechanism.
--
-- The rows go from `auth.users`, not from `public.profiles`. The cascade runs
-- that way and not the other, so removing only the profile would leave an
-- account that still authenticates and then fails on a missing profile, which
-- is worse than one that is gone. `record_history` keeps its account of what
-- they did regardless: `changed_by` is deliberately not a foreign key, and
-- `changed_by_name` holds the display name as it was at the time.
--
-- And deleting a profile sets `mentors.profile_id` and `developers.profile_id`
-- to null, which is how somebody loses their access while keeping every record
-- that describes it. The link is therefore checked before the delete, and this
-- refuses rather than detaching anybody. MEN023 holds no assignments, no
-- project responsibilities and no feedback today, so this restores an access
-- path rather than moving any work.

do $$
declare
  mentor_code constant text := 'MEN023';
  keeper_email constant text := 'pr.kambale@handt.ai';
  unused constant text[] := array['p.kambale@handt.ai', 'p.kambale@rnt.ai'];

  v_mentor_id uuid;
  v_keeper_profile uuid;
  v_blocker text;
  v_deleted integer;
begin
  select m.id into v_mentor_id
    from public.mentors m
   where m.code = mentor_code
     and m.deleted_at is null;

  if v_mentor_id is null then
    raise notice 'Mentor record % is not on the roster. Nothing was changed.', mentor_code;
    return;
  end if;

  select p.id into v_keeper_profile
    from public.profiles p
   where lower(btrim(p.email)) = keeper_email;

  if v_keeper_profile is null then
    raise notice 'No login is registered as %. Nothing was changed.', keeper_email;
    return;
  end if;

  -- -------------------------------------------------------------------------
  -- The link
  -- -------------------------------------------------------------------------
  -- `profile_id` is unique, and the address is unique across live rows, so
  -- both have to be free before they are taken. Neither is a conflict today;
  -- this refuses rather than discovering it as a constraint violation.

  select 'mentor record ' || m.code
    into v_blocker
    from public.mentors m
   where m.profile_id = v_keeper_profile
     and m.id <> v_mentor_id
   limit 1;

  if v_blocker is null then
    select 'employee record ' || d.code
      into v_blocker
      from public.developers d
     where d.profile_id = v_keeper_profile
     limit 1;
  end if;

  if v_blocker is null then
    select 'mentor record ' || m.code
      into v_blocker
      from public.mentors m
     where m.id <> v_mentor_id
       and m.deleted_at is null
       and lower(btrim(m.email)) = keeper_email
     limit 1;
  end if;

  if v_blocker is not null then
    raise exception 'Login % already belongs to %.', keeper_email, v_blocker;
  end if;

  update public.mentors
     set profile_id = v_keeper_profile,
         email = keeper_email
   where id = v_mentor_id;

  raise notice 'Mentor record % now signs in as %.', mentor_code, keeper_email;

  -- -------------------------------------------------------------------------
  -- The logins nobody uses
  -- -------------------------------------------------------------------------
  -- The link above was the only one pointing at either of them, so this reads
  -- as a check on that rather than a second chance to change something.

  select 'mentor record ' || m.code
    into v_blocker
    from public.mentors m
    join public.profiles p on p.id = m.profile_id
   where m.deleted_at is null
     and lower(btrim(p.email)) = any (unused)
   limit 1;

  if v_blocker is null then
    select 'employee record ' || d.code
      into v_blocker
      from public.developers d
      join public.profiles p on p.id = d.profile_id
     where d.deleted_at is null
       and lower(btrim(p.email)) = any (unused)
     limit 1;
  end if;

  if v_blocker is not null then
    raise exception
      'A live % still signs in with one of those addresses, so none of them were removed.',
      v_blocker;
  end if;

  delete from auth.users u where lower(btrim(u.email)) = any (unused);
  get diagnostics v_deleted = row_count;

  raise notice 'Unused logins removed: %. Their profiles went with them.', v_deleted;
end;
$$;
