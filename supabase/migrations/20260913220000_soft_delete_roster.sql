-- ---------------------------------------------------------------------------
-- The roster keeps what it deletes too
-- ---------------------------------------------------------------------------
-- `20260913200000_soft_delete.sql` gave a bin to the three tables that hold
-- written work, and argued that the roster did not need one: employees, mentors
-- and projects are protected by `RESTRICT` foreign keys, so anybody with a
-- history cannot be deleted at all. That argument covers the loss that matters
-- and misses the one that happens. Deleting the wrong project from a list of
-- twenty is exactly as easy as deleting the wrong entry, and re-entering it
-- means its code, its client, its dates and its team — all of it retyped from
-- memory, because the row that had it is gone.
--
-- So these three now behave like the other three. A delete sets `deleted_at`,
-- the record leaves every list and every picker, and Recently deleted hands it
-- back whole.
--
-- ## What is deliberately unchanged: who may be deleted
--
-- A `RESTRICT` foreign key is not consulted by an UPDATE, so soft-deleting would
-- have quietly granted a power nobody asked for: removing an employee with two
-- hundred logged days from the roster. That is what deactivating is for — it
-- keeps the history and stops the access — and a delete that hides a person while
-- their work stays in every report is a worse answer than the refusal.
--
-- `guard_roster_deletion` therefore states in a trigger what the foreign keys
-- used to state on their own. It raises `23503` with the same DETAIL text
-- Postgres writes, so `mapPostgrestError` produces the same `RecordInUseError`
-- naming the same blocking table, and the message on screen does not change.
--
-- Two consequences worth naming rather than discovering:
--
--   * The check ignores work that is itself in the bin. An employee whose only
--     two entries were deleted last week can be deleted, which is the answer
--     somebody clearing up a mistaken record wants.
--   * Which means destroying that employee for good can fail while those entries
--     are still in the bin, because the real DELETE does consult the foreign key.
--     The bin reports it and says to destroy those first.
--
-- ## What is deliberately unchanged: the cascades
--
-- Nothing here reimplements `on delete cascade` or `on delete set null`. While a
-- mentor sits in the bin, the assignment rows naming them still exist and a task
-- still carries their `mentor_id`; destroying them applies the schema's actions
-- exactly as before. That is why the client resolves display names from an
-- unfiltered read of these tables — the roster *lists* drop deleted rows, the
-- *lookups* behind a name do not, so a task in the bin's shadow reads
-- "Priya Nair" rather than "Unknown (4f6c…)". Same rule as the joins in the
-- previous migration, for the same reason.

-- ---------------------------------------------------------------------------
-- The columns
-- ---------------------------------------------------------------------------

alter table public.developers
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

alter table public.mentors
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

alter table public.projects
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

comment on column public.developers.deleted_at is
  'When this employee record was deleted. Non-null rows appear only on the Recently deleted screen. Their logged work is untouched, and keeps resolving their name.';

comment on column public.mentors.deleted_at is
  'When this mentor record was deleted. Non-null rows appear only on the Recently deleted screen.';

comment on column public.projects.deleted_at is
  'When this project was deleted. Non-null rows appear only on the Recently deleted screen.';

create index if not exists developers_deleted_idx
  on public.developers (deleted_at desc)
  where deleted_at is not null;

create index if not exists mentors_deleted_idx
  on public.mentors (deleted_at desc)
  where deleted_at is not null;

create index if not exists projects_deleted_idx
  on public.projects (deleted_at desc)
  where deleted_at is not null;

-- ---------------------------------------------------------------------------
-- A deleted row stops holding an email address or an employee id
-- ---------------------------------------------------------------------------
-- These indexes become partial. Without it, deleting an employee and then adding
-- their replacement with the same address fails on a unique violation naming a row
-- that appears nowhere but the bin — and the person typing it has no way to tell
-- that from a genuine duplicate.
--
-- Restoring can now collide instead, and that is the right place for the
-- collision: it is a real conflict between two live rows, and
-- `UNIQUE_CONSTRAINT_MESSAGES` already explains it in those words.
--
-- `code` is left global. Codes come from a sequence, so two live rows cannot
-- collide, and an identifier that has appeared in an export should not be handed
-- to a second record later.

drop index if exists public.developers_email_key;
create unique index developers_email_key
  on public.developers (lower(email))
  where email is not null and deleted_at is null;

drop index if exists public.developers_employee_id_key;
create unique index developers_employee_id_key
  on public.developers (employee_id)
  where employee_id is not null and deleted_at is null;

drop index if exists public.mentors_email_key;
create unique index mentors_email_key
  on public.mentors (lower(email))
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- When, and by whom
-- ---------------------------------------------------------------------------
-- The same `stamp_deletion` the work tables use, so the timestamp comes from the
-- server and the actor from the session rather than from the request body. It is
-- unchanged and not redefined here.

drop trigger if exists developers_stamp_deletion on public.developers;
create trigger developers_stamp_deletion
  before update on public.developers
  for each row execute function public.stamp_deletion();

drop trigger if exists mentors_stamp_deletion on public.mentors;
create trigger mentors_stamp_deletion
  before update on public.mentors
  for each row execute function public.stamp_deletion();

drop trigger if exists projects_stamp_deletion on public.projects;
create trigger projects_stamp_deletion
  before update on public.projects
  for each row execute function public.stamp_deletion();

-- ---------------------------------------------------------------------------
-- Nothing may be put in the bin while something still points at it
-- ---------------------------------------------------------------------------
-- One function for the three tables, branching on `tg_table_name`. The
-- dependencies it checks are exactly the `RESTRICT` foreign keys in
-- `20260910181500_initial_schema.sql` and nothing else: the cascades and the
-- set-nulls are the schema's business, and they still happen on a real DELETE.
--
-- `security definer`, because a mentor may delete an employee but may not read
-- every daily update — asking "does any work reference this row" must not be
-- answered by what the asker can see. It reports only which table objected,
-- which is what the foreign key would have said.
--
-- Ordered cheapest-looking first, though each is an index probe and stops at the
-- first hit. Only the name of the objection differs.

create or replace function public.guard_roster_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  blocker text;
begin
  -- Only the transition into the bin. A restore, and any ordinary edit, is none
  -- of this function's business.
  if new.deleted_at is null or old.deleted_at is not null then
    return new;
  end if;

  if tg_table_name = 'developers' then
    if exists (
      select 1 from public.daily_updates d
       where d.developer_id = old.id and d.deleted_at is null
    ) then
      blocker := 'daily_updates';
    elsif exists (
      select 1 from public.tasks t
       where t.developer_id = old.id and t.deleted_at is null
    ) then
      blocker := 'tasks';
    elsif exists (
      select 1 from public.feedback f
       where f.developer_id = old.id and f.deleted_at is null
    ) then
      blocker := 'feedback';
    elsif exists (
      select 1 from public.mentor_assignments m where m.developer_id = old.id
    ) then
      blocker := 'mentor_assignments';
    elsif exists (
      select 1 from public.project_developers p where p.developer_id = old.id
    ) then
      blocker := 'project_developers';
    end if;

  elsif tg_table_name = 'mentors' then
    -- The only `RESTRICT` into mentors. Their assignments cascade and their
    -- projects and tasks fall to null, so none of those refuse a delete today.
    if exists (
      select 1 from public.feedback f
       where f.mentor_id = old.id and f.deleted_at is null
    ) then
      blocker := 'feedback';
    end if;

  elsif tg_table_name = 'projects' then
    if exists (
      select 1 from public.daily_updates d
       where d.project_id = old.id and d.deleted_at is null
    ) then
      blocker := 'daily_updates';
    elsif exists (
      select 1 from public.tasks t
       where t.project_id = old.id and t.deleted_at is null
    ) then
      blocker := 'tasks';
    end if;
  end if;

  if blocker is null then
    return new;
  end if;

  -- Written to match Postgres's own wording for a restricted delete, because the
  -- client reads the DETAIL to name the blocking table and one mapping should
  -- serve both. See `DEPENDENT_TABLE_PATTERN` in `supabase-errors.ts`.
  raise exception 'Key (id)=(%) is still referenced from table "%".', old.id, blocker
    using errcode = '23503',
          detail = format('Key (id)=(%s) is still referenced from table "%s".', old.id, blocker);
end;
$$;

comment on function public.guard_roster_deletion is
  'Refuses to put a roster row in the bin while live work references it, in the same terms the RESTRICT foreign keys used before deletes became recoverable.';

drop trigger if exists developers_guard_deletion on public.developers;
create trigger developers_guard_deletion
  before update on public.developers
  for each row execute function public.guard_roster_deletion();

drop trigger if exists mentors_guard_deletion on public.mentors;
create trigger mentors_guard_deletion
  before update on public.mentors
  for each row execute function public.guard_roster_deletion();

drop trigger if exists projects_guard_deletion on public.projects;
create trigger projects_guard_deletion
  before update on public.projects
  for each row execute function public.guard_roster_deletion();

-- ---------------------------------------------------------------------------
-- A deleted project cannot be assigned work
-- ---------------------------------------------------------------------------
-- `set_project_members` writes the team of a project by id. Every other write
-- path checks its references from the client, where the check can be reported
-- against the field that carried the id, but this one is a function taking a
-- project and a list — so the project is checked here.
--
-- The body below is `20260913070000_transactional_set_replacements.sql`'s,
-- unchanged, with the check in front of it. Its reasoning — one transaction, a
-- difference rather than a delete-and-reinsert, `security invoker` so the
-- `project_developers` policies still decide — is there and has not moved.
--
-- The message is plain rather than a mapped SQLSTATE: nothing in the interface
-- offers this, so anybody who reaches it is calling the function directly, and the
-- sentence is more use to them than a code.

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
  if not exists (
    select 1 from public.projects project
     where project.id = p_project_id
       and project.deleted_at is null
  ) then
    raise exception 'That project does not exist, or has been deleted.';
  end if;

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
  'Replaces the developers on one project, as one transaction, and refuses a project that has been deleted. security invoker, so the project_developers policies still decide whether the write happens.';
