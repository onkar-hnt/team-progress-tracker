-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
-- A recipient's inbox: short, already-worded statements about something that
-- happened to their work, addressed to a profile rather than to a developer or
-- a mentor. Addressing profiles is what lets one row serve either audience, and
-- it is also what makes the security trivial — `auth.uid()` *is* the profile id,
-- so "your notifications" is a comparison against a column rather than a lookup
-- through `developers` or `mentors`.
--
-- Two decisions shape everything below.
--
-- **Rows are written by triggers, never by the client.** There is no INSERT
-- policy and no INSERT grant, so `authenticated` cannot create a notification
-- at all — not for themselves, and more importantly not for anybody else. A
-- client-side "notify the developer" call would have been a way to forge a
-- message from the application, and it would also have meant every caller
-- remembering to make it. Assignment happens in five places in the UI; the
-- trigger happens wherever the row changes.
--
-- **Only events somebody would act on.** Six types, listed on the `type`
-- constraint. Deliberately absent: anything derived (a task's `updated_at`),
-- anything the recipient did themselves, and anything that fires as a
-- consequence of something already notified. The last of those is not a matter
-- of taste — `sync_task_from_daily_update` rewrites `tasks.status` whenever a
-- developer files an update against a linked task, so a naive status trigger
-- would tell every developer about every one of their own updates. See
-- `enqueue_notification`, which is where that is stopped.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),

  -- `on delete cascade`: a notification is meaningless once its recipient is
  -- gone, and there is nobody left who is allowed to read it.
  recipient_profile_id uuid not null references public.profiles (id) on delete cascade,

  -- Constrained rather than free text. The UI chooses an icon and a
  -- destination from this value, so an unrecognised one would render as a
  -- notification nobody can act on. Adding a seventh type is a migration,
  -- which is the right amount of friction for something the client has to
  -- know how to display.
  type text not null check (
    type in (
      'daily_update_submitted',
      'feedback_added',
      'task_assigned',
      'task_reassigned',
      'task_status_changed',
      'work_blocked'
    )
  ),

  -- Worded at write time, in the database, because the wording depends on rows
  -- the recipient may not be able to read. A mentor's name, or the previous
  -- status of a task, would otherwise have to be fetched by the client and
  -- joined back to the notification — and for a developer, `can_view_mentor`
  -- may well say no.
  title text not null,
  message text not null,

  -- What the notification is about, for navigation. Nullable as a pair: a
  -- future type might not point at anything.
  entity_type text check (entity_type in ('daily_update', 'feedback', 'task')),
  entity_id uuid,

  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.notifications is
  'Per-recipient inbox. Written only by trigger functions; authenticated has no INSERT privilege and no INSERT policy.';

-- Serves the panel's "newest first for me" and, as a prefix, the unread count.
create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_profile_id, created_at desc);

-- The badge asks this question on every load and after every realtime event,
-- and for most people the answer is a handful of rows out of a long history.
create index if not exists notifications_recipient_unread_idx
  on public.notifications (recipient_profile_id)
  where not is_read;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- SELECT and UPDATE only, both pinned to the recipient. No INSERT policy and
-- no DELETE policy, so neither verb is available to `authenticated` however
-- the request is shaped.
--
-- `with check` on UPDATE is not redundant with `using`: without it the owner of
-- a row could re-address it to somebody else, which is the forgery the missing
-- INSERT policy exists to prevent, reached by a different route.

alter table public.notifications enable row level security;

drop policy if exists notifications_select on public.notifications;

create policy notifications_select on public.notifications
  for select to authenticated
  using (recipient_profile_id = auth.uid());

comment on policy notifications_select on public.notifications is
  'A profile reads its own notifications and no others. There is no mentor or admin exception: an inbox is not team data.';

drop policy if exists notifications_update on public.notifications;

create policy notifications_update on public.notifications
  for update to authenticated
  using (recipient_profile_id = auth.uid())
  with check (recipient_profile_id = auth.uid());

comment on policy notifications_update on public.notifications is
  'Marking read. Restricted to the recipient by using, and pinned to them by with check so a row cannot be re-addressed.';

-- ---------------------------------------------------------------------------
-- Only the read flag may change
-- ---------------------------------------------------------------------------
-- The UPDATE policy says who may write the row; it cannot say which columns.
-- Without this, a recipient could rewrite the title and message of their own
-- notification — harmless to everyone else, but it would turn an audit-shaped
-- record into something editable, and "the application said this" would stop
-- being true.
--
-- `security invoker`: the check reads only the two versions of the row it was
-- handed, so it needs no privileges of its own.

create or replace function public.guard_notification_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.recipient_profile_id is distinct from old.recipient_profile_id
    or new.type is distinct from old.type
    or new.title is distinct from old.title
    or new.message is distinct from old.message
    or new.entity_type is distinct from old.entity_type
    or new.entity_id is distinct from old.entity_id
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Only the read state of a notification may be changed'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists notifications_guard_update on public.notifications;

create trigger notifications_guard_update
  before update on public.notifications
  for each row execute function public.guard_notification_update();

-- ---------------------------------------------------------------------------
-- The one place a notification is created
-- ---------------------------------------------------------------------------
-- Every trigger below routes through this, so the two rules that apply to all
-- of them are stated once:
--
--   * **No recipient, no notification.** `profile_id` is nullable on both
--     `developers` and `mentors`: a record can exist before anybody has been
--     given a login for it. Those are the majority of nulls here, and they are
--     ordinary, not an error.
--
--   * **Nobody is told about their own action.** This is the load-bearing one.
--     A developer moving their own task to "In progress" does not need to be
--     informed of it, and — because `sync_task_from_daily_update` turns one
--     daily update into an UPDATE on `tasks` — without this check the status
--     trigger would fire on the developer's own submission every time. The
--     same check makes the assignment triggers quiet when a mentor assigns a
--     task to themselves in their developer capacity.
--
-- `security definer` because the caller has no INSERT privilege on the table,
-- which is the entire point. `auth.uid()` still reads the request's JWT inside
-- a definer function — the role changes, the claims do not.
--
-- Returns `void`, so PostgREST would publish it at /rest/v1/rpc/ and any
-- signed-in browser could forge a notification to any profile. The revoke
-- below is what prevents that, and it is not optional. Same reasoning as
-- `sync_business_code_sequences` in `20260910181500_initial_schema.sql`.

create or replace function public.enqueue_notification(
  p_recipient_profile_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_entity_type text,
  p_entity_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_recipient_profile_id is null then
    return;
  end if;

  if p_recipient_profile_id = auth.uid() then
    return;
  end if;

  insert into public.notifications (
    recipient_profile_id, type, title, message, entity_type, entity_id
  )
  values (
    p_recipient_profile_id, p_type, p_title, p_message, p_entity_type, p_entity_id
  );
end;
$$;

revoke all on function public.enqueue_notification(uuid, text, text, text, text, uuid)
  from public, anon, authenticated;

comment on function public.enqueue_notification(uuid, text, text, text, text, uuid) is
  'Internal. Called only by the notification triggers; EXECUTE is revoked from every browser-reachable role because a void-returning function is a PostgREST RPC endpoint.';

-- ---------------------------------------------------------------------------
-- Task assigned, and task reassigned
-- ---------------------------------------------------------------------------
-- `after insert or update of developer_id` narrows the firings; the guard below
-- narrows them again, because `update of` fires when a column appears in the
-- SET list even if the value is unchanged — and `set_task_status` sets several.

create or replace function public.notify_task_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
begin
  if new.developer_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.developer_id is not distinct from old.developer_id then
    return new;
  end if;

  select profile_id into v_profile_id
  from public.developers
  where id = new.developer_id;

  perform public.enqueue_notification(
    v_profile_id,
    case when tg_op = 'INSERT' then 'task_assigned' else 'task_reassigned' end,
    case when tg_op = 'INSERT' then 'New task assigned' else 'Task assigned to you' end,
    new.name || ' is now yours.',
    'task',
    new.id
  );

  return new;
end;
$$;

drop trigger if exists tasks_notify_assignment on public.tasks;

create trigger tasks_notify_assignment
  after insert or update of developer_id on public.tasks
  for each row execute function public.notify_task_assignment();

-- ---------------------------------------------------------------------------
-- Task status changed by somebody other than the assignee
-- ---------------------------------------------------------------------------
-- "By somebody else" is not tested here. `enqueue_notification` drops anything
-- addressed to the current user, which covers it exactly: a developer moving
-- their own task is silent, a mentor or admin moving it is not.
--
-- The status slugs are turned into the same sentence case the interface uses
-- (`not-started` becomes `Not started`) by transforming the value rather than
-- by listing the four of them, so this cannot drift out of step with
-- `TASK_STATUS_LABELS` the way a second copy of the mapping would.

create or replace function public.notify_task_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_from text;
  v_to text;
begin
  if new.developer_id is null then
    return new;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  select profile_id into v_profile_id
  from public.developers
  where id = new.developer_id;

  v_from := upper(left(replace(old.status, '-', ' '), 1)) || substr(replace(old.status, '-', ' '), 2);
  v_to := upper(left(replace(new.status, '-', ' '), 1)) || substr(replace(new.status, '-', ' '), 2);

  perform public.enqueue_notification(
    v_profile_id,
    'task_status_changed',
    'Task status changed',
    new.name || ': ' || v_from || ' to ' || v_to || '.',
    'task',
    new.id
  );

  return new;
end;
$$;

drop trigger if exists tasks_notify_status_change on public.tasks;

create trigger tasks_notify_status_change
  after update of status on public.tasks
  for each row execute function public.notify_task_status_change();

-- ---------------------------------------------------------------------------
-- Feedback recorded against a developer
-- ---------------------------------------------------------------------------
-- INSERT only. Feedback is edited to correct wording far more often than to say
-- something new, and a second notification for the same entry reads as a second
-- piece of feedback.
--
-- The mentor's name is resolved here because the developer may not be able to
-- read it themselves: `can_view_mentor` does not grant a developer sight of
-- every mentor, so a client-side join would show "someone left feedback".

create or replace function public.notify_feedback_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_mentor_name text;
begin
  select profile_id into v_profile_id
  from public.developers
  where id = new.developer_id;

  select name into v_mentor_name
  from public.mentors
  where id = new.mentor_id;

  perform public.enqueue_notification(
    v_profile_id,
    'feedback_added',
    'New feedback',
    coalesce(v_mentor_name, 'A mentor') || ' left feedback on your work.',
    'feedback',
    new.id
  );

  return new;
end;
$$;

drop trigger if exists feedback_notify_developer on public.feedback;

create trigger feedback_notify_developer
  after insert on public.feedback
  for each row execute function public.notify_feedback_added();

-- ---------------------------------------------------------------------------
-- Daily update submitted, to whoever mentors the developer
-- ---------------------------------------------------------------------------
-- Fans out over the active rows of `mentor_assignments`, which is the same
-- table `can_view_developer()` reads — so the people notified are exactly the
-- people entitled to look. A developer with no mentor produces no rows and no
-- notifications, which is correct rather than a gap.
--
-- A blocker raised on the update itself is folded into this one sentence rather
-- than sent as a second notification: it is one action by one person, and two
-- rows about it would be noise. A blocker raised *later* is a separate event
-- and does get its own — see the next trigger.

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
    select m.profile_id
    from public.mentor_assignments ma
    join public.mentors m on m.id = ma.mentor_id
    where ma.developer_id = new.developer_id
      and ma.active
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

drop trigger if exists daily_updates_notify_mentors on public.daily_updates;

create trigger daily_updates_notify_mentors
  after insert on public.daily_updates
  for each row execute function public.notify_daily_update_submitted();

-- ---------------------------------------------------------------------------
-- Work blocked after the fact
-- ---------------------------------------------------------------------------
-- The one kind of update to an existing entry a mentor needs to hear about,
-- because it is the one that asks them to do something. Only on the transition
-- into blocked: clearing a blocker, or saving the entry again while it is still
-- blocked, sends nothing.

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
    select m.profile_id
    from public.mentor_assignments ma
    join public.mentors m on m.id = ma.mentor_id
    where ma.developer_id = new.developer_id
      and ma.active
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

drop trigger if exists daily_updates_notify_blocked on public.daily_updates;

create trigger daily_updates_notify_blocked
  after update of is_blocked on public.daily_updates
  for each row execute function public.notify_work_blocked();

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
-- The blanket grant in the initial schema applied to the tables that existed
-- then, so this one needs its own — and it is deliberately narrower. SELECT to
-- read the inbox, UPDATE to mark rows read. No INSERT: the triggers own that.
-- No DELETE: nothing in the application deletes a notification, and a verb
-- nobody needs is a verb that cannot be misused.
--
-- The trigger functions are left executable by PUBLIC. All five return
-- `trigger`, which PostgREST cannot expose as an RPC, and revoking would make
-- every task and daily-update write depend on Postgres not re-checking EXECUTE
-- at fire time. `enqueue_notification` is the exception and is revoked above,
-- because it returns void.

revoke all on public.notifications from anon;
grant select, update on public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
-- Adds the table to Supabase's replication publication so the badge updates
-- without polling. Realtime applies the SELECT policy above to each subscriber
-- before delivering a row, so a socket cannot see further than a query could.
--
-- Guarded twice: the publication does not exist on a bare Postgres, and adding
-- a table already in it is an error — either would fail the migration on a
-- re-run or on a local instance.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'notifications'
    )
  then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
