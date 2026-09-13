-- ---------------------------------------------------------------------------
-- Work blocked: only when somebody blocked it
-- ---------------------------------------------------------------------------
-- `notify_work_blocked` reads a false-to-true move on `daily_updates.is_blocked`
-- as "a developer raised a blocker", which was true when it was written and
-- stopped being true one migration earlier than it.
--
-- `20260912150000_sync_all_linked_updates.sql` widened
-- `sync_daily_update_from_task` from the newest entry to every entry naming the
-- task, and that statement sets `is_blocked` alongside the status. So a task
-- moving into `blocked` — whether a mentor set it directly, or a developer's own
-- submission carried it there through `sync_task_from_daily_update` — flips the
-- flag on every historic entry for that task at once, and the trigger fires
-- once per row.
--
-- One action then reaches each active mentor as one notification per day the
-- task was ever worked on, each dated to a day on which nobody flagged
-- anything. The self-action check in `enqueue_notification` hides the pile from
-- whoever caused it and from nobody else, so a co-mentor receives all of it,
-- worded as though the developer had done it.
--
-- The fix is to notify for a blocker raised on the entry itself and not for one
-- arriving as a consequence of a task status the recipient has already been told
-- about — the rule the file's own header states, applied to a cascade that did
-- not exist when it was written.
--
-- `pg_trigger_depth()` is 1 inside a trigger fired by a statement from the
-- client and 2 or more inside one fired from within another trigger. Function
-- calls do not count, so a mentor going through `set_task_status` still reaches
-- `tasks_sync_daily_update` at depth 1 and this at depth 2. Qualified because
-- the empty `search_path` these functions run under leaves nothing implicit
-- except `pg_catalog`, and saying so is cheaper than remembering it.
--
-- Nothing legitimate is lost: `sync_daily_update_from_task` is the only trigger
-- that writes `daily_updates`, so a blocker a person actually raised — on a new
-- entry or by editing an existing one — always arrives here at depth 1.
--
-- The body is otherwise the one from `20260913120000_notifications.sql`, and the
-- trigger is left alone: `daily_updates_notify_blocked` already points at this
-- name, and replacing a function it references does not need it rebuilt.

create or replace function public.notify_work_blocked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_developer_name text;
  v_message text;
  v_mentor_profile_id uuid;
begin
  if not new.is_blocked or old.is_blocked then
    return new;
  end if;

  if pg_catalog.pg_trigger_depth() > 1 then
    return new;
  end if;

  select name into v_developer_name
  from public.developers
  where id = new.developer_id;

  v_message := coalesce(v_developer_name, 'A developer')
    || ' flagged a blocker on '
    || to_char(new.entry_date, 'FMDD Mon YYYY')
    || '.';

  if new.blocker_description is not null then
    v_message := v_message || ' ' || new.blocker_description;
  end if;

  for v_mentor_profile_id in
    select m.profile_id
    from public.mentor_assignments ma
    join public.mentors m on m.id = ma.mentor_id
    where ma.developer_id = new.developer_id
      and ma.active
  loop
    perform public.enqueue_notification(
      v_mentor_profile_id,
      'work_blocked',
      'Work blocked',
      v_message,
      'daily_update',
      new.id
    );
  end loop;

  return new;
end;
$$;

comment on function public.notify_work_blocked is
  'Tells a developer''s mentors about a blocker raised on a daily update. Silent when the flag was set by sync_daily_update_from_task, which writes it onto every entry linked to a task whose status moved.';
