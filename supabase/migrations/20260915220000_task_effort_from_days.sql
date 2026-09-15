-- ---------------------------------------------------------------------------
-- Time taken is counted in days logged, not in hours typed
-- ---------------------------------------------------------------------------
-- `20260915210000` totalled `daily_updates.hours_spent`, which no screen has
-- ever filled in: the column has been null on every row since the schema was
-- written, so the total it produced was always zero and the estimate had
-- nothing to be judged against.
--
-- What the daily updates do evidence is *which days* a task was worked on. So
-- the days are counted, and the hours are that count at a standard working
-- day. The developer types an estimate and nothing else; the cost is the
-- assumption below, which is why it is a named function rather than an 8
-- buried in an expression.
--
-- `worked_days` is kept as its own column rather than derived back out of the
-- hours, because it is the fact that was actually observed and the screens say
-- it out loud: "3 days logged" is checkable by the person reading it in a way
-- that "24 hours" is not.

create or replace function public.standard_working_hours()
returns numeric
language sql
immutable
set search_path = ''
as $$
  select 8::numeric;
$$;

comment on function public.standard_working_hours is
  'Hours in one working day, used to turn days logged against a task into an effort figure comparable with an estimate.';

alter table public.tasks
  add column if not exists worked_days integer not null default 0;

comment on column public.tasks.worked_days is
  'Derived count of distinct days carrying a daily update for this task. Maintained by sync_task_effort.';

comment on column public.tasks.actual_hours is
  'Derived: worked_days at standard_working_hours(). Maintained by sync_task_effort; a client write is overwritten.';

-- Neither total is a change a person made, so neither belongs in the log.
create or replace function public.history_ignores(p_column text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_column in (
    'id',
    'created_at',
    'updated_at',
    'code',
    'deleted_at',
    'deleted_by',
    'actual_hours',
    'worked_days'
  );
$$;

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

  -- Recounted from the entries rather than adjusted, so a correction, a soft
  -- delete, a restore and a day moved to another task all land on the answer
  -- counting from scratch would give. Two updates on one date are one day.
  foreach v_task_id in array v_task_ids loop
    select count(distinct entry.entry_date) into v_days
      from public.daily_updates entry
     where entry.task_id = v_task_id
       and entry.deleted_at is null;

    update public.tasks
       set worked_days = v_days,
           actual_hours = v_days * public.standard_working_hours()
     where id = v_task_id
       and (worked_days is distinct from v_days
            or actual_hours is distinct from v_days * public.standard_working_hours());
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

-- ---------------------------------------------------------------------------
-- Recounted for work already logged
-- ---------------------------------------------------------------------------
-- Tasks with no entries are set back to zero as well, which the previous
-- backfill could not get wrong but this one could: a task whose only entry has
-- since been deleted must not keep the hours that entry gave it.

update public.tasks task
   set worked_days = coalesce(totals.days, 0),
       actual_hours = coalesce(totals.days, 0) * public.standard_working_hours()
  from (
    select id as task_id,
           (
             select count(distinct entry.entry_date)
               from public.daily_updates entry
              where entry.task_id = tasks.id
                and entry.deleted_at is null
           ) as days
      from public.tasks
     where deleted_at is null
  ) totals
 where task.id = totals.task_id
   and (task.worked_days is distinct from coalesce(totals.days, 0)
        or task.actual_hours is distinct from coalesce(totals.days, 0) * public.standard_working_hours());
