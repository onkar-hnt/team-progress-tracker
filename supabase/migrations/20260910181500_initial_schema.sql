-- Team Progress Tracker — initial schema
--
-- Replaces the Excel workbook as the primary store. The tables below are
-- derived from the domain models in `src/models`, which remain the source of
-- truth for the application: every column here exists because a model field
-- needs it, and the CHECK constraints repeat the `as const` unions in
-- `daily-work.model.ts`, `project.model.ts` and `user.model.ts` so that the
-- database refuses what TypeScript refuses.
--
-- Two identifier conventions live side by side:
--
--   `id`   a UUID, generated here, and the only relational key.
--   `code` the short human-readable reference (MEN001, DEV001, PRJ001,
--          TSK001, CMT001) that people read in the app and type into the
--          workbook. Generated from a sequence rather than by the client, so
--          two admins creating a record at the same moment cannot land on the
--          same code — which the previous `max + 1` scheme in
--          `record-query.ts` could.
--
-- Deletes are RESTRICT except where a row is genuinely part of its parent.
-- Removing a developer's tasks, comments and work history along with their
-- row would destroy exactly the data this application exists to keep, so the
-- database refuses and the application reports it.

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

-- Keeps `updated_at` honest. Doing this in a trigger rather than in the
-- repository means a hand-written SQL fix or an Excel import cannot forget it.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at is
  'Trigger function: stamps updated_at on every UPDATE.';

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
-- One row per Supabase Auth user, holding the role. The role lives here and
-- nowhere else: the browser can claim whatever it likes, but every RLS policy
-- reads this table, so authorisation is decided server-side.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null,

  role text not null default 'developer'
    check (role in ('admin', 'mentor', 'developer')),

  status text not null default 'active'
    check (status in ('active', 'inactive')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_email_key on public.profiles (lower(email));

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

comment on table public.profiles is
  'Application identity and role for each auth.users row. The only place a role is stored.';

-- ---------------------------------------------------------------------------
-- mentors
-- ---------------------------------------------------------------------------
-- A mentor is a separate record from their employee row, because a mentor may
-- exist without logging work themselves. `profile_id` links the record to a
-- sign-in, and is what the mentor RLS policies match on.

create sequence public.mentor_code_seq as bigint minvalue 1;

create table public.mentors (
  id uuid primary key default gen_random_uuid(),

  code text not null unique
    default 'MEN' || lpad(nextval('public.mentor_code_seq')::text, 3, '0'),

  -- Nullable: an admin can record a mentor before that person has an account.
  profile_id uuid unique references public.profiles (id) on delete set null,

  name text not null check (length(btrim(name)) > 0),
  email text not null,
  active boolean not null default true,

  created_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index mentors_email_key on public.mentors (lower(email));
create index mentors_active_idx on public.mentors (active);

create trigger mentors_set_updated_at
  before update on public.mentors
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
-- `active` and `status` are deliberately separate: `status` is where the
-- project stands in its life cycle, `active` controls whether it is still
-- offered in dropdowns. A completed project stays selectable for a while so
-- late entries can still be logged against it.

create sequence public.project_code_seq as bigint minvalue 1;

create table public.projects (
  id uuid primary key default gen_random_uuid(),

  code text not null unique
    default 'PRJ' || lpad(nextval('public.project_code_seq')::text, 3, '0'),

  name text not null check (length(btrim(name)) > 0),
  client text,
  description text,

  status text not null default 'planned'
    check (status in ('planned', 'active', 'on-hold', 'completed')),

  active boolean not null default true,

  start_date date,
  end_date date,

  -- The mentor accountable for the project, if any. SET NULL rather than
  -- RESTRICT: losing the mentor should not make the project undeletable.
  mentor_id uuid references public.mentors (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint projects_dates_ordered
    check (start_date is null or end_date is null or end_date >= start_date)
);

create index projects_mentor_id_idx on public.projects (mentor_id);
create index projects_status_idx on public.projects (status);

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- developers
-- ---------------------------------------------------------------------------
-- The Employees table. Three separate identity-ish columns, easily confused:
--
--   `employee_id`  payroll/HR reference, kept apart from the key so the
--                  relational key stays under this application's control even
--                  if HR renumbers people.
--   `role`         the person's job title, such as "Software Engineer".
--   `access_role`  what they may see. Unrelated to `role`.

create sequence public.developer_code_seq as bigint minvalue 1;

create table public.developers (
  id uuid primary key default gen_random_uuid(),

  code text not null unique
    default 'DEV' || lpad(nextval('public.developer_code_seq')::text, 3, '0'),

  profile_id uuid unique references public.profiles (id) on delete set null,

  name text not null check (length(btrim(name)) > 0),
  employee_id text,
  role text,
  location text,
  active boolean not null default true,

  email text,

  -- Absent rows are treated as developers by the application.
  access_role text check (access_role in ('admin', 'mentor', 'developer')),

  -- A convenience for reporting; the authoritative assignment list is
  -- `project_developers`, since people work on several projects.
  primary_project_id uuid references public.projects (id) on delete set null,

  created_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index developers_email_key
  on public.developers (lower(email)) where email is not null;

create unique index developers_employee_id_key
  on public.developers (employee_id) where employee_id is not null;

create index developers_active_idx on public.developers (active);
create index developers_primary_project_id_idx on public.developers (primary_project_id);

create trigger developers_set_updated_at
  before update on public.developers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- mentor_assignments
-- ---------------------------------------------------------------------------
-- Which developers each mentor reviews. One row per pair, with `active`
-- carrying the history: taking a mentor off a developer clears `active` and
-- keeps the record that they once mentored them, rather than deleting it.
--
-- `mentor_id` cascades because `DataProvider.deleteMentor` is documented as
-- removing that mentor's assignments, which would otherwise dangle.
-- `developer_id` restricts, so a developer cannot be deleted out from under
-- their mentoring history.

create table public.mentor_assignments (
  id uuid primary key default gen_random_uuid(),

  mentor_id uuid not null references public.mentors (id) on delete cascade,
  developer_id uuid not null references public.developers (id) on delete restrict,

  assigned_date date,
  active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint mentor_assignments_unique_pair unique (mentor_id, developer_id)
);

create index mentor_assignments_developer_id_idx
  on public.mentor_assignments (developer_id);

-- Serves the mentor-visibility lookup, which only ever asks for active rows.
create index mentor_assignments_active_idx
  on public.mentor_assignments (mentor_id, developer_id) where active;

create trigger mentor_assignments_set_updated_at
  before update on public.mentor_assignments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- project_developers
-- ---------------------------------------------------------------------------
-- Replaces the delimited `AssignedDevelopers` cell in the workbook. The
-- application reads and writes this as a whole set per project, which is why
-- `setMentorAssignments`-style replacement is safe here too.
--
-- CASCADE on the project: this is the project's own list of people, not
-- independent history, so deleting the project should take it with it.

create table public.project_developers (
  project_id uuid not null references public.projects (id) on delete cascade,
  developer_id uuid not null references public.developers (id) on delete restrict,

  created_at timestamptz not null default now(),

  primary key (project_id, developer_id)
);

create index project_developers_developer_id_idx
  on public.project_developers (developer_id);

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
-- A task is the *plan*: created by an admin, with a due date, living until it
-- is finished. A daily update is the *record* of what happened on one day.
-- Keeping them apart means assigned work can be tracked as overdue without
-- inventing a daily entry for it.

create sequence public.task_code_seq as bigint minvalue 1;

create table public.tasks (
  id uuid primary key default gen_random_uuid(),

  code text not null unique
    default 'TSK' || lpad(nextval('public.task_code_seq')::text, 3, '0'),

  name text not null check (length(btrim(name)) > 0),
  description text,

  project_id uuid not null references public.projects (id) on delete restrict,
  developer_id uuid not null references public.developers (id) on delete restrict,

  -- Usually the developer's mentor; kept on the row so reassignment is
  -- auditable rather than inferred from the current mapping.
  mentor_id uuid references public.mentors (id) on delete set null,

  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'critical')),

  status text not null default 'not-started'
    check (status in ('not-started', 'in-progress', 'completed', 'blocked')),

  created_date date not null default current_date,
  due_date date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_developer_id_idx on public.tasks (developer_id);
create index tasks_project_id_idx on public.tasks (project_id);
create index tasks_mentor_id_idx on public.tasks (mentor_id);

-- Serves the overdue and due-soon views, which filter on due date and status.
create index tasks_due_date_idx on public.tasks (due_date) where due_date is not null;
create index tasks_developer_status_idx on public.tasks (developer_id, status);

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- daily_updates
-- ---------------------------------------------------------------------------
-- One developer may log several entries for the same date, so `entry_date` is
-- not unique and must never be treated as a key.
--
-- `task_title` names the piece of work and stays the same across the days it
-- takes; `work_done` changes daily and is what a mentor reads to see movement.

create table public.daily_updates (
  id uuid primary key default gen_random_uuid(),

  developer_id uuid not null references public.developers (id) on delete restrict,
  project_id uuid not null references public.projects (id) on delete restrict,

  -- Maps to `DailyWorkEntry.date`; named for clarity in SQL.
  entry_date date not null,

  task_title text not null check (length(btrim(task_title)) > 0),
  description text,
  work_done text,
  planned_work text,

  status text not null default 'in-progress'
    check (status in ('not-started', 'in-progress', 'completed', 'blocked')),

  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'critical')),

  progress integer not null default 0 check (progress between 0 and 100),
  hours_spent numeric(5, 2) check (hours_spent is null or hours_spent >= 0),

  is_blocked boolean not null default false,
  blocker_description text,

  remarks text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index daily_updates_developer_date_idx
  on public.daily_updates (developer_id, entry_date desc);

create index daily_updates_project_id_idx on public.daily_updates (project_id);
create index daily_updates_entry_date_idx on public.daily_updates (entry_date desc);
create index daily_updates_blocked_idx on public.daily_updates (is_blocked) where is_blocked;

create trigger daily_updates_set_updated_at
  before update on public.daily_updates
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- feedback
-- ---------------------------------------------------------------------------
-- Mentor feedback recorded against a developer. Append-mostly history, but
-- editable: each row carries its own date so a developer's mentoring record
-- reads as a timeline. `project_id` is null for general, non-project feedback.

create sequence public.feedback_code_seq as bigint minvalue 1;

create table public.feedback (
  id uuid primary key default gen_random_uuid(),

  code text not null unique
    default 'CMT' || lpad(nextval('public.feedback_code_seq')::text, 3, '0'),

  developer_id uuid not null references public.developers (id) on delete restrict,
  mentor_id uuid not null references public.mentors (id) on delete restrict,
  project_id uuid references public.projects (id) on delete set null,

  -- Maps to `MentorComment.date`.
  feedback_date date not null default current_date,

  comment text not null check (length(btrim(comment)) > 0),
  progress_update text,
  blockers text,
  recommendations text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index feedback_developer_date_idx
  on public.feedback (developer_id, feedback_date desc);

create index feedback_mentor_id_idx on public.feedback (mentor_id);
create index feedback_project_id_idx on public.feedback (project_id);

create trigger feedback_set_updated_at
  before update on public.feedback
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Profile creation on sign-up
-- ---------------------------------------------------------------------------
-- Supabase writes to `auth.users`; this mirrors it into `public.profiles` so
-- that a role exists the moment an account does, and so no client code is
-- trusted to create one.
--
-- The bootstrap administrator is recognised by address. Not a secret, and it
-- is the same address configured in the application. Every later role change
-- is an explicit UPDATE by an admin — there is no path from the browser.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1)
    ),
    case when lower(new.email) = 'admin@handt.ai' then 'admin' else 'developer' end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Business code sequences after a bulk import
-- ---------------------------------------------------------------------------
-- An Excel import inserts explicit codes (MEN001…) that the sequences know
-- nothing about, so the next generated code would collide. Run this once
-- afterwards to move each sequence past the highest imported code.

create or replace function public.sync_business_code_sequences()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  spec record;
  next_value bigint;
begin
  for spec in
    select * from (values
      ('public.mentor_code_seq',    'MEN', 'mentors'),
      ('public.developer_code_seq', 'DEV', 'developers'),
      ('public.project_code_seq',   'PRJ', 'projects'),
      ('public.task_code_seq',      'TSK', 'tasks'),
      ('public.feedback_code_seq',  'CMT', 'feedback')
    ) as t (sequence_name, prefix, table_name)
  loop
    -- The offset is interpolated with %s, not %L. As a quoted literal it
    -- would select the `substring(text from text)` overload, which is POSIX
    -- regex matching, and the digits would be read as a pattern instead of a
    -- starting position.
    execute format(
      'select coalesce(max(substring(code from %s)::bigint), 0) + 1
         from public.%I
        where code ~ %L',
      length(spec.prefix) + 1,
      spec.table_name,
      '^' || spec.prefix || '[0-9]+$'
    ) into next_value;

    perform setval(spec.sequence_name, next_value, false);
  end loop;
end;
$$;

comment on function public.sync_business_code_sequences is
  'Moves each business-code sequence past the highest existing code. Run after an Excel import.';

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
-- `anon` gets nothing: an unauthenticated caller must not reach application
-- data, and RLS is the second line rather than the only one. `authenticated`
-- gets table privileges, and RLS policies (next migration) decide the rows.
--
-- Sequence USAGE is required because the `code` defaults call nextval().

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;

-- Functions are executable by PUBLIC unless told otherwise, and PostgREST
-- publishes them as RPC endpoints. `sync_business_code_sequences` returns
-- void, so it would be reachable at /rest/v1/rpc/... — it is an operator tool
-- run during an import, and nothing reachable from a browser may call it.
revoke all on function public.sync_business_code_sequences() from public, anon, authenticated;

-- `set_updated_at` and `handle_new_auth_user` are deliberately left alone.
-- Both return `trigger`, which PostgREST cannot expose as RPC, so revoking
-- adds no protection — and it would make every UPDATE depend on Postgres not
-- re-checking EXECUTE when a trigger fires (it checks at CREATE TRIGGER
-- instead). Not a dependency worth taking for nothing.
