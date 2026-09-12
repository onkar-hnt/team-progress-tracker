-- ---------------------------------------------------------------------------
-- The three filtered list reads become functions
-- ---------------------------------------------------------------------------
-- `daily_updates`, `tasks` and `feedback` are read through a query the
-- application already describes as an object — `DailyWorkQuery`,
-- `AssignedTaskQuery`, `MentorCommentQuery` — and the Supabase provider has
-- been translating those objects into PostgREST filter chains one predicate at
-- a time. Seven optional predicates on daily updates, six on tasks, five on
-- feedback, several of them `in (…)` lists carrying every developer a mentor
-- can see. The result is a GET whose URL is the query, at whatever length the
-- team happens to be.
--
-- These three are the only reads in the application shaped like that. Every
-- other one is a single-column lookup, a full-table read under RLS, or a write
-- returning its own row, and all of those stay exactly as they are — a
-- function per CRUD statement would be more machinery to maintain and no
-- clearer to read.
--
-- What changes and what does not:
--
--   * The same rows. Each function is the same predicate set, written as SQL
--     instead of assembled as query string, with a null parameter meaning "no
--     filter on this" exactly as an absent key did.
--   * The same authorization. `security invoker`, so every one of these runs
--     as the caller against the same `daily_updates_select`, `tasks_select` and
--     `feedback_select` policies that governed the direct reads. Nothing is
--     added, nothing is bypassed, and no parameter can widen a result.
--   * One round trip each, as before. These consolidate nothing: the point is
--     the shape of the request, not the number of them.
--
-- Why `security invoker` and not `definer`, stated plainly because it is the
-- decision that matters: a parameter is a value the browser chooses, and every
-- one of these takes a list of developer ids. Under `definer` the function
-- would run with the owner's rights, RLS would no longer apply, and
-- `p_developer_ids` would become an instruction the database obeys — anybody
-- could read anybody's work by passing their id. Under `invoker` the policies
-- still filter, so passing somebody else's id returns nothing. The parameters
-- narrow a result; they can never widen one.
--
-- `stable`, so the planner may inline them and use the indexes these
-- predicates were built for: `daily_updates_developer_date_idx`,
-- `daily_updates_entry_date_idx`, `tasks_developer_status_idx`,
-- `tasks_due_date_idx`, `feedback_developer_date_idx`.
--
-- `returns setof <table>` rather than a spelled-out column list, so a column
-- added to a table later reaches the application without a second migration
-- here to remember.
--
-- Ordering is deliberately absent, matching the reads being replaced. The
-- service sorts what it needs sorted; an `order by` here would be a change in
-- behaviour dressed up as a detail.

-- ---------------------------------------------------------------------------
-- daily_updates
-- ---------------------------------------------------------------------------

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
     and (p_is_blocked is null or entry.is_blocked = p_is_blocked);
$$;

comment on function public.list_daily_updates(
  date, date, uuid[], uuid[], text[], text[], boolean
) is
  'Daily updates matching the given filters, each null meaning no filter. security invoker, so daily_updates_select decides which rows the caller sees and a developer id passed here can only narrow that, never widen it.';

revoke all on function public.list_daily_updates(
  date, date, uuid[], uuid[], text[], text[], boolean
) from public, anon;

grant execute on function public.list_daily_updates(
  date, date, uuid[], uuid[], text[], text[], boolean
) to authenticated;

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
-- `= any (…)` excludes nulls of its own accord, which is what the two nullable
-- columns here rely on: a task with no mentor matches no list of mentor ids,
-- and a task with no due date is never past one.

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
     and (p_due_on_or_before is null or task.due_date <= p_due_on_or_before);
$$;

comment on function public.list_tasks(
  uuid[], uuid[], uuid[], text[], text[], date
) is
  'Assigned tasks matching the given filters, each null meaning no filter. security invoker, so tasks_select decides which rows the caller sees.';

revoke all on function public.list_tasks(
  uuid[], uuid[], uuid[], text[], text[], date
) from public, anon;

grant execute on function public.list_tasks(
  uuid[], uuid[], uuid[], text[], text[], date
) to authenticated;

-- ---------------------------------------------------------------------------
-- feedback
-- ---------------------------------------------------------------------------
-- General feedback carries no project, and is excluded by a project filter for
-- the same reason a task with no mentor is: null satisfies no list.

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
     and (p_project_ids is null or comment_row.project_id = any (p_project_ids));
$$;

comment on function public.list_feedback(
  date, date, uuid[], uuid[], uuid[]
) is
  'Feedback matching the given filters, each null meaning no filter. security invoker, so feedback_select decides which rows the caller sees.';

revoke all on function public.list_feedback(
  date, date, uuid[], uuid[], uuid[]
) from public, anon;

grant execute on function public.list_feedback(
  date, date, uuid[], uuid[], uuid[]
) to authenticated;
