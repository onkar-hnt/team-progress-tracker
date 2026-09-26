-- ---------------------------------------------------------------------------
-- The parts of a row check that do not depend on the row run once
-- ---------------------------------------------------------------------------
-- `can_view_developer_on_project` is `security definer`, so the planner cannot
-- inline it. Calling it straight from a policy means one call per row scanned,
-- and each call re-reads `profiles` for `is_admin()`, `developers` for
-- `current_developer_id()` and `mentors` for `current_mentor_id()` — none of
-- which vary across the rows of a single statement. On the team activity list
-- that is the same three lookups repeated for every update in the range.
--
-- Postgres evaluates a scalar subquery with no outer reference once per
-- statement, as an InitPlan. Wrapping the three argument-free checks in
-- `(select ...)` is what moves them out of the per-row path.
--
-- The predicate is unchanged in meaning. `can_view_developer_on_project` is
-- itself `is_admin() or own row or mentor branch`, so naming the first two in
-- the policy and keeping the function for the third answers exactly as before:
--
--   * an administrator, or somebody reading their own work, is now decided by
--     two InitPlans and never calls the function,
--
--   * an account with no mentor record stops at the third InitPlan, which is
--     what a developer reading a colleague's work hits,
--
--   * a mentor still has the function applied per row, because which developer
--     and which project the row names is the whole question there.
--
-- Written for the two work tables that carry the largest ranges. The same
-- shape appears on `feedback_select` and the write policies, where the row
-- counts are small enough that it has not been worth the churn.

drop policy if exists daily_updates_select on public.daily_updates;
create policy daily_updates_select on public.daily_updates
  for select to authenticated
  using (
    (select public.is_admin())
    or developer_id = (select public.current_developer_id())
    or (
      (select public.current_mentor_id()) is not null
      and public.can_view_developer_on_project(developer_id, project_id)
    )
  );

comment on policy daily_updates_select on public.daily_updates is
  'Daily updates follow the same project boundary as tasks. A developer still reads every update of their own. The row-independent checks are scalar subqueries so they run once per statement rather than once per row.';

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated
  using (
    (select public.is_admin())
    or developer_id = (select public.current_developer_id())
    or (
      (select public.current_mentor_id()) is not null
      and public.can_view_developer_on_project(developer_id, project_id)
    )
  );

comment on policy tasks_select on public.tasks is
  'A mentor reads a task only when they are assigned to its developer and responsible for its project. The task''s own mentor_id does not widen that. The row-independent checks are scalar subqueries so they run once per statement rather than once per row.';
