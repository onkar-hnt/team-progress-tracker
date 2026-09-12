-- ---------------------------------------------------------------------------
-- A mentor maintains their own roster; nobody else's
-- ---------------------------------------------------------------------------
-- Until now `mentor_assignments` could only be written by an admin, and
-- `20260910181600_rls_policies.sql` said why: this table *is* the permission.
-- `can_view_developer()` reads it, and that function gates
-- `daily_updates_select`, `tasks_select` and `feedback_select`, so a row naming
-- a mentor and a developer is what grants that mentor sight of that developer's
-- work. Letting mentors write it lets them widen their own reach.
--
-- That consequence has been accepted deliberately, not overlooked. A mentor may
-- now assign any employee to themselves, and doing so grants them that
-- employee's daily updates, tasks and feedback. In exchange, adding somebody to
-- your own list stops being an administrator's errand. What this does *not*
-- become is a way to read data unnoticed: the assignment is a row, the admin
-- screen lists it, and the developer concerned can see who mentors them through
-- `mentor_assignments_select`.
--
-- Two limits are kept, and both are enforced here rather than in the UI:
--
--   * A mentor writes only rows naming themselves. `mentor_id =
--     current_mentor_id()` appears in `using` *and* `with check`, so a mentor
--     can neither touch another mentor's row nor re-point one of their own at
--     somebody else.
--   * A developer gains nothing. `current_mentor_id()` returns null for an
--     account with no `mentors` row, and `mentor_id = null` is null rather than
--     true, so the new clause is unreachable for them. The self-view trap that
--     `20260911183000_task_assignment_privileges.sql` closed on `tasks` is not
--     reopened here: this names the mentor side of the pair, not the developer
--     side.
--
-- Admin authority is unchanged — an admin still assigns anybody to any mentor.
-- `is_admin()` stays as the first clause of all three policies.
--
-- Sharing a developer between mentors is allowed and always was:
-- `mentor_assignments_unique_pair` is unique on the pair, not on the developer,
-- so claiming somebody does not take them from whoever already had them.
--
-- Only the three write policies change. `mentor_assignments_select` is
-- untouched, as is every other table.

-- ---------------------------------------------------------------------------
-- INSERT — claiming an employee
-- ---------------------------------------------------------------------------

drop policy if exists mentor_assignments_insert on public.mentor_assignments;

create policy mentor_assignments_insert on public.mentor_assignments
  for insert to authenticated
  with check (
    public.is_admin()
    or mentor_id = public.current_mentor_id()
  );

comment on policy mentor_assignments_insert on public.mentor_assignments is
  'Admins assign any employee to any mentor; a mentor assigns only to themselves. Developers cannot assign at all, because current_mentor_id() is null for them.';

-- ---------------------------------------------------------------------------
-- UPDATE — reviving a row left inactive
-- ---------------------------------------------------------------------------
-- `set_mentor_assignments` reactivates a pair that survived from an earlier
-- assignment rather than inserting a duplicate, so a mentor reclaiming somebody
-- they previously dropped needs this verb as well as INSERT.
--
-- `with check` matters more than it looks: without it a mentor could take a row
-- of their own and hand it to another mentor, which is the one thing the INSERT
-- policy is written to prevent.

drop policy if exists mentor_assignments_update on public.mentor_assignments;

create policy mentor_assignments_update on public.mentor_assignments
  for update to authenticated
  using (
    public.is_admin()
    or mentor_id = public.current_mentor_id()
  )
  with check (
    public.is_admin()
    or mentor_id = public.current_mentor_id()
  );

comment on policy mentor_assignments_update on public.mentor_assignments is
  'Admins amend any assignment; a mentor amends only their own, and cannot move one to another mentor because with check pins mentor_id to themselves.';

-- ---------------------------------------------------------------------------
-- DELETE — releasing an employee
-- ---------------------------------------------------------------------------
-- The counterpart of claiming, and the safer half: removing a row narrows what
-- the mentor can see. A mentor cannot use it against a colleague, since the
-- rows they may delete are the ones naming themselves.

drop policy if exists mentor_assignments_delete on public.mentor_assignments;

create policy mentor_assignments_delete on public.mentor_assignments
  for delete to authenticated
  using (
    public.is_admin()
    or mentor_id = public.current_mentor_id()
  );

comment on policy mentor_assignments_delete on public.mentor_assignments is
  'Admins remove any assignment; a mentor removes only their own, which narrows rather than widens what they can see.';
