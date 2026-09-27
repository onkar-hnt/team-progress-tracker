-- ---------------------------------------------------------------------------
-- Days that were never accounted for, and asking about them
-- ---------------------------------------------------------------------------
-- A missing daily update has so far been a calculation and nothing more: any
-- working day with no `daily_updates` row for a developer shows up in the
-- dashboard's list and disappears again the moment the range moves. Two things
-- were missing from that.
--
-- **A day can be accounted for without an update.** Somebody on leave has
-- nothing to report, and until now there was no way to say so — the day stayed
-- in the missing list for as long as anybody looked at it, which makes the list
-- worth less every time it is wrong. `leave_days` is that statement: one row per
-- developer per date, written by the person themselves or by an administrator.
--
-- It is deliberately not a `daily_updates` row with a special title. An entry
-- there is work on a task, and the triggers on that table create tasks, sync
-- their status and notify mentors; a day off would set all of it going.
--
-- **Somebody has to be able to ask.** A mentor who notices a gap could only
-- mention it outside the application. `send_daily_update_reminder` gives them
-- the one thing the browser cannot do for itself — write a notification to
-- another person — with the authorisation check the rest of this schema uses.

-- ---------------------------------------------------------------------------
-- Leave days
-- ---------------------------------------------------------------------------

create table if not exists public.leave_days (
  id uuid primary key default gen_random_uuid(),

  developer_id uuid not null references public.developers (id) on delete cascade,

  -- One statement per calendar day. The unique constraint is the whole of what
  -- stops a day being marked twice, so the client can mark without reading
  -- first and treat the conflict as "already said".
  leave_date date not null,

  -- Free text, and expected to be empty. The reason belongs to whoever took the
  -- leave; this exists so a note can be left, not so one can be required.
  note text,

  -- Who said so, which is not always whose day it was: an administrator may
  -- record it for somebody. Defaulted rather than sent, so the client never has
  -- to name itself, and pinned to the caller by the insert policy below.
  recorded_by uuid default auth.uid() references public.profiles (id) on delete set null,

  created_at timestamptz not null default now(),

  constraint leave_days_one_per_day unique (developer_id, leave_date),

  -- Tomorrow, not today, because the application works in the reader's own
  -- calendar day and the server counts in UTC. An evening in a zone ahead of
  -- UTC is already the next date locally, and refusing that would refuse a
  -- legitimate "I am on leave today". Beyond that a date is a typo.
  constraint leave_days_not_far_ahead check (leave_date <= current_date + 1)
);

comment on table public.leave_days is
  'Days a developer was on leave, which is why no daily update exists for them. One row per developer per date; written by the developer or by an administrator.';

comment on column public.leave_days.recorded_by is
  'The profile that marked the day, which may be an administrator rather than the developer whose day it was.';

-- Matches how the overview reads: one developer over a range of dates.
create index if not exists leave_days_developer_date_idx
  on public.leave_days (developer_id, leave_date desc);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- Read follows `daily_updates`: your own, anything if you administer, and a
-- mentor sees the developers assigned to them. Unlike an update, a leave day
-- names no project, so there is no project boundary to apply — which is correct
-- rather than convenient. A day off is not work on one project.
--
-- Write is narrower than read: marking somebody else's day as leave is a
-- statement about them, so it stays with the person themselves and with an
-- administrator. A mentor who believes a day was leave asks for an update
-- instead, which is what the reminder below is for.

alter table public.leave_days enable row level security;

drop policy if exists leave_days_select on public.leave_days;

create policy leave_days_select on public.leave_days
  for select to authenticated
  using (
    (select public.is_admin())
    or developer_id = (select public.current_developer_id())
    or (
      (select public.current_mentor_id()) is not null
      and public.can_view_developer(developer_id)
    )
  );

comment on policy leave_days_select on public.leave_days is
  'Own days, every day for an administrator, and the assigned developers for a mentor. The row-independent checks are scalar subqueries so they run once per statement rather than once per row.';

drop policy if exists leave_days_insert on public.leave_days;

create policy leave_days_insert on public.leave_days
  for insert to authenticated
  with check (
    (public.is_admin() or developer_id = public.current_developer_id())
    and (recorded_by is null or recorded_by = auth.uid())
  );

comment on policy leave_days_insert on public.leave_days is
  'The same rule as daily_updates_insert: a developer accounts for their own days, an administrator for anybody''s. A mentor cannot mark somebody as having been on leave. The second clause keeps recorded_by honest, since the column defaults to the caller and is otherwise whatever was sent.';

drop policy if exists leave_days_delete on public.leave_days;

create policy leave_days_delete on public.leave_days
  for delete to authenticated
  using (public.is_admin() or developer_id = public.current_developer_id());

comment on policy leave_days_delete on public.leave_days is
  'Marking the wrong day has to be undoable by whoever marked it, and the undo is the removal: the row says nothing else.';

-- No UPDATE policy. The row is a statement that a day was leave; changing which
-- day or whose it was is a different statement, made by removing this one.

revoke all on public.leave_days from anon;
grant select, insert, delete on public.leave_days to authenticated;

-- ---------------------------------------------------------------------------
-- A reminder is a notification type
-- ---------------------------------------------------------------------------
-- Added to both lists at once. The second is what lets somebody switch
-- reminders off, and `enqueue_notification` already refuses to write a muted
-- type, so no further check is needed to honour that.

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (
    type in (
      'daily_update_reminder',
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
  drop constraint if exists user_preferences_muted_types_check;

alter table public.user_preferences
  add constraint user_preferences_muted_types_check check (
    muted_notification_types <@ array[
      'daily_update_reminder',
      'daily_update_submitted',
      'feedback_added',
      'task_assigned',
      'task_comment_added',
      'task_reassigned',
      'task_status_changed',
      'work_blocked'
    ]::text[]
  );

-- ---------------------------------------------------------------------------
-- Asking one developer for their update
-- ---------------------------------------------------------------------------
-- `security definer`, because `enqueue_notification` is not callable from the
-- browser and must not become so: a notification addressed to somebody else is
-- a forgery unless something has checked who is asking. That check is here, and
-- it is the read rule — whoever may see a developer's work may ask them for it.
--
-- The wording is built here rather than passed in whole, so a reminder always
-- reads as a reminder and the sender is named from their profile rather than
-- from anything they typed. A message they add is appended as their own words.
--
-- Returns void. Whether a notification was written is not the sender's business:
-- the recipient may have muted reminders, and `enqueue_notification` drops those
-- silently by design.

create or replace function public.send_daily_update_reminder(
  p_developer_id uuid,
  p_message text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_sender text;
  v_note text := nullif(btrim(coalesce(p_message, '')), '');
begin
  if not (
    public.is_admin()
    or (
      public.current_mentor_id() is not null
      and public.can_view_developer(p_developer_id)
    )
  ) then
    raise exception 'You cannot send a reminder to this developer.'
      using errcode = '42501';
  end if;

  select developer.profile_id
    into v_profile_id
    from public.developers developer
   where developer.id = p_developer_id;

  -- Nothing to write to rather than nothing to say, so it is worth saying: a
  -- developer with no login cannot be reminded in the application at all.
  if v_profile_id is null then
    raise exception 'That developer has no login to notify.'
      using errcode = '22023';
  end if;

  select coalesce(nullif(btrim(profile.display_name), ''), 'Your mentor')
    into v_sender
    from public.profiles profile
   where profile.id = auth.uid();

  perform public.enqueue_notification(
    v_profile_id,
    'daily_update_reminder',
    'Your daily update is waiting',
    coalesce(v_sender, 'Your mentor')
      || ' asked you to submit your daily update.'
      || coalesce(' "' || v_note || '"', ''),
    null,
    null
  );
end;
$$;

comment on function public.send_daily_update_reminder(uuid, text) is
  'Sends one developer a reminder to submit their daily update. Callable by an administrator, or by a mentor who may see that developer. Honours the recipient''s notification preferences.';

revoke all on function public.send_daily_update_reminder(uuid, text) from public, anon;
grant execute on function public.send_daily_update_reminder(uuid, text) to authenticated;
