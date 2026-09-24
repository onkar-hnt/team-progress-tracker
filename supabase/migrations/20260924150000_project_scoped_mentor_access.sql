-- ---------------------------------------------------------------------------
-- A mentor sees a developer only on the projects they are responsible for
-- ---------------------------------------------------------------------------
-- `mentor_assignments` already allows several mentors for one developer: the
-- unique key is the pair, not the developer. What it does not say is which
-- project that relationship covers. `projects.mentor_id` named a single
-- accountable mentor, so two mentors could not share a project, and
-- `can_view_developer()` treated an assignment as access to all of that
-- person's work.
--
-- `project_mentors` is the set of mentors responsible for a project.
-- `projects.mentor_id` stays as the primary mentor so existing reads keep a
-- single id. Visibility of work is the intersection:
--
--   * an active assignment between the mentor and the developer, and
--   * the mentor is responsible for the row's project.
--
-- The same developer on two projects under two mentors is visible to each
-- mentor only on their own project. Both mentors see the work when both are
-- responsible for that same project. A developer still sees all of their own
-- work. An administrator still sees everything.

create table public.project_mentors (
  project_id uuid not null references public.projects (id) on delete cascade,
  mentor_id uuid not null references public.mentors (id) on delete cascade,

  created_at timestamptz not null default now(),

  primary key (project_id, mentor_id)
);

create index project_mentors_mentor_id_idx
  on public.project_mentors (mentor_id);

comment on table public.project_mentors is
  'Mentors responsible for a project. A developer assigned to one of these mentors is visible to that mentor on this project only.';

insert into public.project_mentors (project_id, mentor_id)
select id, mentor_id
  from public.projects
 where mentor_id is not null
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Who is responsible for a project
-- ---------------------------------------------------------------------------

create or replace function public.mentor_covers_project(
  p_mentor_id uuid,
  p_project_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_mentor_id is not null
    and p_project_id is not null
    and (
      exists (
        select 1
          from public.project_mentors pm
         where pm.project_id = p_project_id
           and pm.mentor_id = p_mentor_id
      )
      or exists (
        select 1
          from public.projects project
         where project.id = p_project_id
           and project.mentor_id = p_mentor_id
      )
    );
$$;

comment on function public.mentor_covers_project(uuid, uuid) is
  'Whether a mentor is responsible for a project, via project_mentors or the primary projects.mentor_id.';

create or replace function public.mentor_responsible_for_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.mentor_covers_project(public.current_mentor_id(), target_project_id);
$$;

comment on function public.mentor_responsible_for_project(uuid) is
  'Whether the signed-in mentor is responsible for the project.';

create or replace function public.project_has_responsible_mentor(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
        from public.project_mentors pm
       where pm.project_id = target_project_id
    )
    or exists (
      select 1
        from public.projects project
       where project.id = target_project_id
         and project.mentor_id is not null
    );
$$;

comment on function public.project_has_responsible_mentor(uuid) is
  'Whether any mentor is responsible for the project. Unassigned projects stay visible to roster managers so they can be given one.';

-- A mentor sees another developer's work on a project only when both the
-- assignment and the project responsibility hold. Their own rows, and an
-- administrator's, are not limited by project.
create or replace function public.can_view_developer_on_project(
  target_developer_id uuid,
  target_project_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_admin()
    or target_developer_id = public.current_developer_id()
    or (
      public.current_mentor_id() is not null
      and public.mentor_responsible_for_project(target_project_id)
      and exists (
        select 1
          from public.mentor_assignments assignment
         where assignment.developer_id = target_developer_id
           and assignment.mentor_id = public.current_mentor_id()
           and assignment.active
      )
    );
$$;

comment on function public.can_view_developer_on_project(uuid, uuid) is
  'Whether the caller may see one developer''s work on one project. Admins and the developer themselves are unrestricted; a mentor needs an active assignment and responsibility for the project.';

-- Drop the clause that opened a project because any visible developer was a
-- member of it. That is what showed Mentor 1 the project Mentor 2 is
-- responsible for, whenever they shared a developer.
create or replace function public.can_view_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_admin()
    or public.mentor_responsible_for_project(target_project_id)
    or exists (
      select 1
        from public.project_developers member
       where member.project_id = target_project_id
         and member.developer_id = public.current_developer_id()
    )
    or (
      public.is_privileged()
      and not public.project_has_responsible_mentor(target_project_id)
    );
$$;

comment on function public.can_view_project is
  'Whether the caller may see a project: an admin, a responsible mentor, a developer assigned to it, or a roster manager while it has no mentor yet.';

revoke all on function public.mentor_covers_project(uuid, uuid) from public, anon;
revoke all on function public.mentor_responsible_for_project(uuid) from public, anon;
revoke all on function public.project_has_responsible_mentor(uuid) from public, anon;
revoke all on function public.can_view_developer_on_project(uuid, uuid) from public, anon;

grant execute on function public.mentor_covers_project(uuid, uuid) to authenticated;
grant execute on function public.mentor_responsible_for_project(uuid) to authenticated;
grant execute on function public.project_has_responsible_mentor(uuid) to authenticated;
grant execute on function public.can_view_developer_on_project(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Keeping the primary mentor inside the set
-- ---------------------------------------------------------------------------
-- A write that only sets `projects.mentor_id` — an older client, a hand edit —
-- still has to grant that mentor the project. The creating mentor is added on
-- insert so the row can be read back: RETURNING is subject to the select
-- policy, which now requires responsibility. `set_project_mentors` is what
-- replaces the whole set.

create or replace function public.sync_project_mentor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and public.current_mentor_id() is not null then
    insert into public.project_mentors (project_id, mentor_id)
    values (new.id, public.current_mentor_id())
    on conflict do nothing;
  end if;

  if new.mentor_id is not null
    and (tg_op = 'INSERT' or new.mentor_id is distinct from old.mentor_id)
  then
    insert into public.project_mentors (project_id, mentor_id)
    values (new.id, new.mentor_id)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

comment on function public.sync_project_mentor is
  'Adds projects.mentor_id to project_mentors, and on insert the mentor who created the row so they can read it back.';

drop trigger if exists projects_sync_mentor on public.projects;

create trigger projects_sync_mentor
  after insert or update of mentor_id on public.projects
  for each row execute function public.sync_project_mentor();

revoke all on function public.sync_project_mentor() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- project_mentors policies
-- ---------------------------------------------------------------------------

alter table public.project_mentors enable row level security;

revoke all on public.project_mentors from anon;
grant select, insert, delete on public.project_mentors to authenticated;

drop policy if exists project_mentors_select on public.project_mentors;
create policy project_mentors_select on public.project_mentors
  for select to authenticated
  using (
    public.is_admin()
    or mentor_id = public.current_mentor_id()
    or public.mentor_responsible_for_project(project_id)
  );

comment on policy project_mentors_select on public.project_mentors is
  'A mentor reads the mentors of projects they are responsible for, and their own rows. They do not learn who mentors a project they are not on.';

drop policy if exists project_mentors_insert on public.project_mentors;
create policy project_mentors_insert on public.project_mentors
  for insert to authenticated
  with check (
    public.is_admin()
    or public.mentor_responsible_for_project(project_id)
    or (
      public.is_privileged()
      and not public.project_has_responsible_mentor(project_id)
    )
  );

drop policy if exists project_mentors_delete on public.project_mentors;
create policy project_mentors_delete on public.project_mentors
  for delete to authenticated
  using (
    public.is_admin()
    or public.mentor_responsible_for_project(project_id)
  );

-- ---------------------------------------------------------------------------
-- Replacing the mentors of one project
-- ---------------------------------------------------------------------------

create or replace function public.set_project_mentors(
  p_project_id uuid,
  p_mentor_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  requested uuid[] := coalesce(p_mentor_ids, '{}'::uuid[]);
  primary_mentor uuid;
begin
  delete from public.project_mentors
   where project_id = p_project_id
     and not (mentor_id = any (requested));

  insert into public.project_mentors (project_id, mentor_id)
  select distinct p_project_id, member.mentor_id
    from unnest(requested) as member(mentor_id)
  on conflict do nothing;

  select member.mentor_id into primary_mentor
    from unnest(requested) as member(mentor_id)
   limit 1;

  update public.projects
     set mentor_id = primary_mentor
   where id = p_project_id
     and mentor_id is distinct from primary_mentor;
end;
$$;

comment on function public.set_project_mentors(uuid, uuid[]) is
  'Replaces the mentors responsible for one project and stores the first as projects.mentor_id. security invoker, so the project_mentors policies decide the write.';

revoke all on function public.set_project_mentors(uuid, uuid[]) from public, anon;
grant execute on function public.set_project_mentors(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Projects and membership
-- ---------------------------------------------------------------------------
-- `is_privileged()` no longer opens every project. A mentor administers the
-- projects they are responsible for, and an unassigned project until it has a
-- mentor. Administrators are covered by `can_view_project`.

drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select to authenticated
  using (public.can_view_project(id));

drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects
  for update to authenticated
  using (
    public.is_admin()
    or public.mentor_responsible_for_project(id)
    or (
      public.is_privileged()
      and not public.project_has_responsible_mentor(id)
    )
  )
  with check (public.is_admin() or public.is_privileged());

comment on policy projects_update on public.projects is
  'Admins edit any project. A mentor edits a project they are responsible for, or one that has no mentor yet. They cannot open a project that already belongs to someone else.';

drop policy if exists project_developers_select on public.project_developers;
create policy project_developers_select on public.project_developers
  for select to authenticated
  using (
    public.is_admin()
    or developer_id = public.current_developer_id()
    or public.can_view_developer_on_project(developer_id, project_id)
    or (
      public.is_privileged()
      and public.mentor_responsible_for_project(project_id)
    )
  );

comment on policy project_developers_select on public.project_developers is
  'A mentor sees membership of projects they are responsible for, and a developer sees their own. Membership of another mentor''s project is not returned.';

drop policy if exists project_developers_insert on public.project_developers;
create policy project_developers_insert on public.project_developers
  for insert to authenticated
  with check (
    public.is_admin()
    or public.mentor_responsible_for_project(project_id)
    or (
      public.is_privileged()
      and not public.project_has_responsible_mentor(project_id)
    )
  );

drop policy if exists project_developers_delete on public.project_developers;
create policy project_developers_delete on public.project_developers
  for delete to authenticated
  using (
    public.is_admin()
    or public.mentor_responsible_for_project(project_id)
    or (
      public.is_privileged()
      and not public.project_has_responsible_mentor(project_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Work rows
-- ---------------------------------------------------------------------------

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated
  using (public.can_view_developer_on_project(developer_id, project_id));

comment on policy tasks_select on public.tasks is
  'A mentor reads a task only when they are assigned to its developer and responsible for its project. The task''s own mentor_id does not widen that.';

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (
    public.is_admin()
    or (
      public.current_mentor_id() is not null
      and public.can_view_developer_on_project(developer_id, project_id)
    )
  );

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update to authenticated
  using (
    public.is_admin()
    or (
      public.current_mentor_id() is not null
      and public.can_view_developer_on_project(developer_id, project_id)
    )
  )
  with check (
    public.is_admin()
    or (
      public.current_mentor_id() is not null
      and public.can_view_developer_on_project(developer_id, project_id)
    )
  );

comment on policy tasks_update on public.tasks is
  'Admins edit any task. A mentor edits a task only on a project they are responsible for, for a developer assigned to them, and cannot move it onto a project they are not.';

drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks
  for delete to authenticated
  using (
    public.is_admin()
    or (
      public.current_mentor_id() is not null
      and public.can_view_developer_on_project(developer_id, project_id)
    )
  );

drop policy if exists daily_updates_select on public.daily_updates;
create policy daily_updates_select on public.daily_updates
  for select to authenticated
  using (public.can_view_developer_on_project(developer_id, project_id));

comment on policy daily_updates_select on public.daily_updates is
  'Daily updates follow the same project boundary as tasks. A developer still reads every update of their own.';

drop policy if exists feedback_select on public.feedback;
create policy feedback_select on public.feedback
  for select to authenticated
  using (
    public.is_admin()
    or developer_id = public.current_developer_id()
    or (
      project_id is not null
      and public.can_view_developer_on_project(developer_id, project_id)
    )
    or (
      project_id is null
      and public.can_view_developer(developer_id)
    )
  );

comment on policy feedback_select on public.feedback is
  'Feedback tied to a project is visible to the mentors responsible for that project. Feedback with no project stays with every mentor assigned to the developer. The developer reads all of their own.';

drop policy if exists feedback_insert on public.feedback;
create policy feedback_insert on public.feedback
  for insert to authenticated
  with check (
    author_profile_id = auth.uid()
    and (
      public.is_admin()
      or (
        mentor_id = public.current_mentor_id()
        and public.can_view_developer(developer_id)
        and (
          project_id is null
          or public.can_view_developer_on_project(developer_id, project_id)
        )
      )
      or (
        mentor_id is null
        and task_id is not null
        and developer_id = public.current_developer_id()
      )
    )
  );

comment on policy feedback_insert on public.feedback is
  'A mentor comments on an assigned developer only for a project they are responsible for. A developer still replies on their own tasks.';

-- Status changes go through this function, which does not consult the update
-- policy. The same project test has to live here or a mentor could move a
-- task they are not allowed to read.
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
    or task_row.developer_id = public.current_developer_id()
    or (
      public.current_mentor_id() is not null
      and public.can_view_developer_on_project(task_row.developer_id, task_row.project_id)
    )
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
  'Sets a task status for an admin, the assignee, or a mentor responsible for that task''s project. A deleted task reads as not found.';

-- ---------------------------------------------------------------------------
-- A task created from a daily update is attributed to a mentor of that project
-- ---------------------------------------------------------------------------

create or replace function public.ensure_daily_update_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_task_id uuid;
  v_mentor_id uuid;
begin
  if new.task_id is not null then
    return new;
  end if;

  v_title := btrim(new.task_title);

  if v_title = '' then
    return new;
  end if;

  select task.id into v_task_id
    from public.tasks task
   where task.developer_id = new.developer_id
     and task.project_id = new.project_id
     and lower(btrim(task.name)) = lower(v_title)
     and task.deleted_at is null
   order by task.created_at desc
   limit 1;

  if v_task_id is null then
    select assignment.mentor_id into v_mentor_id
      from public.mentor_assignments assignment
     where assignment.developer_id = new.developer_id
       and assignment.active
       and public.mentor_covers_project(assignment.mentor_id, new.project_id)
     order by assignment.assigned_date desc nulls last, assignment.created_at
     limit 1;

    if v_mentor_id is null then
      select assignment.mentor_id into v_mentor_id
        from public.mentor_assignments assignment
       where assignment.developer_id = new.developer_id
         and assignment.active
       order by assignment.assigned_date desc nulls last, assignment.created_at
       limit 1;
    end if;

    insert into public.tasks (
      name, project_id, developer_id, mentor_id, status, created_date, estimated_hours
    )
    values (
      v_title,
      new.project_id,
      new.developer_id,
      v_mentor_id,
      new.status,
      new.entry_date,
      new.estimated_hours
    )
    returning id into v_task_id;
  end if;

  new.task_id := v_task_id;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Notifications name only the mentors who may read the project
-- ---------------------------------------------------------------------------

create or replace function public.notify_daily_update_submitted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_developer_name text;
  v_message text;
  v_mentor_profile_id uuid;
begin
  select name into v_developer_name
    from public.developers
   where id = new.developer_id;

  v_message := coalesce(v_developer_name, 'A developer')
    || ' submitted an update for '
    || to_char(new.entry_date, 'FMDD Mon YYYY')
    || '.';

  if new.is_blocked then
    v_message := v_message || ' Work is flagged as blocked.';
  end if;

  for v_mentor_profile_id in
    select mentor.profile_id
      from public.mentor_assignments assignment
      join public.mentors mentor on mentor.id = assignment.mentor_id
     where assignment.developer_id = new.developer_id
       and assignment.active
       and public.mentor_covers_project(assignment.mentor_id, new.project_id)
  loop
    perform public.enqueue_notification(
      v_mentor_profile_id,
      'daily_update_submitted',
      'Daily update submitted',
      v_message,
      'daily_update',
      new.id
    );
  end loop;

  return new;
end;
$$;

comment on function public.notify_daily_update_submitted is
  'Tells the mentors who are assigned to the developer and responsible for the update''s project. Other mentors of the same developer are not notified.';

create or replace function public.notify_work_blocked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_developer_name text;
  v_message text;
  v_mentor_profile_id uuid;
begin
  if not new.is_blocked or old.is_blocked then
    return new;
  end if;

  if pg_catalog.pg_trigger_depth() > 1 then
    return new;
  end if;

  select name into v_developer_name
    from public.developers
   where id = new.developer_id;

  v_message := coalesce(v_developer_name, 'A developer')
    || ' flagged a blocker on '
    || to_char(new.entry_date, 'FMDD Mon YYYY')
    || '.';

  if new.blocker_description is not null then
    v_message := v_message || ' ' || new.blocker_description;
  end if;

  for v_mentor_profile_id in
    select mentor.profile_id
      from public.mentor_assignments assignment
      join public.mentors mentor on mentor.id = assignment.mentor_id
     where assignment.developer_id = new.developer_id
       and assignment.active
       and public.mentor_covers_project(assignment.mentor_id, new.project_id)
  loop
    perform public.enqueue_notification(
      v_mentor_profile_id,
      'work_blocked',
      'Work blocked',
      v_message,
      'daily_update',
      new.id
    );
  end loop;

  return new;
end;
$$;

comment on function public.notify_work_blocked is
  'Tells the mentors responsible for the entry''s project about a blocker raised on it. Silent when the flag was set by a task-status sync, and silent for mentors of the developer on other projects.';

-- ---------------------------------------------------------------------------
-- Change history follows the project of the work
-- ---------------------------------------------------------------------------

alter table public.record_history
  add column if not exists subject_project_id uuid;

comment on column public.record_history.subject_project_id is
  'The project the change is about, copied onto the row so a destroyed record can still be filtered. Null for roster changes that are not about one project.';

create index if not exists record_history_subject_project_idx
  on public.record_history (subject_project_id)
  where subject_project_id is not null;

update public.record_history history
   set subject_project_id = task.project_id
  from public.tasks task
 where history.table_name = 'tasks'
   and history.record_id = task.id
   and history.subject_project_id is null;

update public.record_history history
   set subject_project_id = entry.project_id
  from public.daily_updates entry
 where history.table_name = 'daily_updates'
   and history.record_id = entry.id
   and history.subject_project_id is null;

update public.record_history history
   set subject_project_id = feedback.project_id
  from public.feedback feedback
 where history.table_name = 'feedback'
   and history.record_id = feedback.id
   and history.subject_project_id is null
   and feedback.project_id is not null;

update public.record_history
   set subject_project_id = record_id
 where table_name = 'projects'
   and subject_project_id is null;

create or replace function public.record_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_json jsonb := '{}'::jsonb;
  after_json jsonb := '{}'::jsonb;
  subject_json jsonb;
  resolved_action text;
  diff jsonb;
  resolved_project_id uuid;
begin
  if tg_op <> 'INSERT' then
    before_json := to_jsonb(old);
  end if;

  if tg_op <> 'DELETE' then
    after_json := to_jsonb(new);
  end if;

  subject_json := case when tg_op = 'DELETE' then before_json else after_json end;

  if tg_op = 'INSERT' then
    resolved_action := 'create';
  elsif tg_op = 'DELETE' then
    resolved_action := 'delete';
  elsif before_json->>'deleted_at' is null and after_json->>'deleted_at' is not null then
    resolved_action := 'delete';
  elsif before_json->>'deleted_at' is not null and after_json->>'deleted_at' is null then
    resolved_action := 'restore';
  else
    resolved_action := 'update';
  end if;

  if resolved_action = 'update' then
    select coalesce(
      jsonb_object_agg(
        key,
        jsonb_build_object('from', before_json -> key, 'to', after_json -> key)
      ),
      '{}'::jsonb
    )
      into diff
      from jsonb_object_keys(before_json || after_json) as changed(key)
     where not public.history_ignores(changed.key)
       and (before_json -> changed.key) is distinct from (after_json -> changed.key);

    if diff = '{}'::jsonb then
      return null;
    end if;
  else
    diff := '{}'::jsonb;
  end if;

  if tg_table_name = 'projects' then
    resolved_project_id := (subject_json->>'id')::uuid;
  elsif subject_json->>'project_id' is not null and subject_json->>'project_id' <> '' then
    resolved_project_id := (subject_json->>'project_id')::uuid;
  else
    resolved_project_id := null;
  end if;

  insert into public.record_history (
    table_name,
    record_id,
    action,
    subject,
    subject_developer_id,
    subject_project_id,
    changed_by,
    changes
  )
  values (
    tg_table_name,
    (subject_json->>'id')::uuid,
    resolved_action,
    left(
      coalesce(
        nullif(btrim(subject_json->>'name'), ''),
        nullif(btrim(subject_json->>'task_title'), ''),
        nullif(btrim(subject_json->>'comment'), ''),
        nullif(btrim(subject_json->>'code'), ''),
        ''
      ),
      120
    ),
    (subject_json->>'developer_id')::uuid,
    resolved_project_id,
    auth.uid(),
    diff
  );

  return null;
end;
$$;

drop policy if exists record_history_select on public.record_history;
create policy record_history_select on public.record_history
  for select to authenticated
  using (
    public.is_admin()
    or (
      subject_developer_id is not null
      and subject_developer_id = public.current_developer_id()
    )
    or (
      subject_developer_id is not null
      and subject_project_id is not null
      and public.can_view_developer_on_project(subject_developer_id, subject_project_id)
    )
    or (
      subject_developer_id is not null
      and subject_project_id is null
      and public.current_mentor_id() is null
      and public.can_view_developer(subject_developer_id)
    )
    or (
      subject_developer_id is null
      and subject_project_id is null
      and public.is_privileged()
    )
    or (
      subject_developer_id is null
      and subject_project_id is not null
      and public.can_view_project(subject_project_id)
    )
  );

comment on policy record_history_select on public.record_history is
  'Work history follows who may see that developer on that project. Project history follows who may see the project. Roster history with no project stays with whoever maintains the roster.';
