-- ---------------------------------------------------------------------------
-- Attaching an old update to a task must not reopen the task
-- ---------------------------------------------------------------------------
-- `20260911210000_daily_update_task_link.sql` made the newest daily update
-- and its task agree, and pushes in whichever direction was written. That is
-- right for every write except one: the moment an update that never had a
-- task is attached to one.
--
-- Such an update is history. It was logged as "in progress" weeks ago, and
-- the task has moved on since — very possibly to completed. Attaching it
-- announces nothing about the status of the work, so pushing its stale value
-- onto the task would reopen finished work simply because somebody tidied up
-- an old record. The task holds the current answer, so the update adopts it
-- rather than the other way round.
--
-- The exception to the exception: if the same write also sets a status, that
-- is the developer saying something new, and it is taken at face value and
-- pushed to the task by `daily_updates_sync_task` as before.
--
-- This replaces `guard_daily_update_task`. The name no longer fits, because
-- the function now both rejects an incoherent link and settles the status of
-- a new one, and those are the same decision made from the same task row.

create or replace function public.apply_daily_update_task_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  task_row public.tasks;
  implied_progress integer;
begin
  if new.task_id is null then
    return new;
  end if;

  -- Nothing about the link is changing, so there is nothing to check and
  -- nothing to adopt. A developer editing the notes on an old entry must not
  -- have its link re-validated against an assignment that has since ended.
  if tg_op = 'UPDATE'
     and new.task_id is not distinct from old.task_id
     and new.developer_id is not distinct from old.developer_id
  then
    return new;
  end if;

  select * into task_row
    from public.tasks
   where id = new.task_id;

  -- Two foreign keys cannot express this: each of `developer_id` and
  -- `task_id` is individually valid while naming different people, which
  -- would file a day's work against somebody else's task and then, through
  -- the sync triggers, let one developer move another's task.
  if not found or task_row.developer_id is distinct from new.developer_id then
    raise exception 'A daily update must name a task assigned to the same developer.'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE'
     and old.task_id is null
     and new.status is not distinct from old.status
  then
    implied_progress := public.progress_for_status(task_row.status);

    new.status := task_row.status;
    new.progress := coalesce(implied_progress, new.progress);
    new.is_blocked := (task_row.status = 'blocked');
  end if;

  return new;
end;
$$;

comment on function public.apply_daily_update_task_link is
  'Rejects a daily update naming another developer''s task, and takes the task''s status when an unlinked update is first attached to one.';

drop trigger if exists daily_updates_guard_task on public.daily_updates;

create trigger daily_updates_guard_task
  before insert or update on public.daily_updates
  for each row execute function public.apply_daily_update_task_link();

drop function if exists public.guard_daily_update_task();
