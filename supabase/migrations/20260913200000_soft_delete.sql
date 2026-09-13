-- ---------------------------------------------------------------------------
-- Deleting a record puts it aside instead of destroying it
-- ---------------------------------------------------------------------------
-- Three tables hold work that a person wrote and that nothing else in the
-- database depends on: `daily_updates`, `tasks` and `feedback`. Every other
-- table is either configuration — developers, mentors, projects — or a mapping,
-- and those are already protected by `RESTRICT` foreign keys: a person with any
-- history cannot be deleted at all, only deactivated. These three could be, and
-- were, permanently, on one click and one confirmation.
--
-- That is the wrong default for a record of somebody's working day. A mis-aimed
-- Delete on the wrong row of a table sorted differently from the last time it
-- was looked at is an ordinary mistake, and the loss was total: no copy, no
-- undo, and — since the row was gone — no way to even establish what had been
-- there.
--
-- So a delete now sets `deleted_at`. The row stops appearing anywhere, which is
-- the whole of what the person asked for, and can be put back. Destroying it for
-- good remains available, as a second, separate act on a screen that exists for
-- that purpose.
--
-- ## Why this needs no new authorization
--
-- A soft delete is an UPDATE, and for all three tables the UPDATE policy admits
-- exactly the people the DELETE policy admits:
--
--   * `daily_updates`: an administrator, or the developer whose row it is.
--   * `tasks`:         an administrator, or a mentor of that developer.
--                      A developer has no direct UPDATE on this table at all —
--                      they change status through `set_task_status` — which
--                      matches their having no DELETE either.
--   * `feedback`:      an administrator, or the mentor who wrote it.
--
-- The same is therefore true of restoring, which is the same UPDATE in reverse.
-- Nothing here adds a `security definer` writer, no new predicate is invented,
-- and there is no second definition of "who may remove this" to drift from the
-- policies. That symmetry is the reason the feature is this small, and it was
-- checked against all six policies before this was written rather than assumed.
--
-- ## What still reads the rows
--
-- Only the three list functions filter them out, plus the by-id reads in the
-- repositories. Joins are deliberately left alone: a daily update naming a
-- deleted task still resolves that task's title, because a report of last month
-- must not develop gaps because somebody tidied up afterwards.

-- ---------------------------------------------------------------------------
-- The columns
-- ---------------------------------------------------------------------------
-- `deleted_by` is stamped by the trigger below rather than sent from the
-- browser, so it records who actually did it instead of who claimed to.

alter table public.daily_updates
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

alter table public.tasks
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

alter table public.feedback
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

comment on column public.daily_updates.deleted_at is
  'When this entry was deleted. Non-null rows appear only on the Recently deleted screen, and are restored by setting this back to null.';

comment on column public.tasks.deleted_at is
  'When this task was deleted. Non-null rows appear only on the Recently deleted screen.';

comment on column public.feedback.deleted_at is
  'When this comment was deleted. Non-null rows appear only on the Recently deleted screen.';

-- Partial, and on the small side of the split on purpose: these index the
-- deleted rows, which are the rare ones and the only ones ever asked for by this
-- column. The existing indexes keep serving the ordinary reads, whose extra
-- `deleted_at is null` predicate is a cheap filter on rows already found.

create index if not exists daily_updates_deleted_idx
  on public.daily_updates (deleted_at desc)
  where deleted_at is not null;

create index if not exists tasks_deleted_idx
  on public.tasks (deleted_at desc)
  where deleted_at is not null;

create index if not exists feedback_deleted_idx
  on public.feedback (deleted_at desc)
  where deleted_at is not null;

-- ---------------------------------------------------------------------------
-- When, and by whom: recorded rather than accepted
-- ---------------------------------------------------------------------------
-- One function, three triggers. BEFORE, so what it sets is what is stored, and
-- it overwrites whatever the caller sent.
--
-- Both columns are taken from the server. The timestamp because a browser clock
-- can be wrong by hours and "deleted 3 hours from now" is not a thing a bin
-- should be able to say; the actor because a client has no business naming
-- somebody else, and stamping it here is cheaper and stricter than a policy that
-- tries to check what it was sent.
--
-- So the value a client sends in `deleted_at` is only a signal: any non-null
-- value means "delete this", and null means "put it back". The column ends up
-- holding `now()` either way.
--
-- Restoring clears `deleted_by`, so the column always answers "who deleted this
-- row" rather than "who last touched its deleted state".

create or replace function public.stamp_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not distinct from old.deleted_at then
    return new;
  end if;

  if new.deleted_at is null then
    new.deleted_by := null;
  else
    new.deleted_at := now();
    new.deleted_by := auth.uid();
  end if;

  return new;
end;
$$;

comment on function public.stamp_deletion is
  'Fixes when a row was deleted and by whom, from the server and the session rather than from the request body.';

drop trigger if exists daily_updates_stamp_deletion on public.daily_updates;
create trigger daily_updates_stamp_deletion
  before update on public.daily_updates
  for each row execute function public.stamp_deletion();

drop trigger if exists tasks_stamp_deletion on public.tasks;
create trigger tasks_stamp_deletion
  before update on public.tasks
  for each row execute function public.stamp_deletion();

drop trigger if exists feedback_stamp_deletion on public.feedback;
create trigger feedback_stamp_deletion
  before update on public.feedback
  for each row execute function public.stamp_deletion();

-- ---------------------------------------------------------------------------
-- The list functions stop returning them
-- ---------------------------------------------------------------------------
-- Replaced whole rather than patched, because `create or replace function` is
-- the only way to change a body and these are the single read path for the three
-- filtered queries. Everything else about them is unchanged, including
-- `security invoker` — the reasoning for which is in
-- `20260913060000_filtered_list_functions.sql` and has not moved.
--
-- The new predicate is the last one in each, after the caller's filters, so the
-- planner still leads with the indexed columns.

create or replace function public.list_daily_updates(
  p_date_from date default null,
  p_date_to date default null,
  p_developer_ids uuid[] default null,
  p_project_ids uuid[] default null,
  p_statuses text[] default null,
  p_priorities text[] default null,
  p_is_blocked boolean default null
)
returns setof public.daily_updates
language sql
stable
security invoker
set search_path = ''
as $$
  select entry.*
    from public.daily_updates entry
   where (p_date_from is null or entry.entry_date >= p_date_from)
     and (p_date_to is null or entry.entry_date <= p_date_to)
     and (p_developer_ids is null or entry.developer_id = any (p_developer_ids))
     and (p_project_ids is null or entry.project_id = any (p_project_ids))
     and (p_statuses is null or entry.status = any (p_statuses))
     and (p_priorities is null or entry.priority = any (p_priorities))
     and (p_is_blocked is null or entry.is_blocked = p_is_blocked)
     and entry.deleted_at is null;
$$;

create or replace function public.list_tasks(
  p_developer_ids uuid[] default null,
  p_mentor_ids uuid[] default null,
  p_project_ids uuid[] default null,
  p_statuses text[] default null,
  p_priorities text[] default null,
  p_due_on_or_before date default null
)
returns setof public.tasks
language sql
stable
security invoker
set search_path = ''
as $$
  select task.*
    from public.tasks task
   where (p_developer_ids is null or task.developer_id = any (p_developer_ids))
     and (p_mentor_ids is null or task.mentor_id = any (p_mentor_ids))
     and (p_project_ids is null or task.project_id = any (p_project_ids))
     and (p_statuses is null or task.status = any (p_statuses))
     and (p_priorities is null or task.priority = any (p_priorities))
     and (p_due_on_or_before is null or task.due_date <= p_due_on_or_before)
     and task.deleted_at is null;
$$;

create or replace function public.list_feedback(
  p_date_from date default null,
  p_date_to date default null,
  p_developer_ids uuid[] default null,
  p_mentor_ids uuid[] default null,
  p_project_ids uuid[] default null
)
returns setof public.feedback
language sql
stable
security invoker
set search_path = ''
as $$
  select comment_row.*
    from public.feedback comment_row
   where (p_date_from is null or comment_row.feedback_date >= p_date_from)
     and (p_date_to is null or comment_row.feedback_date <= p_date_to)
     and (p_developer_ids is null or comment_row.developer_id = any (p_developer_ids))
     and (p_mentor_ids is null or comment_row.mentor_id = any (p_mentor_ids))
     and (p_project_ids is null or comment_row.project_id = any (p_project_ids))
     and comment_row.deleted_at is null;
$$;

-- ---------------------------------------------------------------------------
-- A deleted task cannot be moved along
-- ---------------------------------------------------------------------------
-- `set_task_status` is the one write path a developer has into `public.tasks`,
-- and it finds its row by id alone. A task in the bin has left My Tasks, so
-- nothing offers this — but the function is callable directly, and "the status of
-- something deleted" is not a question it should answer.
--
-- Treated as not found rather than refused, which is both true from the caller's
-- side and the answer the not-found path already knows how to report. Everything
-- else about the function is unchanged, including the authorisation check, whose
-- reasoning is in `20260911200000_task_status_only_updates.sql`.

create or replace function public.set_task_status(target_task_id uuid, new_status text)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  task_row public.tasks;
begin
  select * into task_row
    from public.tasks
   where id = target_task_id
     and deleted_at is null;

  if not found then
    return null;
  end if;

  if not (
    public.is_admin()
    or (
      public.current_mentor_id() is not null
      and public.can_view_developer(task_row.developer_id)
    )
    or task_row.developer_id = public.current_developer_id()
  ) then
    raise exception 'You may not change the status of this task.'
      using errcode = '42501';
  end if;

  update public.tasks
     set status = new_status
   where id = target_task_id
  returning * into task_row;

  return task_row;
end;
$$;

comment on function public.set_task_status is
  'Sets a task status for an admin, the developer''s mentor, or the assignee. The only way a developer may write to public.tasks. A deleted task reads as not found.';

-- ---------------------------------------------------------------------------
-- The status synchronisation leaves deleted rows out of it
-- ---------------------------------------------------------------------------
-- `sync_daily_update_from_task` carries a task's status onto every update
-- naming it. A deleted update must not be quietly rewritten while it sits in the
-- bin: it is being kept as it was, and if it is restored it should read as it
-- read when it was removed.
--
-- `sync_task_from_daily_update` is the other direction, and gets the matching
-- guard: a deleted update stops speaking for its task at all. Nothing today
-- reaches the rest of it — the existing early return covers both the delete and
-- the restore, since neither moves `status` — so this is stated rather than
-- relied on, and holds if some later write ever changes both at once.
--
-- What that leaves: an entry restored after its task has moved on comes back
-- reading as it read when it was deleted, and disagreeing with the task. That is
-- the intended side of the trade. The bin hands a row back as it took it, and the
-- next status change on either side settles the two.

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
  -- one task cannot show two different statuses. Except the deleted ones, which
  -- are held as they were.
  --
  -- Progress travels with the status so an entry never reads "Completed · 60%".
  -- Left as it was for in-progress and blocked, where the number the developer
  -- chose is the meaningful one.
  update public.daily_updates
     set status = new.status,
         progress = coalesce(implied_progress, progress),
         is_blocked = (new.status = 'blocked')
   where task_id = new.id
     and status is distinct from new.status
     and deleted_at is null;

  return null;
end;
$$;

create or replace function public.sync_task_from_daily_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.task_id is null or new.deleted_at is not null then
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

comment on function public.sync_daily_update_from_task is
  'Carries a task status onto every daily update logged against it, apart from the deleted ones.';

comment on function public.sync_task_from_daily_update is
  'Carries the status of a daily update onto the task it names. A deleted update does not speak for its task.';
