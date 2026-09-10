-- Team Progress Tracker — Row Level Security
--
-- This migration is what turns the role model from a UI convention into a
-- security boundary. Until now `src/docs/Access-Control.md` was accurate in
-- warning that isolation was "a correctness and privacy control for ordinary
-- use, but not a security boundary", because the browser held a token that
-- reached the whole workbook. With the policies below the database itself
-- refuses rows the caller may not see, so the app can be deployed publicly.
--
-- The browser-side `AccessScope` in `src/services/auth/access-scope.ts` stays
-- exactly as it is. It is no longer the only defence, but the data layer is
-- documented as filtering twice on purpose, so that the guarantee does not
-- depend on the backend having honoured it. That remains true in reverse now:
-- the database does not depend on the client having filtered.
--
-- Nothing here reads an id supplied by the client. Every policy resolves the
-- caller from auth.uid() and walks the profile -> mentor/developer links.

-- ---------------------------------------------------------------------------
-- Identity helpers
-- ---------------------------------------------------------------------------
-- All SECURITY DEFINER. Two reasons: a policy on `profiles` that queried
-- `profiles` directly would recurse into itself, and resolving the caller's
-- own mentor/developer row must not depend on the policies being resolved.
--
-- `set search_path = ''` forces every reference to be schema-qualified, so a
-- caller cannot shadow a table name and change what these functions read.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.role = 'admin' from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

comment on function public.is_admin is
  'True when the caller''s profile role is admin. The only definition of admin.';

create or replace function public.current_mentor_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id from public.mentors m where m.profile_id = auth.uid();
$$;

create or replace function public.current_developer_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select d.id from public.developers d where d.profile_id = auth.uid();
$$;

-- The server-side equivalent of `AccessScope.visibleDeveloperIds`.
--
-- An admin sees everyone; anybody sees their own row; a mentor sees the
-- developers currently assigned to them. An assignment whose `active` flag is
-- clear keeps the history but grants nothing, which is how a mentor is taken
-- off a developer without erasing the record that they once mentored them.
create or replace function public.can_view_developer(target_developer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_admin()
    or target_developer_id = public.current_developer_id()
    or exists (
      select 1
      from public.mentor_assignments ma
      where ma.developer_id = target_developer_id
        and ma.mentor_id = public.current_mentor_id()
        and ma.active
    );
$$;

comment on function public.can_view_developer is
  'Whether the caller may see a developer''s records. Already covers admin and self.';

-- Whether the caller may see a project: the accountable mentor, or anybody
-- who can see a developer assigned to it.
--
-- This has to be a function rather than a subquery inside the policy. A
-- policy on `projects` that read `project_developers` would trigger that
-- table's own policy, which reads `projects` to find the accountable mentor —
-- and Postgres aborts that with "infinite recursion detected in policy for
-- relation". SECURITY DEFINER reads both tables without applying RLS, which
-- breaks the cycle.
create or replace function public.can_view_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_admin()
    or exists (
      select 1
      from public.projects p
      where p.id = target_project_id
        and p.mentor_id = public.current_mentor_id()
    )
    or exists (
      select 1
      from public.project_developers pd
      where pd.project_id = target_project_id
        and public.can_view_developer(pd.developer_id)
    );
$$;

comment on function public.can_view_project is
  'Whether the caller may see a project. Avoids policy recursion between projects and project_developers.';

-- Whether the caller may see a mentor record: an admin, the mentor
-- themselves, or a developer that mentor is currently assigned to.
create or replace function public.can_view_mentor(target_mentor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_admin()
    or exists (
      select 1
      from public.mentors m
      where m.id = target_mentor_id
        and m.profile_id = auth.uid()
    )
    or exists (
      select 1
      from public.mentor_assignments ma
      where ma.mentor_id = target_mentor_id
        and ma.developer_id = public.current_developer_id()
        and ma.active
    );
$$;

-- Only signed-in callers may run these. `anon` has no table privileges, but
-- functions are executable by PUBLIC unless told otherwise.
revoke all on function public.is_admin() from public, anon;
revoke all on function public.current_mentor_id() from public, anon;
revoke all on function public.current_developer_id() from public, anon;
revoke all on function public.can_view_developer(uuid) from public, anon;
revoke all on function public.can_view_project(uuid) from public, anon;
revoke all on function public.can_view_mentor(uuid) from public, anon;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.current_mentor_id() to authenticated;
grant execute on function public.current_developer_id() to authenticated;
grant execute on function public.can_view_developer(uuid) to authenticated;
grant execute on function public.can_view_project(uuid) to authenticated;
grant execute on function public.can_view_mentor(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Role cannot be self-granted
-- ---------------------------------------------------------------------------
-- A profile is updatable by its owner so a display name can be corrected.
-- Without this guard that same policy would let anybody set their own role to
-- admin, which would make every policy above meaningless.

create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'Only an administrator may change a role.'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    raise exception 'Only an administrator may change account status.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger profiles_guard_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------
-- Every application table. A table with RLS enabled and no matching policy
-- returns nothing, which is the correct default: a table added later is
-- closed until somebody writes a policy for it.

alter table public.profiles            enable row level security;
alter table public.mentors             enable row level security;
alter table public.developers          enable row level security;
alter table public.mentor_assignments  enable row level security;
alter table public.projects            enable row level security;
alter table public.project_developers  enable row level security;
alter table public.tasks               enable row level security;
alter table public.daily_updates       enable row level security;
alter table public.feedback            enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
-- Deliberately narrow: names shown in the UI come from `mentors.name` and
-- `developers.name`, so no screen needs to read other people's profiles.
--
-- There is no INSERT policy. Profiles are created by the SECURITY DEFINER
-- trigger on auth.users, and the foreign key means a row cannot exist without
-- an auth user, which only the Supabase admin API can create.

create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- mentors
-- ---------------------------------------------------------------------------
-- A developer may read the mentors who mentor them, because feedback is shown
-- with the mentor's name against it.

create policy mentors_select on public.mentors
  for select to authenticated
  using (public.can_view_mentor(id));

create policy mentors_insert on public.mentors
  for insert to authenticated
  with check (public.is_admin());

create policy mentors_update on public.mentors
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy mentors_delete on public.mentors
  for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- developers
-- ---------------------------------------------------------------------------

create policy developers_select on public.developers
  for select to authenticated
  using (public.can_view_developer(id));

create policy developers_insert on public.developers
  for insert to authenticated
  with check (public.is_admin());

create policy developers_update on public.developers
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy developers_delete on public.developers
  for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- mentor_assignments
-- ---------------------------------------------------------------------------
-- Read by every signed-in user, because `useMentorAssignments()` builds the
-- access scope from it. A mentor sees their own mapping, a developer sees who
-- mentors them, and an admin sees all of it.

create policy mentor_assignments_select on public.mentor_assignments
  for select to authenticated
  using (
    public.is_admin()
    or mentor_id = public.current_mentor_id()
    or developer_id = public.current_developer_id()
  );

create policy mentor_assignments_insert on public.mentor_assignments
  for insert to authenticated
  with check (public.is_admin());

create policy mentor_assignments_update on public.mentor_assignments
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy mentor_assignments_delete on public.mentor_assignments
  for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
-- Visible to the accountable mentor, and to anybody who can see a developer
-- assigned to it — which is what lets a developer read the projects they log
-- work against without being able to enumerate the rest.

create policy projects_select on public.projects
  for select to authenticated
  using (public.can_view_project(id));

create policy projects_insert on public.projects
  for insert to authenticated
  with check (public.is_admin());

create policy projects_update on public.projects
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy projects_delete on public.projects
  for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- project_developers
-- ---------------------------------------------------------------------------

create policy project_developers_select on public.project_developers
  for select to authenticated
  using (
    public.can_view_developer(developer_id)
    or public.can_view_project(project_id)
  );

create policy project_developers_insert on public.project_developers
  for insert to authenticated
  with check (public.is_admin());

create policy project_developers_delete on public.project_developers
  for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
-- Creating and assigning tasks is an admin action. Changing a task's status
-- is not: a developer may update their own tasks, and a mentor those of the
-- developers assigned to them, which is what `MyTasksPage` relies on.
--
-- KNOWN LIMITATION: row-level security cannot restrict this to the `status`
-- column, so a developer permitted to update their task could also change its
-- due date. Narrowing that needs either column privileges or a dedicated
-- status-change function, which is recorded as a production TODO.

create policy tasks_select on public.tasks
  for select to authenticated
  using (
    public.can_view_developer(developer_id)
    or mentor_id = public.current_mentor_id()
  );

create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (public.is_admin());

create policy tasks_update on public.tasks
  for update to authenticated
  using (public.can_view_developer(developer_id))
  with check (public.can_view_developer(developer_id));

create policy tasks_delete on public.tasks
  for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- daily_updates
-- ---------------------------------------------------------------------------
-- Mentors can read their developers' entries but deliberately cannot write
-- them. A daily update is a first-hand record, and letting somebody else
-- author it would make the history untrustworthy. Admins may write anyone's.

create policy daily_updates_select on public.daily_updates
  for select to authenticated
  using (public.can_view_developer(developer_id));

create policy daily_updates_insert on public.daily_updates
  for insert to authenticated
  with check (
    public.is_admin() or developer_id = public.current_developer_id()
  );

create policy daily_updates_update on public.daily_updates
  for update to authenticated
  using (public.is_admin() or developer_id = public.current_developer_id())
  with check (public.is_admin() or developer_id = public.current_developer_id());

create policy daily_updates_delete on public.daily_updates
  for delete to authenticated
  using (public.is_admin() or developer_id = public.current_developer_id());

-- ---------------------------------------------------------------------------
-- feedback
-- ---------------------------------------------------------------------------
-- A developer reads their own feedback but cannot write any. A mentor writes
-- it for the developers assigned to them, and may edit or delete only their
-- own comments.

create policy feedback_select on public.feedback
  for select to authenticated
  using (public.can_view_developer(developer_id));

create policy feedback_insert on public.feedback
  for insert to authenticated
  with check (
    public.is_admin()
    or (
      mentor_id = public.current_mentor_id()
      and public.can_view_developer(developer_id)
    )
  );

create policy feedback_update on public.feedback
  for update to authenticated
  using (public.is_admin() or mentor_id = public.current_mentor_id())
  with check (public.is_admin() or mentor_id = public.current_mentor_id());

create policy feedback_delete on public.feedback
  for delete to authenticated
  using (public.is_admin() or mentor_id = public.current_mentor_id());
