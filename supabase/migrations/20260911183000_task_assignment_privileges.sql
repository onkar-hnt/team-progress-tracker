-- ---------------------------------------------------------------------------
-- Assigning and removing tasks stays with the people who manage work
-- ---------------------------------------------------------------------------
-- `20260911170000_mentor_roster_privileges.sql` widened these two policies so
-- that a mentor could assign work, replacing the admin-only baseline with:
--
--     public.is_admin() or public.can_view_developer(developer_id)
--
-- That reads as "an admin, or a mentor for one of their developers", and for a
-- mentor it is. But `can_view_developer()` answers a *visibility* question,
-- and its second clause is
--
--     or target_developer_id = public.current_developer_id()
--
-- — self-view, which exists so a developer can read their own records. As a
-- write condition it grants every developer INSERT and DELETE on rows naming
-- themselves. A developer could therefore create task assignments for
-- themselves and, worse, DELETE the ones their mentor had assigned, straight
-- through PostgREST. The UI never offered either, so nothing surfaced it: the
-- Tasks screen sits behind `RequireTeamManagement` and `canAssignTasks()`
-- returns false for a developer. The policy was the only thing standing
-- between the API and that, and it was open.
--
-- A task is the *plan*, handed down; a daily update is the developer's own
-- record of what happened. Authoring your own assignments collapses that
-- distinction, which is why this is a defect rather than a missing feature.
--
-- Nothing is added to the model to fix it. The project already has a test for
-- "the caller is acting as a mentor" — `public.current_mentor_id()`, used by
-- `tasks_select`, `mentor_assignments_select` and `feedback_insert` — and
-- already has the rule for which developers that mentor reaches, inside
-- `can_view_developer()`. Requiring both together says "a mentor, for a
-- developer they are allowed" and says nothing about developers, so the
-- self-view clause can no longer be reached by somebody who is only a
-- developer.
--
-- `current_mentor_id()` rather than `is_privileged()` deliberately, though the
-- latter looks like the tidier fit. `is_privileged()` reads `profiles.role`
-- alone, so a profile carrying role `mentor` with no row in `public.mentors`
-- would satisfy it while having no mentor identity at all — and for such an
-- account `can_view_developer()` is true only by way of the self clause, which
-- is the exact hole being closed. Anchoring the grant to the `mentors` row
-- keeps it on the same key `mentor_assignments` is built from.
--
-- Deliberately unchanged:
--
--   * `tasks_select`. Reads are a separate question and are correct as they
--     stand: a developer must see their own tasks, which is what My Tasks is.
--   * `tasks_update`. A developer changing the status of their own task is the
--     intended flow. Its documented limitation — that RLS cannot narrow an
--     UPDATE to the `status` column, so an assignee could also alter a due
--     date — is untouched here and remains recorded against the baseline.
--   * Every non-`tasks` policy, and every table, column and relationship.
--
-- Resulting authority:
--
--   Admin      INSERT and DELETE any task.
--   Mentor     INSERT and DELETE tasks for the developers assigned to them.
--   Developer  Neither, for their own tasks or anybody else's.
--
-- A mentor who is also an employee keeps the ability to assign to themselves.
-- That falls out of `can_view_developer()` matching self and is intentional:
-- they are a mentor, `canAssignTasks()` already admits them, and the access
-- scope already includes their own employee row.

-- ---------------------------------------------------------------------------
-- tasks INSERT
-- ---------------------------------------------------------------------------
-- `drop … if exists` so the migration is safe to re-run and does not depend on
-- which of the two earlier definitions a given database is holding. These are
-- the only INSERT and DELETE policies on the table; permissive policies are
-- OR-ed together, so replacing them leaves nothing else granting the verb.

drop policy if exists tasks_insert on public.tasks;

create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (
    public.is_admin()
    or (
      public.current_mentor_id() is not null
      and public.can_view_developer(developer_id)
    )
  );

comment on policy tasks_insert on public.tasks is
  'Admins assign any task; mentors assign to developers assigned to them. Developers cannot assign work, including to themselves.';

-- ---------------------------------------------------------------------------
-- tasks DELETE
-- ---------------------------------------------------------------------------
-- The same condition. Removing an assignment is the counterpart of making one,
-- and a developer being able to delete work assigned to them would be the more
-- damaging of the two: the row is the record that the work was ever asked for.

drop policy if exists tasks_delete on public.tasks;

create policy tasks_delete on public.tasks
  for delete to authenticated
  using (
    public.is_admin()
    or (
      public.current_mentor_id() is not null
      and public.can_view_developer(developer_id)
    )
  );

comment on policy tasks_delete on public.tasks is
  'Admins remove any task; mentors remove tasks for developers assigned to them. Developers cannot delete assignments, including their own.';
