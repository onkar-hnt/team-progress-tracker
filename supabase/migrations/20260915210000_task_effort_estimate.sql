-- ---------------------------------------------------------------------------
-- Estimated effort, and the total actually spent
-- ---------------------------------------------------------------------------
-- `daily_updates.hours_spent` already records what a day of work cost, but
-- nothing said what the work was expected to cost, so the hours added up to a
-- total that could not be judged. A developer logging a day now also says how
-- long they expect the whole task to take, and the database keeps the running
-- total beside that expectation.
--
-- The estimate lives on the task, because it is a property of the work rather
-- than of one day of it, and is *collected* on the entry so that it can be
-- revised: the newest answer wins, which is the same rule the status already
-- follows. Keeping the answers on the entries also leaves the revisions
-- visible instead of overwriting the first guess silently.

alter table public.tasks
  add column if not exists estimated_hours numeric(6, 2)
    check (estimated_hours is null or estimated_hours >= 0);

comment on column public.tasks.estimated_hours is
  'Hours the whole task is expected to take. Null until somebody estimates it.';

-- Derived, and stored rather than computed per read: every task list would
-- otherwise carry a correlated sum over `daily_updates`, and the figure is
-- wanted on screens that show many tasks at once.
alter table public.tasks
  add column if not exists actual_hours numeric(7, 2) not null default 0;

comment on column public.tasks.actual_hours is
  'Derived total of hours_spent across this task''s daily updates. Maintained by sync_task_effort; a client write is overwritten.';

alter table public.daily_updates
  add column if not exists estimated_hours numeric(6, 2)
    check (estimated_hours is null or estimated_hours >= 0);

comment on column public.daily_updates.estimated_hours is
  'Hours the developer expects the whole task to take, as judged on this day. The newest answer becomes the task estimate.';

-- ---------------------------------------------------------------------------
-- The total is not a change anybody made
-- ---------------------------------------------------------------------------
-- Every daily update would otherwise put a second line in the change log
-- saying a number nobody typed had moved, beside the line about the update
-- itself. The estimate is left in: revising it is a decision.

create or replace function public.history_ignores(p_column text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_column in (
    'id', 'created_at', 'updated_at', 'code', 'deleted_at', 'deleted_by', 'actual_hours'
  );
$$;

-- ---------------------------------------------------------------------------
-- Both figures follow the daily updates
-- ---------------------------------------------------------------------------
-- Recomputed from the entries rather than adjusted by the difference, so a
-- correction, a soft delete, a restore and a day moved to another task all
-- arrive at the same answer as counting from scratch would.
--
-- `old` and `new` are named only inside the branch that has them: on an insert
-- `old` is unassigned, and referring to it raises rather than reading as null.

create or replace function public.sync_task_effort()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task_ids uuid[] := '{}';
  v_task_id uuid;
  v_total numeric(7, 2);
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
    select coalesce(sum(entry.hours_spent), 0) into v_total
      from public.daily_updates entry
     where entry.task_id = v_task_id
       and entry.deleted_at is null;

    update public.tasks
       set actual_hours = v_total
     where id = v_task_id
       and actual_hours is distinct from v_total;
  end loop;

  -- An entry that offers no estimate leaves the task's alone: saying nothing
  -- about how long the work will take is not the same as withdrawing the
  -- figure given yesterday.
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

comment on function public.sync_task_effort is
  'Keeps tasks.actual_hours equal to the hours logged against the task, and carries the newest estimate from a daily update onto it.';

revoke all on function public.sync_task_effort() from public, anon, authenticated;

drop trigger if exists daily_updates_sync_effort on public.daily_updates;

create trigger daily_updates_sync_effort
  after insert or update or delete on public.daily_updates
  for each row execute function public.sync_task_effort();

-- ---------------------------------------------------------------------------
-- A task created from an entry carries that entry's estimate
-- ---------------------------------------------------------------------------
-- Replaced whole for the one added column. Without it the estimate would still
-- arrive, through the trigger above a moment later, but as an amendment to a
-- task that had just been created without one — which the change log would
-- report as somebody revising an estimate they had in fact just given.

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
    select assignment.mentor_id into v_mentor_id
      from public.mentor_assignments assignment
     where assignment.developer_id = new.developer_id
       and assignment.active
     order by assignment.assigned_date desc nulls last, assignment.created_at
     limit 1;

    insert into public.tasks (
      name, project_id, developer_id, mentor_id, status, created_date, estimated_hours
    )
    values (
      v_title,
      new.project_id,
      new.developer_id,
      v_mentor_id,
      new.status,
      new.entry_date,
      new.estimated_hours
    )
    returning id into v_task_id;
  end if;

  new.task_id := v_task_id;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Totals for the work already logged
-- ---------------------------------------------------------------------------
-- One statement, and silent in the change log because `actual_hours` is now
-- ignored there. Tasks with no linked entries keep the column default of zero,
-- which is what counting their entries would give.

update public.tasks task
   set actual_hours = totals.total
  from (
    select entry.task_id, coalesce(sum(entry.hours_spent), 0) as total
      from public.daily_updates entry
     where entry.task_id is not null
       and entry.deleted_at is null
     group by entry.task_id
  ) totals
 where task.id = totals.task_id
   and task.actual_hours is distinct from totals.total;
