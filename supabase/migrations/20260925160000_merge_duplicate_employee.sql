-- ---------------------------------------------------------------------------
-- Two employee records, one person
-- ---------------------------------------------------------------------------
-- A one-off data correction, not a schema change. The same colleague was put on
-- the roster twice, under two work addresses, and both rows are live:
--
--   * DEV019, s.deshmukh@handt.ai, on the roster since 11 September, carrying
--     the project memberships.
--
--   * DEV028, sh.deshmukh@handt.ai, added on 22 September, carrying the work
--     logged since.
--
-- Nothing in the interface distinguishes them, because every list names a
-- developer by `name` alone. Both appear in the Team activity filter as
-- "Shubham Deshmukh", and choosing the wrong one returns an empty week that
-- reads as a broken filter rather than as the wrong person.
--
-- DEV019 stays. Its work, memberships and assignments are moved onto it,
-- and DEV028 goes to the Recently deleted screen once nothing references it —
-- which is the same soft delete the Employees screen performs, so this is
-- reversible from the interface if any of it is wrong.
--
-- Two things are deliberately left where they are:
--
--   * The history of the DEV028 row itself. `record_history` rows about the
--     roster record stay attached to the record they describe; only the history
--     of the work moves with the work.
--
--   * The mentor and project tables. Neither references an employee row.
--
-- Applying this twice does nothing the second time: DEV028 has no work left to
-- move and is already deleted. Applying it to an environment that never had
-- these rows says so and stops.

do $$
declare
  -- Named by id, because the name is exactly what is not unique here. The
  -- addresses are checked against the ids so that this stops rather than
  -- guesses if it meets a database where those ids mean something else.
  keeper_id constant uuid := '3ec16ff0-9df1-4add-af70-0f593ffbb0c3';
  merged_id constant uuid := '34a415ec-8bbd-4fa4-9164-874866eadf0d';
  keeper_email constant text := 's.deshmukh@handt.ai';
  merged_email constant text := 'sh.deshmukh@handt.ai';

  -- Which login the surviving row keeps. `developers.profile_id` is unique, so
  -- one of the two accounts has to let go of it. The work logged on 23 and 24
  -- September was recorded against DEV028, so this is the account in use; the
  -- other profile is left alone, signed out of the roster.
  login_email constant text := 'sh.deshmukh@handt.ai';

  v_keeper_email text;
  v_merged_email text;
  v_keeper_profile uuid;
  v_merged_profile uuid;
  v_login_profile uuid;
  v_deleted_at timestamptz;
  v_moved integer;
begin
  if not exists (select 1 from public.developers d where d.id = merged_id) then
    raise notice 'Employee record % is not in this database. Nothing was changed.', merged_id;
    return;
  end if;

  select d.email, d.profile_id, d.deleted_at
    into v_merged_email, v_merged_profile, v_deleted_at
    from public.developers d
   where d.id = merged_id;

  if not exists (select 1 from public.developers d where d.id = keeper_id) then
    raise exception 'Employee record % is missing, so there is nothing to merge into.', keeper_id;
  end if;

  select d.email, d.profile_id
    into v_keeper_email, v_keeper_profile
    from public.developers d
   where d.id = keeper_id;

  if lower(btrim(coalesce(v_keeper_email, ''))) <> keeper_email
     or lower(btrim(coalesce(v_merged_email, ''))) <> merged_email
  then
    raise exception
      'Those ids do not hold the expected addresses (% and %). Refusing to merge two records this was not written for.',
      keeper_email, merged_email;
  end if;

  -- -------------------------------------------------------------------------
  -- The memberships
  -- -------------------------------------------------------------------------
  -- A difference rather than a move, because both records may already be on the
  -- same project or under the same mentor, and both pairs are unique.

  insert into public.project_developers (project_id, developer_id)
  select pd.project_id, keeper_id
    from public.project_developers pd
   where pd.developer_id = merged_id
      on conflict (project_id, developer_id) do nothing;

  delete from public.project_developers where developer_id = merged_id;
  get diagnostics v_moved = row_count;
  raise notice 'Project memberships merged: %', v_moved;

  insert into public.mentor_assignments (mentor_id, developer_id, active)
  select ma.mentor_id, keeper_id, ma.active
    from public.mentor_assignments ma
   where ma.developer_id = merged_id
      on conflict (mentor_id, developer_id) do nothing;

  delete from public.mentor_assignments where developer_id = merged_id;
  get diagnostics v_moved = row_count;
  raise notice 'Mentor assignments merged: %', v_moved;

  -- -------------------------------------------------------------------------
  -- The work
  -- -------------------------------------------------------------------------
  -- Tasks first. `guard_daily_update_task` and `guard_feedback_task` both
  -- refuse a row whose `developer_id` changes to somebody who does not own the
  -- task it names, so an entry cannot cross to the surviving record before the
  -- task it points at has.
  --
  -- Soft-deleted rows move too. They are restorable from the Recently deleted
  -- screen, and would come back owned by a record that no longer exists.

  update public.tasks set developer_id = keeper_id where developer_id = merged_id;
  get diagnostics v_moved = row_count;
  raise notice 'Tasks moved: %', v_moved;

  update public.daily_updates set developer_id = keeper_id where developer_id = merged_id;
  get diagnostics v_moved = row_count;
  raise notice 'Work entries moved: %', v_moved;

  update public.feedback set developer_id = keeper_id where developer_id = merged_id;
  get diagnostics v_moved = row_count;
  raise notice 'Feedback moved: %', v_moved;

  -- The subject is what `record_history_select` reads to decide who may see an
  -- entry, so the history of moved work has to move with it or it becomes
  -- unreadable to the person it is about.
  update public.record_history
     set subject_developer_id = keeper_id
   where subject_developer_id = merged_id
     and table_name in ('daily_updates', 'feedback', 'tasks');

  -- -------------------------------------------------------------------------
  -- The login
  -- -------------------------------------------------------------------------

  select p.id into v_login_profile
    from public.profiles p
   where lower(p.email) = lower(login_email);

  if v_login_profile is null then
    raise notice 'No login is registered as %, so the employee record keeps the login it had.', login_email;
  elsif v_keeper_profile is not distinct from v_login_profile then
    raise notice 'The surviving employee record already signs in as %.', login_email;
  else
    -- Unique, so it is released before it is taken. Both statements are in this
    -- transaction, and nothing in between reads the column.
    update public.developers set profile_id = null where profile_id = v_login_profile;
    update public.developers set profile_id = v_login_profile where id = keeper_id;

    raise notice
      'The surviving employee record now signs in as %. The other login is left in place with no employee record attached.',
      login_email;
  end if;

  update public.developers set profile_id = null
   where id = merged_id and profile_id is not null;

  -- -------------------------------------------------------------------------
  -- The duplicate
  -- -------------------------------------------------------------------------
  -- `guard_roster_deletion` refuses this while live work still points at the
  -- row, so it doubles as the check that everything above actually moved.
  -- `stamp_deletion` fills in the timestamp.

  if v_deleted_at is null then
    update public.developers set deleted_at = now() where id = merged_id;
    raise notice 'Employee record % (%) is now in Recently deleted.', merged_id, merged_email;
  else
    raise notice 'Employee record % was already deleted.', merged_id;
  end if;
end;
$$;
