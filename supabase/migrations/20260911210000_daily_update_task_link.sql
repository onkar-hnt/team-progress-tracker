-- ---------------------------------------------------------------------------
-- A daily update names the task it is about
-- ---------------------------------------------------------------------------
-- Until now `task_title` was free text, so "AVD setup" (the assigned task)
-- and "Setting up the AVD" (the day's log of that same work) were two
-- unrelated rows carrying two independent statuses. Completing one left the
-- other alone, and My Tasks and the dashboard disagreed about the same work
-- with no way to reconcile them.
--
-- Nullable on purpose. Updates logged before the link existed keep reading,
-- and a developer with nothing assigned can still log a day rather than being
-- locked out of the one screen they use daily. The form requires a task
-- whenever there is one to pick.
--
-- `on delete set null` rather than cascade: a deleted task must not take the
-- record of days already worked with it.

alter table public.daily_updates
  add column if not exists task_id uuid references public.tasks (id) on delete set null;

comment on column public.daily_updates.task_id is
  'The assigned task this day of work belongs to. Null for updates logged before the link existed, and for work with no task.';

-- Read per task by the sync triggers below, and sparse while older rows carry
-- null, so the index skips them.
create index if not exists daily_updates_task_id_idx
  on public.daily_updates (task_id) where task_id is not null;

-- ---------------------------------------------------------------------------
-- The task must belong to the developer the update is about
-- ---------------------------------------------------------------------------
-- Two foreign keys cannot express this: each of `developer_id` and `task_id`
-- is individually valid while naming different people, which would file a
-- day's work against somebody else's task and then, through the sync below,
-- let one developer move another's task.
--
-- Integrity rather than authorisation, and the two compose. Who may write the
-- row is already settled by `daily_updates_insert` and `daily_updates_update`,
-- which require the row to be the caller's own or the caller to be an admin.
-- SECURITY DEFINER is right here for the same reason as on feedback: reading
-- `tasks` under the caller's own policies would refuse a legitimate write
-- whenever the caller could not see the task, and would add nothing, because
-- a caller who may not write the update was already refused.
--
-- Only checked when one of the two columns is actually written, so correcting
-- the notes on an old entry does not re-validate a link it is not touching.

create or replace function public.guard_daily_update_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.task_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.task_id is not distinct from old.task_id
     and new.developer_id is not distinct from old.developer_id
  then
    return new;
  end if;

  if not exists (
    select 1
      from public.tasks t
     where t.id = new.task_id
       and t.developer_id = new.developer_id
  ) then
    raise exception 'A daily update must name a task assigned to the same developer.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.guard_daily_update_task is
  'Keeps daily_updates.task_id pointing at a task belonging to daily_updates.developer_id.';

drop trigger if exists daily_updates_guard_task on public.daily_updates;

create trigger daily_updates_guard_task
  before insert or update on public.daily_updates
  for each row execute function public.guard_daily_update_task();

-- ---------------------------------------------------------------------------
-- One status for one piece of work
-- ---------------------------------------------------------------------------
-- Linking the two rows is not on its own enough: they would still hold two
-- statuses, and the screens would still disagree. These two triggers make the
-- task and its newest daily update agree no matter which side was written —
-- including a write that arrives directly through PostgREST rather than
-- through the app.
--
-- Only the newest entry is synchronised. An older day is history: correcting
-- last Monday's note must not drag a task that has since moved on back to
-- where it was, and completing a task today must not rewrite what was
-- honestly reported as in progress last week.
--
-- Both directions are SECURITY DEFINER, and neither grants anything new.
-- A caller who reaches the daily update is its owner or an admin, and
-- `set_task_status` already lets an assignee set the status of their own
-- task — which the guard above proves this is. A caller who reaches the task
-- passed `tasks_update` or `set_task_status`, so they were already entitled to
-- decide the status of this work; writing it onto the developer's latest log
-- of that same work states the same fact once rather than twice.
--
-- The pair cannot loop. Each side writes only when the value actually differs,
-- so the answering trigger finds the two already equal and writes nothing.

create or replace function public.progress_for_status(target_status text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case target_status
           when 'completed' then 100
           when 'not-started' then 0
           else null
         end;
$$;

comment on function public.progress_for_status is
  'Progress implied by a status, or null where any value is legitimate. Mirrors progressForStatus in src/utils/task.utils.ts.';

create or replace function public.latest_update_for_task(target_task_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id
    from public.daily_updates
   where task_id = target_task_id
   order by entry_date desc, created_at desc
   limit 1;
$$;

comment on function public.latest_update_for_task is
  'The most recent daily update logged against a task, which is the one that speaks for it now.';

-- Both are only ever called from the trigger functions below, which run as
-- the owner and so do not need a grant. Left executable by PUBLIC they would
-- be reachable as PostgREST endpoints, and `latest_update_for_task` reads
-- past row-level security, so it would answer "has this task been worked on"
-- for a task the caller cannot see.
revoke all on function public.progress_for_status(text) from public, anon, authenticated;
revoke all on function public.latest_update_for_task(uuid) from public, anon, authenticated;

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

  if new.id is distinct from public.latest_update_for_task(new.task_id) then
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
  'Carries the status of the newest daily update onto the task it names.';

-- AFTER, because `latest_update_for_task` has to be able to see the row that
-- is being written.
drop trigger if exists daily_updates_sync_task on public.daily_updates;

create trigger daily_updates_sync_task
  after insert or update on public.daily_updates
  for each row execute function public.sync_task_from_daily_update();

create or replace function public.sync_daily_update_from_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  latest_id uuid;
  implied_progress integer;
begin
  if new.status is not distinct from old.status then
    return null;
  end if;

  latest_id := public.latest_update_for_task(new.id);

  if latest_id is null then
    return null;
  end if;

  implied_progress := public.progress_for_status(new.status);

  -- Progress travels with the status so the entry never reads
  -- "Completed · 60%". Left as it was for in-progress and blocked, where the
  -- number the developer chose is the meaningful one.
  update public.daily_updates
     set status = new.status,
         progress = coalesce(implied_progress, progress),
         is_blocked = (new.status = 'blocked')
   where id = latest_id
     and status is distinct from new.status;

  return null;
end;
$$;

comment on function public.sync_daily_update_from_task is
  'Carries a task status onto the newest daily update logged against it.';

drop trigger if exists tasks_sync_daily_update on public.tasks;

create trigger tasks_sync_daily_update
  after update of status on public.tasks
  for each row execute function public.sync_daily_update_from_task();

-- No policy changes. `daily_updates_select`, `daily_updates_insert`,
-- `daily_updates_update` and `daily_updates_delete` decide access from
-- `developer_id`, and a new column does not change who may see or write a row.
