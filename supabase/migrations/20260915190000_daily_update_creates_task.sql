-- ---------------------------------------------------------------------------
-- Work a developer logs is a task, whoever named it
-- ---------------------------------------------------------------------------
-- A daily update already names its work in `task_title` and may point at a
-- task through `task_id`, but only an administrator or a mentor could create
-- the task to point at. Work a developer started themselves therefore existed
-- as free text on a day's entry and nowhere else: absent from My Tasks, absent
-- from the feedback task list, and with nothing for a mentor to comment on.
--
-- So the update now creates the task it names. Nothing about the form changes,
-- and no second screen is added for developers: one piece of work is one task,
-- and logging a day of it is what brings it into being.
--
-- Matched on title before a new one is created, because the same work is
-- logged on many days and each day must join the task rather than start
-- another. The match is per developer and per project, so the same title under
-- a different project is different work, and case and surrounding spaces are
-- ignored so "AVD setup" does not become a second "AVD Setup".
--
-- INSERT only, deliberately. Re-titling last Tuesday's entry states what was
-- worked on that day, not that the task has been renamed, and a task that
-- quietly renamed itself from an old entry would be worse than one that did
-- not.

create or replace function public.ensure_daily_update_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_task_id uuid;
  v_mentor_id uuid;
begin
  if new.task_id is not null then
    return new;
  end if;

  v_title := btrim(new.task_title);

  if v_title = '' then
    return new;
  end if;

  select task.id into v_task_id
    from public.tasks task
   where task.developer_id = new.developer_id
     and task.project_id = new.project_id
     and lower(btrim(task.name)) = lower(v_title)
     and task.deleted_at is null
   order by task.created_at desc
   limit 1;

  if v_task_id is null then
    -- The mentor responsible for this developer, so their own task list and
    -- the Mentor column show the work rather than leaving it unattributed.
    -- Sight of it does not depend on this: a mentor reads a task through the
    -- assignment, which is what `can_view_developer` tests.
    select assignment.mentor_id into v_mentor_id
      from public.mentor_assignments assignment
     where assignment.developer_id = new.developer_id
       and assignment.active
     order by assignment.assigned_date desc nulls last, assignment.created_at
     limit 1;

    insert into public.tasks (
      name, project_id, developer_id, mentor_id, status, created_date
    )
    values (
      v_title, new.project_id, new.developer_id, v_mentor_id, new.status, new.entry_date
    )
    returning id into v_task_id;
  end if;

  new.task_id := v_task_id;

  return new;
end;
$$;

-- SECURITY DEFINER, and it grants nothing new. `tasks_insert` already admits
-- `can_view_developer(developer_id)`, which is true of a developer's own id,
-- so the row written here is one the caller could have written directly. What
-- the definer context avoids is a read of `tasks` under the caller's policies
-- failing to find a task they may not see and then creating a duplicate.
comment on function public.ensure_daily_update_task is
  'Points a daily update at the task it names, creating that task when no matching one exists. Insert only.';

revoke all on function public.ensure_daily_update_task() from public, anon, authenticated;

-- Fires before `daily_updates_guard_task`, which the trigger names order
-- alphabetically, so the link this sets is validated by the same check as a
-- link the client sent.
drop trigger if exists daily_updates_ensure_task on public.daily_updates;

create trigger daily_updates_ensure_task
  before insert on public.daily_updates
  for each row execute function public.ensure_daily_update_task();

-- ---------------------------------------------------------------------------
-- Work already logged this way gets its task
-- ---------------------------------------------------------------------------
-- Without this the rule would only hold for updates logged from now on, and
-- the entries a developer has already written are the ones a mentor is asking
-- to comment on today.
--
-- Grouped by title so the several days of one piece of work converge on one
-- task, dated from the first of those days and carrying the status of the most
-- recent, which is the same reconciliation `sync_task_from_daily_update`
-- performs for a live write.
--
-- Assignment notifications are off for the duration. Backfilled tasks are not
-- new work being handed to anybody, and "New task assigned" for something the
-- developer wrote themselves last week would be a lie the badge counts.

alter table public.tasks disable trigger tasks_notify_assignment;

do $$
declare
  v_group record;
  v_task_id uuid;
  v_mentor_id uuid;
begin
  for v_group in
    select entry.developer_id,
           entry.project_id,
           lower(btrim(entry.task_title)) as title_key,
           min(entry.entry_date) as first_date
      from public.daily_updates entry
     where entry.task_id is null
       and entry.deleted_at is null
       and btrim(entry.task_title) <> ''
     group by entry.developer_id, entry.project_id, lower(btrim(entry.task_title))
  loop
    select task.id into v_task_id
      from public.tasks task
     where task.developer_id = v_group.developer_id
       and task.project_id = v_group.project_id
       and lower(btrim(task.name)) = v_group.title_key
       and task.deleted_at is null
     order by task.created_at desc
     limit 1;

    if v_task_id is null then
      select assignment.mentor_id into v_mentor_id
        from public.mentor_assignments assignment
       where assignment.developer_id = v_group.developer_id
         and assignment.active
       order by assignment.assigned_date desc nulls last, assignment.created_at
       limit 1;

      insert into public.tasks (
        name, project_id, developer_id, mentor_id, status, created_date
      )
      select btrim(entry.task_title),
             v_group.project_id,
             v_group.developer_id,
             v_mentor_id,
             entry.status,
             v_group.first_date
        from public.daily_updates entry
       where entry.developer_id = v_group.developer_id
         and entry.project_id = v_group.project_id
         and lower(btrim(entry.task_title)) = v_group.title_key
         and entry.task_id is null
         and entry.deleted_at is null
       order by entry.entry_date desc, entry.created_at desc
       limit 1
      returning id into v_task_id;
    end if;

    update public.daily_updates entry
       set task_id = v_task_id
     where entry.developer_id = v_group.developer_id
       and entry.project_id = v_group.project_id
       and lower(btrim(entry.task_title)) = v_group.title_key
       and entry.task_id is null
       and entry.deleted_at is null;
  end loop;
end;
$$;

alter table public.tasks enable trigger tasks_notify_assignment;
