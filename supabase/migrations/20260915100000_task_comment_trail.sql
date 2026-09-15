-- ---------------------------------------------------------------------------
-- A task carries a conversation, not one mentor's note
-- ---------------------------------------------------------------------------
-- `public.feedback` already names a task, belongs to a developer, is soft
-- deleted, audited and notified. What it cannot express is who wrote a row:
-- `mentor_id` is both the attribution and the author, so the only person who
-- can add to somebody's record is a mentor, and a developer cannot answer.
--
-- Two columns settle that, and the table becomes the trail for a task: mentor
-- comments and developer replies, in the order they were written. A separate
-- table would have duplicated the task guard, the soft delete, the history
-- trigger and the bin, and would have left existing feedback outside the
-- conversation it belongs to.
--
-- `mentor_id` keeps its meaning — the mentor a comment is attributed to — and
-- becomes nullable, because a developer's reply is attributed to nobody and an
-- administrator need not hold a mentor record.

alter table public.feedback
  add column if not exists author_profile_id uuid
    references public.profiles (id) on delete set null,
  add column if not exists author_role text
    check (author_role in ('admin', 'mentor', 'developer'));

comment on column public.feedback.author_profile_id is
  'Who wrote this entry, stamped from auth.uid(). Null for rows written before the column existed whose mentor had no login, and for a login since deleted.';

comment on column public.feedback.author_role is
  'The capacity the author wrote in, so the trail can label an entry without inferring it from which id columns are set.';

-- Every row that exists was written by the mentor it names.
update public.feedback entry
   set author_profile_id = mentor.profile_id
  from public.mentors mentor
 where mentor.id = entry.mentor_id
   and entry.author_profile_id is null;

update public.feedback
   set author_role = 'mentor'
 where author_role is null;

-- Read on every entry in the trail to choose a label, so it is not left
-- nullable: the stamp below always has an answer, including for a write with no
-- session behind it.
alter table public.feedback
  alter column author_role set not null;

alter table public.feedback
  alter column mentor_id drop not null;

comment on column public.feedback.mentor_id is
  'The mentor the entry is attributed to. Null when the developer wrote it, or when an administrator with no mentor record did.';

-- The trail is read per task and in order, and the existing task index is
-- unordered, so it cannot serve the sort.
create index if not exists feedback_task_created_idx
  on public.feedback (task_id, created_at) where task_id is not null;

-- ---------------------------------------------------------------------------
-- The author is stamped, not submitted
-- ---------------------------------------------------------------------------
-- Authorship decides what the trail says about an entry and, through the
-- policies below, who may change it later. A client-supplied value would be a
-- claim; `auth.uid()` is the session. This follows `stamp_deletion` and
-- `record_change`, which record their actor the same way.
--
-- The role is read from `public.profiles` rather than inferred from the id
-- columns, because that is where a person's capacity is decided, and a mentor
-- writing about somebody they also manage is still writing as a mentor. The
-- fallback covers a write with no session — a migration or the service key —
-- where the shape of the row is the only evidence left.
--
-- An update carries the original author forward. An edit changes the text
-- somebody wrote, never who wrote it.

create or replace function public.stamp_feedback_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  if tg_op = 'UPDATE' then
    new.author_profile_id := old.author_profile_id;
    new.author_role := old.author_role;
    return new;
  end if;

  new.author_profile_id := auth.uid();

  select profile.role into v_role
    from public.profiles profile
   where profile.id = auth.uid();

  new.author_role := coalesce(
    v_role,
    case when new.mentor_id is null then 'developer' else 'mentor' end
  );

  return new;
end;
$$;

comment on function public.stamp_feedback_author is
  'Records who wrote a feedback entry and in what capacity, from the session rather than the payload. Carries both forward unchanged on update.';

drop trigger if exists feedback_stamp_author on public.feedback;

create trigger feedback_stamp_author
  before insert or update on public.feedback
  for each row execute function public.stamp_feedback_author();

-- ---------------------------------------------------------------------------
-- Who may add to the trail
-- ---------------------------------------------------------------------------
-- The mentor branch is unchanged in substance and is the business rule this
-- feature turns on: `can_view_developer` is satisfied by an active row in
-- `mentor_assignments`, so a mentor may comment on any task belonging to a
-- developer assigned to them, whoever created or assigned that task. It was
-- already written this way; only the interface treated feedback as something a
-- mentor left on work they had handed out.
--
-- The developer branch is new, and is deliberately narrower than the mentor's.
-- A developer may add an entry about their own work, on a task, attributed to
-- nobody. Requiring `task_id` keeps general feedback — the standing record of
-- how somebody is doing — written by mentors only; a developer replying to it
-- outside a task would be answering their own appraisal.
--
-- `author_profile_id = auth.uid()` holds because the trigger above has already
-- run: a BEFORE trigger shapes the row that `with check` then judges. Stated
-- anyway, so the policy is readable without knowing that.

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
      )
      or (
        mentor_id is null
        and task_id is not null
        and developer_id = public.current_developer_id()
      )
    )
  );

comment on policy feedback_insert on public.feedback is
  'A mentor writes about any developer assigned to them, on any of their tasks. A developer writes about their own work, on a task. Both are pinned to the session by author_profile_id.';

-- ---------------------------------------------------------------------------
-- Who may change an entry once written
-- ---------------------------------------------------------------------------
-- The same people as before, said in terms of the author rather than the
-- attributed mentor: an administrator, or whoever wrote it. The mentor clause
-- survives for rows backfilled above whose mentor had no login at the time,
-- which are the only rows where the author is unknown.
--
-- UPDATE is how soft delete and restore reach this table, so it stays; the
-- trail itself is immutable in the interface, which offers no edit for an entry
-- on a task.

create or replace function public.wrote_feedback(
  p_author_profile_id uuid,
  p_mentor_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_admin()
    or p_author_profile_id = auth.uid()
    or (
      p_author_profile_id is null
      and p_mentor_id is not null
      and p_mentor_id = public.current_mentor_id()
    );
$$;

comment on function public.wrote_feedback is
  'Whether the caller wrote a feedback entry, or administers the team. Falls back to the attributed mentor for rows that predate author_profile_id.';

revoke all on function public.wrote_feedback(uuid, uuid) from public, anon;
grant execute on function public.wrote_feedback(uuid, uuid) to authenticated;

drop policy if exists feedback_update on public.feedback;

create policy feedback_update on public.feedback
  for update to authenticated
  using (public.wrote_feedback(author_profile_id, mentor_id))
  with check (public.wrote_feedback(author_profile_id, mentor_id));

drop policy if exists feedback_delete on public.feedback;

create policy feedback_delete on public.feedback
  for delete to authenticated
  using (public.wrote_feedback(author_profile_id, mentor_id));

-- ---------------------------------------------------------------------------
-- Reading the trail for one task
-- ---------------------------------------------------------------------------
-- Another filter on the existing list function, so the trail is one request
-- that RLS still narrows. Dropped and recreated rather than replaced, because a
-- parameter cannot be added to a function in place, and left as one function
-- rather than an overload: PostgREST resolves an RPC by the names it is given,
-- and two candidates differing by a defaulted parameter are ambiguous.

drop function if exists public.list_feedback(date, date, uuid[], uuid[], uuid[]);

create or replace function public.list_feedback(
  p_date_from date default null,
  p_date_to date default null,
  p_developer_ids uuid[] default null,
  p_mentor_ids uuid[] default null,
  p_project_ids uuid[] default null,
  p_task_ids uuid[] default null
)
returns setof public.feedback
language sql
stable
security invoker
set search_path = ''
as $$
  select comment_row.*
    from public.feedback comment_row
   where (p_date_from is null or comment_row.feedback_date >= p_date_from)
     and (p_date_to is null or comment_row.feedback_date <= p_date_to)
     and (p_developer_ids is null or comment_row.developer_id = any (p_developer_ids))
     and (p_mentor_ids is null or comment_row.mentor_id = any (p_mentor_ids))
     and (p_project_ids is null or comment_row.project_id = any (p_project_ids))
     and (p_task_ids is null or comment_row.task_id = any (p_task_ids))
     and comment_row.deleted_at is null;
$$;

comment on function public.list_feedback(
  date, date, uuid[], uuid[], uuid[], uuid[]
) is
  'Feedback matching the given filters, each null meaning no filter. security invoker, so feedback_select decides which rows the caller sees.';

revoke all on function public.list_feedback(
  date, date, uuid[], uuid[], uuid[], uuid[]
) from public, anon;

grant execute on function public.list_feedback(
  date, date, uuid[], uuid[], uuid[], uuid[]
) to authenticated;

-- ---------------------------------------------------------------------------
-- Both sides of the conversation are notified
-- ---------------------------------------------------------------------------
-- One type covers the trail in both directions. The recipient and the wording
-- differ, but the concern does not — somebody added to a task you are working
-- on or responsible for — and two types would offer a person a preference for
-- half of a conversation.
--
-- `feedback_added` survives for general feedback, which is still a mentor
-- writing to a developer about their work rather than about a task, and is what
-- the existing preference line describes.

-- Both lists are column checks created without a name, so the name they carry
-- is Postgres's and not this schema's to assume. Found by the one value they
-- both contain and no other constraint does, rather than by a spelling that
-- would silently leave the old check in place beside the new one.

do $$
declare
  v_table text;
  v_name text;
begin
  foreach v_table in array array['notifications', 'user_preferences'] loop
    for v_name in
      select constraint_name.conname
        from pg_catalog.pg_constraint constraint_name
       where constraint_name.conrelid = ('public.' || v_table)::regclass
         and constraint_name.contype = 'c'
         and pg_catalog.pg_get_constraintdef(constraint_name.oid)
               like '%daily_update_submitted%'
    loop
      execute format('alter table public.%I drop constraint %I', v_table, v_name);
    end loop;
  end loop;
end;
$$;

alter table public.notifications
  add constraint notifications_type_check check (
    type in (
      'daily_update_submitted',
      'feedback_added',
      'task_assigned',
      'task_comment_added',
      'task_reassigned',
      'task_status_changed',
      'work_blocked'
    )
  );

alter table public.user_preferences
  add constraint user_preferences_muted_types_check check (
    muted_notification_types <@ array[
      'daily_update_submitted',
      'feedback_added',
      'task_assigned',
      'task_comment_added',
      'task_reassigned',
      'task_status_changed',
      'work_blocked'
    ]::text[]
  );

-- The trigger now reads the author to decide which way the notification goes.
-- A mentor's comment reaches the developer, as before. A developer's reply
-- reaches the mentors responsible for them — the same active-assignment loop
-- that daily updates use, because the audience is the same one.
--
-- Task-scoped entries point at the task rather than at the feedback row, so
-- following the notification opens the conversation it is about.

create or replace function public.notify_feedback_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author_name text;
  v_task_name text;
  v_developer_name text;
  v_developer_profile_id uuid;
  v_mentor_profile_id uuid;
  v_entity_type text;
  v_entity_id uuid;
begin
  select display_name into v_author_name
  from public.profiles
  where id = new.author_profile_id;

  if v_author_name is null then
    select name into v_author_name
    from public.mentors
    where id = new.mentor_id;
  end if;

  if new.task_id is not null then
    select name into v_task_name
    from public.tasks
    where id = new.task_id;
  end if;

  select name, profile_id into v_developer_name, v_developer_profile_id
  from public.developers
  where id = new.developer_id;

  v_entity_type := case when new.task_id is null then 'feedback' else 'task' end;
  v_entity_id := coalesce(new.task_id, new.id);

  if new.author_role = 'developer' then
    for v_mentor_profile_id in
      select mentor.profile_id
      from public.mentor_assignments assignment
      join public.mentors mentor on mentor.id = assignment.mentor_id
      where assignment.developer_id = new.developer_id
        and assignment.active
    loop
      perform public.enqueue_notification(
        v_mentor_profile_id,
        'task_comment_added',
        'Task update',
        coalesce(v_author_name, v_developer_name, 'A developer')
          || ' added an update to ' || coalesce(v_task_name, 'a task') || '.',
        v_entity_type,
        v_entity_id
      );
    end loop;

    return new;
  end if;

  perform public.enqueue_notification(
    v_developer_profile_id,
    case when new.task_id is null then 'feedback_added' else 'task_comment_added' end,
    case when new.task_id is null then 'New feedback' else 'New feedback on your task' end,
    coalesce(v_author_name, 'A mentor')
      || case
           when v_task_name is null then ' left feedback on your work.'
           else ' commented on ' || v_task_name || '.'
         end,
    v_entity_type,
    v_entity_id
  );

  return new;
end;
$$;

comment on function public.notify_feedback_added is
  'Notifies the other side of a task conversation: the developer when a mentor or administrator writes, and the developer''s active mentors when they reply.';
