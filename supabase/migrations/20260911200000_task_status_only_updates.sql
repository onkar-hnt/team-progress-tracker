-- ---------------------------------------------------------------------------
-- A developer may change a task's status, and nothing else
-- ---------------------------------------------------------------------------
-- The baseline `tasks_update` policy admits anybody who can see the row:
--
--   using (public.can_view_developer(developer_id))
--
-- and `can_view_developer()` is true of a developer for their own id. The
-- intent was that an assignee may move their own task along, which is the
-- My Tasks flow. What it actually grants is every column of that row.
--
-- So an assignee could also rewrite `due_date`, `priority`, `name`,
-- `project_id` and `mentor_id`. Moving a due date forward stops a task being
-- overdue, which means the overdue count, the dashboard and any report drawn
-- from them could be edited by the person being measured. For a progress
-- tracker that is the one thing the data must not allow.
--
-- The baseline records this as a known limitation, because row-level security
-- cannot narrow an UPDATE to a single column: a policy is evaluated per row,
-- and by then the new values are already in `new`. It names the two ways out
-- — column privileges, or a dedicated status-change function — and this
-- migration takes the second.
--
-- Column privileges were the alternative. They were not chosen because
-- `GRANT UPDATE (status)` applies to the `authenticated` role as a whole, and
-- that role is every signed-in person: it cannot say "only the status, and
-- only for your own rows", so the row test would still have to live in a
-- policy and the two halves of one rule would sit in different places. A
-- function holds the whole rule in one readable statement.
--
-- Deliberately unchanged: `tasks_select`, `tasks_insert`, `tasks_delete`, and
-- every other table. Reads are a separate question and are correct as they
-- stand; insert and delete were settled in
-- `20260911183000_task_assignment_privileges.sql`.

-- ---------------------------------------------------------------------------
-- The status-only write path
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER, so it can write a row the caller has no direct UPDATE
-- privilege on. That makes the authorisation check below the whole of the
-- protection, so it is written as one explicit condition rather than assembled
-- from earlier ones.
--
-- The three permitted callers, and why:
--
--   * an admin, who may change anything;
--   * a mentor, for a developer assigned to them — `current_mentor_id() is not
--     null` establishes they hold a mentor identity rather than merely the
--     role, and `can_view_developer()` scopes it to their own developers, the
--     same pairing the insert and delete policies use;
--   * the assignee, which is the flow this exists for.
--
-- `new_status` is not validated here. The `status in (...)` check constraint on
-- the table is the single definition of the allowed values, and letting the
-- UPDATE fail against it keeps a second copy of that list from drifting.
--
-- A missing row returns null rather than raising, so the caller reports "no
-- such task" through its own not-found path. A row that exists but may not be
-- touched raises instead: the two are different answers and collapsing them
-- would tell an administrator their task had vanished.

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
   where id = target_task_id;

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
  'Sets a task status for an admin, the developer''s mentor, or the assignee. The only way a developer may write to public.tasks.';

-- Functions are executable by PUBLIC unless told otherwise, and `anon` must
-- not reach a SECURITY DEFINER writer.
revoke all on function public.set_task_status(uuid, text) from public, anon;
grant execute on function public.set_task_status(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Direct updates are for admins and mentors only
-- ---------------------------------------------------------------------------
-- With the status path above in place, a developer needs no direct UPDATE at
-- all, so the self-view clause comes out. This is the same condition as
-- `tasks_insert` and `tasks_delete`, which is the point: who may edit a task
-- record is now one rule, stated the same way in all three places.
--
-- `with check` repeats it so a mentor cannot move a task to a developer
-- outside their own, which would otherwise pass the `using` test on the row
-- as it stands and then write one they may not see.

drop policy if exists tasks_update on public.tasks;

create policy tasks_update on public.tasks
  for update to authenticated
  using (
    public.is_admin()
    or (
      public.current_mentor_id() is not null
      and public.can_view_developer(developer_id)
    )
  )
  with check (
    public.is_admin()
    or (
      public.current_mentor_id() is not null
      and public.can_view_developer(developer_id)
    )
  );

comment on policy tasks_update on public.tasks is
  'Admins edit any task; mentors edit tasks for developers assigned to them. A developer changes only status, through set_task_status.';
