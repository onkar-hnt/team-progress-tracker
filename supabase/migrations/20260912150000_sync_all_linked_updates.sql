-- ---------------------------------------------------------------------------
-- One status per task, on every update that names it
-- ---------------------------------------------------------------------------
-- `20260911210000_daily_update_task_link.sql` synchronised only the newest
-- daily update logged against a task, to keep older days as an honest record
-- of what was reported at the time.
--
-- In practice that preserved the very problem it was meant to solve. A task
-- worked on across several days has several updates, each carrying its own
-- status, and only one of them moves with the task. The dashboard then lists
-- the same piece of work twice at two different statuses, and there is no way
-- to tell which of the two is the one that counts.
--
-- So the per-day status is given up. A status now belongs to the work, not to
-- the day it was written about, and every update naming a task reports that
-- task's status. Progress stays per-day, which is where the daily detail
-- actually lives.
--
-- The loop guard is unchanged and still the thing that makes this terminate:
-- each side writes only rows whose status actually differs, so the answering
-- trigger finds nothing left to change.

create or replace function public.sync_task_from_daily_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.task_id is null then
    return null;
  end if;

  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and new.task_id is not distinct from old.task_id
  then
    return null;
  end if;

  update public.tasks
     set status = new.status
   where id = new.task_id
     and status is distinct from new.status;

  return null;
end;
$$;

comment on function public.sync_task_from_daily_update is
  'Carries the status of a daily update onto the task it names.';

create or replace function public.sync_daily_update_from_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  implied_progress integer;
begin
  if new.status is not distinct from old.status then
    return null;
  end if;

  implied_progress := public.progress_for_status(new.status);

  -- Every update naming the task, not just the newest, so two days of work on
  -- one task cannot show two different statuses.
  --
  -- Progress travels with the status so an entry never reads "Completed · 60%".
  -- Left as it was for in-progress and blocked, where the number the developer
  -- chose is the meaningful one.
  update public.daily_updates
     set status = new.status,
         progress = coalesce(implied_progress, progress),
         is_blocked = (new.status = 'blocked')
   where task_id = new.id
     and status is distinct from new.status;

  return null;
end;
$$;

comment on function public.sync_daily_update_from_task is
  'Carries a task status onto every daily update logged against it.';

-- Nothing needs to know which update is newest any more.
drop function if exists public.latest_update_for_task(uuid);

-- ---------------------------------------------------------------------------
-- Bring existing rows into line
-- ---------------------------------------------------------------------------
-- Updates linked while only the newest one synchronised may already disagree
-- with their task. The task is the side to trust: it is what My Tasks shows
-- and what a mentor set.

update public.daily_updates d
   set status = t.status,
       progress = coalesce(public.progress_for_status(t.status), d.progress),
       is_blocked = (t.status = 'blocked')
  from public.tasks t
 where d.task_id = t.id
   and d.status is distinct from t.status;
