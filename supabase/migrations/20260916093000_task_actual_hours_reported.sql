-- ---------------------------------------------------------------------------
-- The hours a developer reports, where they report them
-- ---------------------------------------------------------------------------
-- `20260915220000` counted the days a task was worked on and multiplied by a
-- standard working day, because nothing recorded hours. That gives a figure
-- comparable with an estimate, but never an exact one: a task touched for
-- twenty minutes on each of three days read as twenty-four hours.
--
-- `daily_updates.hours_spent` has existed since the first schema and has never
-- been filled in. The daily update form now asks for it, so the total can be
-- what was actually reported.
--
-- One rule, applied per day rather than per entry: the hours reported that day
-- if any were, and a standard working day where none were. Per day because a
-- developer may log two entries for one task on one date, and charging a
-- standard day to each would count that date twice. The fallback is what keeps
-- history readable — tasks worked before this migration have no hours on any
-- entry, and dropping them to zero would say the work was free.

create or replace function public.task_reported_hours(target_task_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(per_day.hours), 0)
    from (
      select case
               when count(entry.hours_spent) = 0 then public.standard_working_hours()
               else sum(entry.hours_spent)
             end as hours
        from public.daily_updates entry
       where entry.task_id = target_task_id
         and entry.deleted_at is null
       group by entry.entry_date
    ) per_day;
$$;

comment on function public.task_reported_hours is
  'Hours a task has cost: the hours reported on each day it was worked, and a standard working day for a day where none were reported.';

-- Trigger-only, and it reads past row-level security, so it must not be a
-- PostgREST endpoint answering "how long has this task taken" for a task the
-- caller cannot see.
revoke all on function public.task_reported_hours(uuid) from public, anon, authenticated;

create or replace function public.sync_task_effort()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task_ids uuid[] := '{}';
  v_task_id uuid;
  v_days integer;
  v_hours numeric(7, 2);
begin
  if tg_op <> 'INSERT' and old.task_id is not null then
    v_task_ids := array_append(v_task_ids, old.task_id);
  end if;

  if tg_op <> 'DELETE'
     and new.task_id is not null
     and not (new.task_id = any (v_task_ids))
  then
    v_task_ids := array_append(v_task_ids, new.task_id);
  end if;

  foreach v_task_id in array v_task_ids loop
    select count(distinct entry.entry_date) into v_days
      from public.daily_updates entry
     where entry.task_id = v_task_id
       and entry.deleted_at is null;

    v_hours := public.task_reported_hours(v_task_id);

    update public.tasks
       set worked_days = v_days,
           actual_hours = v_hours
     where id = v_task_id
       and (worked_days is distinct from v_days or actual_hours is distinct from v_hours);
  end loop;

  if tg_op <> 'DELETE'
     and new.task_id is not null
     and new.estimated_hours is not null
  then
    update public.tasks
       set estimated_hours = new.estimated_hours
     where id = new.task_id
       and estimated_hours is distinct from new.estimated_hours;
  end if;

  return null;
end;
$$;

comment on column public.tasks.actual_hours is
  'Derived hours the task has cost, from task_reported_hours. Maintained by sync_task_effort; a client write is overwritten.';

-- Recomputed under the new rule. Unchanged for every task as things stand,
-- since no entry carries hours yet, and correct from the first one that does.
update public.tasks task
   set actual_hours = public.task_reported_hours(task.id)
 where task.deleted_at is null
   and task.actual_hours is distinct from public.task_reported_hours(task.id);
