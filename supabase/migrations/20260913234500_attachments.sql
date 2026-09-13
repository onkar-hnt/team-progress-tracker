-- ---------------------------------------------------------------------------
-- Files against a record
-- ---------------------------------------------------------------------------
-- Everything the application holds has been text somebody typed. A task saying "make
-- the export match the design" has nowhere to put the design; a developer reporting
-- that a build fails has nowhere to put the log. Both end up in a chat somewhere else,
-- which is exactly the split this application exists to close.
--
-- ## A metadata table beside the bucket, rather than the bucket alone
--
-- Storage could hold the files on its own, with the record id in the path. It is not
-- enough. Nothing would record who uploaded a file or when, listing a record's files
-- would mean a prefix search against a service that has no idea what a task is, and —
-- the part that decides it — who may *see* a file could only be expressed by parsing
-- its path inside a policy.
--
-- So `public.attachments` is the authority on what exists and who may see it, and the
-- bucket's policies defer to it: an object is readable exactly when a row for it is
-- readable. One rule, written once, in the place that can express it.
--
-- ## Which records can carry files
--
-- The three that hold written work. The roster cannot: an employee, a mentor and a
-- project are records *about* the work rather than the work itself, and a file
-- attached to a person is either a document about their employment — which does not
-- belong in a progress tracker — or a file about a piece of work, which belongs on
-- that piece of work.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments',
  'attachments',
  -- Private. A public bucket serves any object to anybody holding the url, which for
  -- a screenshot of somebody's failing build is not a decision this application gets
  -- to make on their behalf. Reads go through a signed url that expires.
  false,
  -- 10 MB. Large enough for a screenshot, a log, a spreadsheet or a short recording;
  -- small enough that a mistaken upload of a video is refused by the service rather
  -- than by a check in the browser that a determined caller could skip.
  10485760,
  -- The kinds of file this is for, named rather than left open. An executable or an
  -- archive attached to a task is either a mistake or an attack, and refusing it here
  -- means the refusal cannot be bypassed by a client that does not ask.
  array[
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/json',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),

  table_name text not null check (table_name in ('daily_updates', 'feedback', 'tasks')),

  record_id uuid not null,

  /**
   * Where the object is, and the only link between the two halves.
   *
   * Unique, because two rows claiming one object would let the second be deleted
   * while the first still offered it. The path is built by the client as
   * `table/record/uuid-filename`, and nothing depends on that shape except a person
   * reading a bucket listing — the trigger below derives what matters from the
   * columns, not from the text.
   */
  storage_path text not null unique,

  /** As it was on the uploader's machine, so it downloads under the name they know. */
  file_name text not null,

  content_type text,
  size_bytes bigint not null check (size_bytes > 0),

  uploaded_by uuid,
  created_at timestamptz not null default now(),

  /**
   * Whose work this file is about.
   *
   * Filled by `stamp_attachment_subject` from the record itself and never by the
   * client, which is what makes it safe to base the policies on. It is denormalised
   * for the same reason `record_history` denormalises it: the alternative is a policy
   * that reaches into one of three tables depending on a text column, evaluated for
   * every row of every listing.
   */
  subject_developer_id uuid references public.developers (id) on delete cascade
);

comment on table public.attachments is
  'Files attached to a task, a work entry or a piece of feedback. The authority on what exists and who may see it; the storage bucket''s policies defer to this table.';

create index if not exists attachments_record_idx
  on public.attachments (table_name, record_id, created_at desc);

create index if not exists attachments_subject_developer_idx
  on public.attachments (subject_developer_id);

-- ---------------------------------------------------------------------------
-- The subject is derived, not supplied
-- ---------------------------------------------------------------------------
-- A client that could choose `subject_developer_id` could attach a file to somebody
-- else's task and mark it as being about themselves — which the select policy would
-- then honour. So the column is overwritten from the record named by the other two,
-- and a row naming a record that does not exist is refused outright.
--
-- This is also the only integrity check the pair can have. `record_id` cannot be a
-- foreign key, because which table it points at is decided by a column beside it;
-- Postgres has no such constraint, so the check is a trigger.

create or replace function public.stamp_attachment_subject()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  subject uuid;
begin
  if new.table_name = 'tasks' then
    select t.developer_id into subject from public.tasks t where t.id = new.record_id;
  elsif new.table_name = 'daily_updates' then
    select d.developer_id into subject from public.daily_updates d where d.id = new.record_id;
  else
    select f.developer_id into subject from public.feedback f where f.id = new.record_id;
  end if;

  if subject is null then
    raise exception 'That record does not exist, so a file cannot be attached to it.'
      using errcode = '23503';
  end if;

  new.subject_developer_id := subject;

  -- Attribution is the server's, like every other stamp in this schema. A client
  -- that could name the uploader could name somebody else.
  new.uploaded_by := auth.uid();

  return new;
end;
$$;

comment on function public.stamp_attachment_subject is
  'Derives the developer an attachment is about from the record it names, and refuses a row naming no record. Also stamps the uploader.';

drop trigger if exists attachments_stamp_subject on public.attachments;

create trigger attachments_stamp_subject
  before insert on public.attachments
  for each row execute function public.stamp_attachment_subject();

-- ---------------------------------------------------------------------------
-- Who may see, add and remove a file
-- ---------------------------------------------------------------------------
-- Reading follows the work: `can_view_developer`, the same test the three tables of
-- written work apply, so a file is visible to exactly the people who can see the
-- record it hangs from.
--
-- Adding requires the same, and no more. A mentor attaching a specification to a
-- developer's task and a developer attaching a screenshot to their own entry are the
-- two cases this is for, and both are covered by "you can see the record".
--
-- Removing is narrower: whoever uploaded it, or an administrator. A mentor deleting a
-- developer's evidence, or a developer deleting a specification they were sent, are
-- both changes to somebody else's contribution — and unlike the records themselves
-- there is no bin here, so a deletion is final and the rule is drawn tighter.
--
-- There is no UPDATE policy. A file does not change; a different file is a different
-- attachment, and letting a row be repointed at another object would rewrite what
-- somebody uploaded while keeping their name against it.

alter table public.attachments enable row level security;

drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments
  for select to authenticated
  using (public.can_view_developer(subject_developer_id));

drop policy if exists attachments_insert on public.attachments;
create policy attachments_insert on public.attachments
  for insert to authenticated
  with check (
    -- Checked against the record rather than against the column, which the trigger
    -- has not yet overwritten at the time `with check` is evaluated. Both must hold:
    -- the row is refused unless the caller can see the developer the record belongs
    -- to, whatever they claimed in the column.
    public.can_view_developer(
      case table_name
        when 'tasks' then (select t.developer_id from public.tasks t where t.id = record_id)
        when 'daily_updates' then
          (select d.developer_id from public.daily_updates d where d.id = record_id)
        else (select f.developer_id from public.feedback f where f.id = record_id)
      end
    )
  );

drop policy if exists attachments_delete on public.attachments;
create policy attachments_delete on public.attachments
  for delete to authenticated
  using (uploaded_by = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- The bucket defers to the table
-- ---------------------------------------------------------------------------
-- Each policy asks whether a row exists for the object, and asks it as the caller —
-- so `attachments_select` above is what actually decides, and the storage rules stay
-- one line long and cannot drift from it.
--
-- The insert order this implies is worth stating, because it looks backwards: the row
-- is written first and the file uploaded second. An object with no row is invisible to
-- its own uploader, which is why the client deletes the row again if the upload fails
-- rather than leaving one behind.

drop policy if exists attachments_objects_select on storage.objects;
create policy attachments_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attachments'
    and exists (
      select 1 from public.attachments a where a.storage_path = storage.objects.name
    )
  );

drop policy if exists attachments_objects_insert on storage.objects;
create policy attachments_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and exists (
      select 1 from public.attachments a where a.storage_path = storage.objects.name
    )
  );

drop policy if exists attachments_objects_delete on storage.objects;
create policy attachments_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'attachments'
    -- The row is deleted first, so by the time the object is removed there is nothing
    -- left to defer to. `not exists` is therefore the condition: an orphaned object in
    -- this bucket is exactly what a caller is allowed to clear, and an object that
    -- still has a row is not — deleting a file means deleting its row, which
    -- `attachments_delete` guards.
    and not exists (
      select 1 from public.attachments a where a.storage_path = storage.objects.name
    )
  );
