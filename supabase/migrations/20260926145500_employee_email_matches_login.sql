-- ---------------------------------------------------------------------------
-- The employee record carries the address its owner signs in with
-- ---------------------------------------------------------------------------
-- A one-off data correction, following `20260925160000_merge_duplicate_employee.sql`.
--
-- That merge kept DEV019 as the surviving record and moved the login across
-- from the duplicate, because the login was the one in use. What it did not do
-- is move the address on the roster row, so the Employees screen shows
-- s.deshmukh@handt.ai for somebody who signs in as sh.deshmukh@handt.ai.
--
-- The column is not what authenticates anybody — `developers.profile_id` is —
-- so this is about the roster agreeing with itself. It is also what the
-- provisioning functions read when handing out a login, which is a second
-- reason for it not to name an address nobody uses.
--
-- The address is cleared from the deleted duplicate at the same time.
-- `developers_email_key` is unique over live rows only, so the two can coexist
-- while one is in the bin — but restoring that row would then fail on the
-- index, and a restore should not be the thing that discovers this.

do $$
declare
  keeper_id constant uuid := '3ec16ff0-9df1-4add-af70-0f593ffbb0c3';
  merged_id constant uuid := '34a415ec-8bbd-4fa4-9164-874866eadf0d';
  login_email constant text := 'sh.deshmukh@handt.ai';

  v_current_email text;
  v_profile_email text;
begin
  select d.email into v_current_email
    from public.developers d
   where d.id = keeper_id
     and d.deleted_at is null;

  if v_current_email is null then
    raise notice 'Employee record % is missing or deleted. Nothing was changed.', keeper_id;
    return;
  end if;

  if lower(btrim(v_current_email)) = login_email then
    raise notice 'Employee record % already reads %.', keeper_id, login_email;
    return;
  end if;

  -- The login is the authority on what this should say, so it is read rather
  -- than assumed: a constant that no longer matches the attached profile would
  -- mean the merge was undone, and this should stop instead of overwriting.
  select p.email into v_profile_email
    from public.developers d
    join public.profiles p on p.id = d.profile_id
   where d.id = keeper_id;

  if v_profile_email is null or lower(btrim(v_profile_email)) <> login_email then
    raise exception
      'Employee record % does not sign in as %, so its address was left alone.',
      keeper_id, login_email;
  end if;

  if exists (
    select 1
      from public.developers d
     where d.id <> keeper_id
       and d.deleted_at is null
       and lower(btrim(d.email)) = login_email
  ) then
    raise exception 'Another live employee record already reads %.', login_email;
  end if;

  update public.developers set email = null
   where id = merged_id
     and deleted_at is not null;

  update public.developers set email = v_profile_email where id = keeper_id;

  raise notice 'Employee record % now reads %, matching its login.', keeper_id, login_email;
end;
$$;
