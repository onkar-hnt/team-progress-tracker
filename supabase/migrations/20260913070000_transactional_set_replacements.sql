-- ---------------------------------------------------------------------------
-- Replacing a set becomes one statement instead of three
-- ---------------------------------------------------------------------------
-- Two places in the application replace a whole set of rows: the developers
-- assigned to a mentor, and the developers on a project. Both are written as a
-- difference against what is already there — deleting what is no longer
-- wanted, inserting what is new — so that re-saving an unchanged list issues
-- nothing and does not restamp `assigned_date` or `created_at` on a row that
-- was already correct. That part is right and is kept exactly as it is.
--
-- What is wrong is that the difference is applied from the browser, as
-- separate PostgREST calls. `replaceMentorAssignments` said so itself:
--
--     Not a transaction. PostgREST exposes no multi-statement transaction, so
--     a failure between the delete and the insert would leave the set partly
--     applied. […] Moving this into a single `rpc()` is the fix if that ever
--     stops being good enough.
--
-- This is that fix. A function body is one transaction, so the delete and the
-- insert either both happen or neither does. A dropped connection halfway can
-- no longer leave a mentor holding some of their old developers and none of
-- their new ones — which for `mentor_assignments` is not a cosmetic problem,
-- because `can_view_developer()` reads these rows and a half-applied write is
-- a half-applied permission.
--
-- `security invoker` on both, so the policies that governed the separate calls
-- still govern these. `mentor_assignments` writes remain admin-only through
-- `mentor_assignments_insert`, `_update` and `_delete`; `project_developers`
-- writes remain `is_privileged()` through `project_developers_insert` and
-- `_delete`. Neither function tests a role itself: there is nothing to add to
-- what the policies already say, and a second copy of the rule is a second
-- place for it to drift. Passing a mentor id you may not administer does not
-- become an authorization bypass — the statements simply match no rows.
--
-- Note what these two do *not* do. They do not create a project or a mentor,
-- validate that a developer exists, or return a project. Those remain ordinary
-- calls in the repositories, where the existing error taxonomy already turns a
-- missing reference into a `ReferentialIntegrityError` naming the field. The
-- functions cover the multi-statement part and stop there.

-- ---------------------------------------------------------------------------
-- mentor_assignments
-- ---------------------------------------------------------------------------
-- `p_assigned_date` is a parameter rather than `current_date` because the
-- caller's today and the server's are not the same day. The database runs in
-- UTC; a team working in IST assigning somebody at half past midnight would
-- have it recorded as yesterday. The repository passes its own `todayIsoDate()`,
-- which is the date it recorded before, and the coalesce covers a direct
-- caller who omits it.

create or replace function public.set_mentor_assignments(
  p_mentor_id uuid,
  p_developer_ids uuid[],
  p_assigned_date date default null
)
returns setof public.mentor_assignments
language plpgsql
security invoker
set search_path = ''
as $$
declare
  requested uuid[] := coalesce(p_developer_ids, '{}'::uuid[]);
begin
  -- An empty request removes every row for the mentor, which is what an empty
  -- set means: `developer_id = any ('{}')` is false for every row, so the
  -- negation holds for all of them.
  delete from public.mentor_assignments
   where mentor_id = p_mentor_id
     and not (developer_id = any (requested));

  -- A pair that survived from an earlier assignment may have been left
  -- inactive by an older client. Ticking the developer again has to grant
  -- visibility, so those rows are revived rather than ignored.
  update public.mentor_assignments
     set active = true
   where mentor_id = p_mentor_id
     and developer_id = any (requested)
     and not active;

  -- `distinct` and `on conflict` both earn their place: the first because the
  -- same developer named twice in one request is a redundant instruction
  -- rather than a conflict to report, the second because a pair that already
  -- exists must keep the `assigned_date` it was given.
  insert into public.mentor_assignments (mentor_id, developer_id, assigned_date, active)
  select distinct p_mentor_id, member.developer_id, coalesce(p_assigned_date, current_date), true
    from unnest(requested) as member(developer_id)
      on conflict (mentor_id, developer_id) do nothing;

  return query
    select assignment.*
      from public.mentor_assignments assignment
     where assignment.mentor_id = p_mentor_id;
end;
$$;

comment on function public.set_mentor_assignments(uuid, uuid[], date) is
  'Replaces the developers assigned to one mentor, as one transaction, and returns the resulting rows. security invoker, so the admin-only mentor_assignments policies still decide whether the write happens.';

revoke all on function public.set_mentor_assignments(uuid, uuid[], date) from public, anon;

grant execute on function public.set_mentor_assignments(uuid, uuid[], date) to authenticated;

-- ---------------------------------------------------------------------------
-- project_developers
-- ---------------------------------------------------------------------------
-- The same shape with one step fewer: this table has no `active` column, and
-- no UPDATE policy, so there is nothing to revive — a member is present or
-- they are not. `returns void` because the caller reads the whole project back
-- afterwards regardless, membership included, through the embedded select it
-- already used.

create or replace function public.set_project_members(
  p_project_id uuid,
  p_developer_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  requested uuid[] := coalesce(p_developer_ids, '{}'::uuid[]);
begin
  delete from public.project_developers
   where project_id = p_project_id
     and not (developer_id = any (requested));

  insert into public.project_developers (project_id, developer_id)
  select distinct p_project_id, member.developer_id
    from unnest(requested) as member(developer_id)
      on conflict (project_id, developer_id) do nothing;
end;
$$;

comment on function public.set_project_members(uuid, uuid[]) is
  'Replaces the developers on one project, as one transaction. security invoker, so the project_developers policies still decide whether the write happens. Existing rows keep their created_at.';

revoke all on function public.set_project_members(uuid, uuid[]) from public, anon;

grant execute on function public.set_project_members(uuid, uuid[]) to authenticated;
