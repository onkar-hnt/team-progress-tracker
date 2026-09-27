-- A record's name in the change log was stored as the first 120 characters of
-- whatever named it. For feedback that name is the comment itself, written in
-- the editor, so most of the 120 went on markup: `<h3>`, `<p>` and `</strong>`
-- spent the budget and the words ran out partway through a tag. What reached
-- the screen was half a sentence ending in `<str`.
--
-- The limit is raised to 600 and the markup is still kept, so the log can show
-- a comment with its formatting rather than a fragment of its source. It stays
-- a limit rather than becoming unbounded: a row is written here for every
-- change to every record, and read for fifteen days, so it is worth keeping
-- small.
--
-- Nothing else about the function changes.

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
    -- In the order the tables offer something readable: a name, the task an
    -- entry was about, the comment somebody left, and the code as a last
    -- resort so the line is never blank.
    left(
      coalesce(
        nullif(btrim(subject_json->>'name'), ''),
        nullif(btrim(subject_json->>'task_title'), ''),
        nullif(btrim(subject_json->>'comment'), ''),
        nullif(btrim(subject_json->>'code'), ''),
        ''
      ),
      600
    ),
    (subject_json->>'developer_id')::uuid,
    resolved_project_id,
    auth.uid(),
    diff
  );

  return null;
end;
$$;

comment on function public.record_change is
  'Records one change to one record as a field-level diff. AFTER, so only changes that happened are logged, and security definer, because record_history has no insert policy for anybody.';

-- ---------------------------------------------------------------------------
-- Extending the lines that were already cut
-- ---------------------------------------------------------------------------
-- Only where it can be proved they were cut, and never otherwise. A stored
-- subject is replaced when the live record's first 120 characters are exactly
-- it, which makes the longer value the same text with more of it. A record
-- renamed since therefore keeps the name it had at the time, which is the whole
-- reason this column is a copy and not a lookup.
--
-- A hard-deleted record has nothing left to read, so its line stays as it is.

do $$
declare
  v_updated integer;
  v_total integer := 0;
begin
  update public.record_history history
     set subject = left(btrim(source.comment), 600)
    from public.feedback source
   where history.table_name = 'feedback'
     and history.record_id = source.id
     and length(history.subject) = 120
     and left(btrim(source.comment), 120) = history.subject;

  get diagnostics v_updated = row_count;
  v_total := v_total + v_updated;
  raise notice 'Feedback lines extended: %', v_updated;

  update public.record_history history
     set subject = left(btrim(source.task_title), 600)
    from public.daily_updates source
   where history.table_name = 'daily_updates'
     and history.record_id = source.id
     and length(history.subject) = 120
     and left(btrim(source.task_title), 120) = history.subject;

  get diagnostics v_updated = row_count;
  v_total := v_total + v_updated;
  raise notice 'Work entry lines extended: %', v_updated;

  update public.record_history history
     set subject = left(btrim(source.name), 600)
    from public.tasks source
   where history.table_name = 'tasks'
     and history.record_id = source.id
     and length(history.subject) = 120
     and left(btrim(source.name), 120) = history.subject;

  get diagnostics v_updated = row_count;
  v_total := v_total + v_updated;
  raise notice 'Task lines extended: %', v_updated;

  update public.record_history history
     set subject = left(btrim(source.name), 600)
    from public.projects source
   where history.table_name = 'projects'
     and history.record_id = source.id
     and length(history.subject) = 120
     and left(btrim(source.name), 120) = history.subject;

  get diagnostics v_updated = row_count;
  v_total := v_total + v_updated;
  raise notice 'Project lines extended: %', v_updated;

  update public.record_history history
     set subject = left(btrim(source.name), 600)
    from public.developers source
   where history.table_name = 'developers'
     and history.record_id = source.id
     and length(history.subject) = 120
     and left(btrim(source.name), 120) = history.subject;

  get diagnostics v_updated = row_count;
  v_total := v_total + v_updated;
  raise notice 'Employee lines extended: %', v_updated;

  update public.record_history history
     set subject = left(btrim(source.name), 600)
    from public.mentors source
   where history.table_name = 'mentors'
     and history.record_id = source.id
     and length(history.subject) = 120
     and left(btrim(source.name), 120) = history.subject;

  get diagnostics v_updated = row_count;
  v_total := v_total + v_updated;
  raise notice 'Mentor lines extended: %', v_updated;

  raise notice 'Change log lines extended in total: %', v_total;
end;
$$;
