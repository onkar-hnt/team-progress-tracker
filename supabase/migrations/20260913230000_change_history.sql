-- ---------------------------------------------------------------------------
-- What changed, who changed it, and what it was before
-- ---------------------------------------------------------------------------
-- The gap this closes was stated plainly in the README and is the one people ask
-- about first: a task says "completed" and nobody can say when it stopped saying
-- "in progress", or who moved it. Every table carries `updated_at`, which answers
-- when something last changed and nothing else — not which field, not from what,
-- and not by whom.
--
-- So one table records the diffs, filled by one trigger function attached to the six
-- tables that hold something worth accounting for: the three that hold written work,
-- and the three the roster is made of. The same six the bin covers, which is not a
-- coincidence — they are the records whose loss or silent edit somebody would have
-- to reconstruct by memory.
--
-- ## Diffs rather than snapshots
--
-- A row per change carrying only the fields that moved, rather than a copy of the
-- row before and after. It is smaller, and more usefully it is *readable*: the
-- screen wants "Status: in progress → completed", and deriving that from two
-- snapshots means diffing them in the browser every time anybody looks. The cost is
-- that the state at an arbitrary past moment cannot be reassembled from this table
-- alone, which is a thing a change log is asked for far less often than "who did
-- this".
--
-- An insert records no diff. Every field of a new record is "changed" in the sense
-- that it did not exist before, and writing all of them would drown the log in the
-- one entry where the fields are least interesting — the record itself is right
-- there. So a creation is recorded as the fact that it happened.
--
-- ## Deleting and restoring, rather than an update to `deleted_at`
--
-- The soft delete from the two previous migrations arrives here as an UPDATE that
-- sets one column. Recorded as such it would read "Deleted at: — → 2026-09-13", which
-- is technically what happened and not what anybody means. So those two updates are
-- named `delete` and `restore`, and the column they moved is left out of the diff.
--
-- ## Who may read it
--
-- The history of work follows the work: `can_view_developer` on the developer the
-- record is about, which is the same test the daily-update, task and feedback
-- policies apply, so nobody learns from the log about work they cannot see. The
-- history of the roster has no developer to test and goes to whoever maintains the
-- roster — `is_privileged()`, an administrator or a mentor.
--
-- There is no INSERT, UPDATE or DELETE policy, on purpose and not by omission. RLS
-- with no permissive policy for a command refuses every attempt at it, so no client
-- can add to this table, correct a line in it, or clear it. The trigger writes it as
-- the table's owner, which is the only writer it has.

create table if not exists public.record_history (
  id uuid primary key default gen_random_uuid(),

  -- The table, as its own name. Read by the client to decide what kind of record
  -- this is, so it is the schema's vocabulary crossing the boundary — the same
  -- trade the recycle bin makes, and for the same reason: six kinds have to be
  -- told apart somehow, and inventing a second set of names for them would need a
  -- mapping in both directions.
  table_name text not null check (
    table_name in ('daily_updates', 'developers', 'feedback', 'mentors', 'projects', 'tasks')
  ),

  record_id uuid not null,

  action text not null check (action in ('create', 'update', 'delete', 'restore')),

  /**
   * What the record is, in one line, as it was at the time.
   *
   * Denormalised deliberately. Without it, reading a page of history means fetching
   * every record it mentions, including the ones that have since been destroyed and
   * cannot be fetched at all — and the whole point of a log is to be readable after
   * the fact. It is a copy of a name at a moment, and it is not kept in step with
   * later renames, which is correct: the log says what somebody did to "Login page"
   * even if the task is called something else now.
   */
  subject text not null default '',

  /**
   * The developer the record is about, when it is about one.
   *
   * Carried on the row so the select policy is a single test rather than a lookup
   * into six tables, and so it still works for a record that has been destroyed.
   * Null for the roster tables, whose history is not about one person's work.
   */
  subject_developer_id uuid references public.developers (id) on delete set null,

  -- Not a foreign key, and 20260913233000 removed the one this had: the insert is in
  -- the same transaction as the write it records, so a reference that could be
  -- refused would refuse that write too.
  changed_by uuid,
  changed_at timestamptz not null default now(),

  /**
   * `{ "status": { "from": "in-progress", "to": "completed" } }`
   *
   * Values as JSON rather than as text, so a number stays a number and a null stays
   * a null instead of becoming the string "null" — which the screen would then have
   * to tell apart from somebody typing "null" into a field.
   */
  changes jsonb not null default '{}'::jsonb
);

comment on table public.record_history is
  'Field-level change history for the six tables worth accounting for. Written only by the record_change trigger; readable by whoever may see the record it is about.';

-- The log is read newest-first, either whole or for one record, and those are the
-- only two shapes the screens ask for.
create index if not exists record_history_changed_at_idx
  on public.record_history (changed_at desc);

create index if not exists record_history_record_idx
  on public.record_history (table_name, record_id, changed_at desc);

create index if not exists record_history_subject_developer_idx
  on public.record_history (subject_developer_id)
  where subject_developer_id is not null;

alter table public.record_history enable row level security;

drop policy if exists record_history_select on public.record_history;
create policy record_history_select on public.record_history
  for select to authenticated
  using (
    public.is_admin()
    or (
      subject_developer_id is not null
      and public.can_view_developer(subject_developer_id)
    )
    or (subject_developer_id is null and public.is_privileged())
  );

comment on policy record_history_select on public.record_history is
  'Work history follows who may see that developer''s work; roster history goes to whoever maintains the roster. No other policy exists, so the table is read-only to every client.';

-- ---------------------------------------------------------------------------
-- The columns nobody wants to read about
-- ---------------------------------------------------------------------------
-- `updated_at` moves on every single write, so recording it would put one useless
-- line in every diff. `id` cannot change. `created_at` and `code` are assigned once.
-- `deleted_at` and `deleted_by` are the delete itself, which is recorded as an
-- action rather than as a field.

create or replace function public.history_ignores(p_column text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_column in ('id', 'created_at', 'updated_at', 'code', 'deleted_at', 'deleted_by');
$$;

comment on function public.history_ignores is
  'Columns left out of a recorded diff, because they are either unchangeable or the change itself.';

-- ---------------------------------------------------------------------------
-- One trigger function for all six tables
-- ---------------------------------------------------------------------------
-- Generic through `to_jsonb(record)`, which is what makes one function possible: the
-- fields are compared as JSON keys rather than named, so a column added to any of
-- these tables is recorded from then on without this being touched. The price is
-- that a column *renamed* reads as one field emptied and another filled, which is
-- honest enough and rare.
--
-- `security definer` because no client has INSERT on `record_history` and none
-- should. The function is owned by the migration's role, which owns the table, so
-- the insert is the owner's and the absent insert policy does not stand in its way.
--
-- AFTER, unlike the guards and the stamps: a change is recorded once it has actually
-- happened. A BEFORE trigger would log writes that a later trigger or a deferred
-- constraint went on to refuse.

create or replace function public.record_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_json jsonb := '{}'::jsonb;
  after_json jsonb := '{}'::jsonb;

  -- The row that describes the record: the new one, except on a hard delete, where
  -- the old one is all there is.
  subject_json jsonb;

  resolved_action text;
  diff jsonb;
begin
  -- Assigned in statements rather than in the declarations, because `old` on an
  -- insert and `new` on a delete are not merely null — they are unassigned, and
  -- naming one raises before any branch is chosen.
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
    -- Reached when a record is destroyed from the bin, and for the tables that have
    -- no bin. Recorded rather than left out: it is the one change nothing else can
    -- evidence afterwards, since the row it happened to is gone.
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

    -- Nothing a person changed. Saving the same form twice, or a trigger writing
    -- `updated_at` and nothing else, should not appear in the log at all.
    if diff = '{}'::jsonb then
      return null;
    end if;
  else
    diff := '{}'::jsonb;
  end if;

  insert into public.record_history (
    table_name,
    record_id,
    action,
    subject,
    subject_developer_id,
    changed_by,
    changes
  )
  values (
    tg_table_name,
    (subject_json->>'id')::uuid,
    resolved_action,
    -- In the order the tables offer something readable: a name, the task an entry
    -- was about, the first line of a comment, and the code as a last resort so the
    -- line is never blank.
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
    auth.uid(),
    diff
  );

  return null;
end;
$$;

comment on function public.record_change is
  'Records one change to one record as a field-level diff. AFTER, so only changes that happened are logged, and security definer, because record_history has no insert policy for anybody.';

-- ---------------------------------------------------------------------------
-- Attached to the six
-- ---------------------------------------------------------------------------
-- `after insert or update or delete` on each, and `for each row`, because a diff is
-- per record: a statement-level trigger cannot say which of five rows moved.

drop trigger if exists daily_updates_record_change on public.daily_updates;
create trigger daily_updates_record_change
  after insert or update or delete on public.daily_updates
  for each row execute function public.record_change();

drop trigger if exists tasks_record_change on public.tasks;
create trigger tasks_record_change
  after insert or update or delete on public.tasks
  for each row execute function public.record_change();

drop trigger if exists feedback_record_change on public.feedback;
create trigger feedback_record_change
  after insert or update or delete on public.feedback
  for each row execute function public.record_change();

drop trigger if exists developers_record_change on public.developers;
create trigger developers_record_change
  after insert or update or delete on public.developers
  for each row execute function public.record_change();

drop trigger if exists mentors_record_change on public.mentors;
create trigger mentors_record_change
  after insert or update or delete on public.mentors
  for each row execute function public.record_change();

drop trigger if exists projects_record_change on public.projects;
create trigger projects_record_change
  after insert or update or delete on public.projects
  for each row execute function public.record_change();
