-- ---------------------------------------------------------------------------
-- Mentors gain the administrator's management powers
-- ---------------------------------------------------------------------------
-- A mentor may now maintain the roster: employees, mentors, projects and the
-- assignments of work. What they may *read* is deliberately split in two.
--
-- The roster itself - who works here, which mentors exist, what the projects
-- are - becomes fully visible, because a record cannot be administered
-- without being read. Every create path reads its own row back to learn the
-- id and code the database assigned, so a mentor who could write a row but
-- not see it would have every "Add" button fail after the insert had already
-- succeeded.
--
-- The work itself - daily updates and feedback - stays narrowed to the
-- developers assigned to them. That is the material the access scope exists
-- to protect, and none of the policies below touch it.
--
-- Three powers stay with administrators, each for a specific reason:
--
--   * `profiles.role` and `profiles.status`. The trigger guarding these is
--     the only thing that makes any role mean anything; extending it to
--     mentors would let a mentor promote themselves and demote the
--     administrator, at which point there is no administrator.
--
--   * `mentor_assignments`. A mentor's reach is defined by this table, so a
--     mentor who could write it could grant themselves every developer and
--     the narrowing above would be decoration. Keeping it here is what makes
--     "mentors stay scoped for work data" true rather than nominal.
--
--   * Re-pointing a person record at a different account (`profile_id`).
--     Guarded by a new trigger below.

create or replace function public.is_privileged()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.role in ('admin', 'mentor') from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

comment on function public.is_privileged is
  'True when the caller administers the roster: an admin or a mentor. Not a substitute for is_admin().';

revoke all on function public.is_privileged() from public, anon;
grant execute on function public.is_privileged() to authenticated;

-- ---------------------------------------------------------------------------
-- Roster visibility
-- ---------------------------------------------------------------------------
-- Widened at the policy rather than inside `can_view_developer()`, which is
-- shared with the daily-update, feedback and task policies. Changing the
-- helper would have quietly unscoped the work data as well.

drop policy if exists developers_select on public.developers;
create policy developers_select on public.developers
  for select to authenticated
  using (public.can_view_developer(id) or public.is_privileged());

drop policy if exists mentors_select on public.mentors;
create policy mentors_select on public.mentors
  for select to authenticated
  using (public.can_view_mentor(id) or public.is_privileged());

drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select to authenticated
  using (public.can_view_project(id) or public.is_privileged());

drop policy if exists project_developers_select on public.project_developers;
create policy project_developers_select on public.project_developers
  for select to authenticated
  using (
    public.can_view_developer(developer_id)
    or public.can_view_project(project_id)
    or public.is_privileged()
  );

-- ---------------------------------------------------------------------------
-- Roster maintenance
-- ---------------------------------------------------------------------------

drop policy if exists developers_insert on public.developers;
create policy developers_insert on public.developers
  for insert to authenticated
  with check (public.is_privileged());

drop policy if exists developers_update on public.developers;
create policy developers_update on public.developers
  for update to authenticated
  using (public.is_privileged())
  with check (public.is_privileged());

drop policy if exists developers_delete on public.developers;
create policy developers_delete on public.developers
  for delete to authenticated
  using (public.is_privileged());

drop policy if exists mentors_insert on public.mentors;
create policy mentors_insert on public.mentors
  for insert to authenticated
  with check (public.is_privileged());

drop policy if exists mentors_update on public.mentors;
create policy mentors_update on public.mentors
  for update to authenticated
  using (public.is_privileged())
  with check (public.is_privileged());

drop policy if exists mentors_delete on public.mentors;
create policy mentors_delete on public.mentors
  for delete to authenticated
  using (public.is_privileged());

drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects
  for insert to authenticated
  with check (public.is_privileged());

drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects
  for update to authenticated
  using (public.is_privileged())
  with check (public.is_privileged());

drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects
  for delete to authenticated
  using (public.is_privileged());

drop policy if exists project_developers_insert on public.project_developers;
create policy project_developers_insert on public.project_developers
  for insert to authenticated
  with check (public.is_privileged());

drop policy if exists project_developers_delete on public.project_developers;
create policy project_developers_delete on public.project_developers
  for delete to authenticated
  using (public.is_privileged());

-- ---------------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------------
-- Assigning work is now a mentor's job too, but only for the developers they
-- can already see. Left wider than that, a mentor could create a task for
-- somebody outside their scope and then fail to read it back, because
-- `tasks_select` is unchanged and would not return the row the insert had
-- just created.

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (public.is_admin() or public.can_view_developer(developer_id));

drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks
  for delete to authenticated
  using (public.is_admin() or public.can_view_developer(developer_id));

-- ---------------------------------------------------------------------------
-- A person record cannot be re-pointed at another account
-- ---------------------------------------------------------------------------
-- `developers.profile_id` and `mentors.profile_id` decide whose records the
-- signed-in person owns: `current_developer_id()` finds the developer row
-- whose `profile_id` is the caller. Now that mentors may update these tables,
-- an unguarded `profile_id` would let a mentor point an existing developer
-- row at their own account and inherit the right to author that developer's
-- daily updates - the one thing the daily-update policies are written to
-- prevent.
--
-- The provisioning Edge Functions legitimately set this column, so the guard
-- has to let them through. It does that by role rather than by a claim: this
-- function is deliberately NOT `security definer`, because it needs
-- `current_user` to be the role PostgREST switched to for the request -
-- `service_role` for the functions, `authenticated` for a signed-in person.
-- Inside a `security definer` function `current_user` is the owner instead,
-- and the comparison would always be false.

create or replace function public.guard_identity_link()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.profile_id is null then
      return new;
    end if;
  elsif new.profile_id is not distinct from old.profile_id then
    return new;
  end if;

  if current_user <> 'authenticated' or public.is_admin() then
    return new;
  end if;

  raise exception 'Only an administrator may change which account a person record belongs to.'
    using errcode = '42501';
end;
$$;

comment on function public.guard_identity_link is
  'Keeps profile_id writable only by administrators and the provisioning functions.';

drop trigger if exists developers_guard_identity_link on public.developers;
create trigger developers_guard_identity_link
  before insert or update on public.developers
  for each row execute function public.guard_identity_link();

drop trigger if exists mentors_guard_identity_link on public.mentors;
create trigger mentors_guard_identity_link
  before insert or update on public.mentors
  for each row execute function public.guard_identity_link();
