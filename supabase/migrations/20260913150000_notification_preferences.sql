-- ---------------------------------------------------------------------------
-- Notification preferences
-- ---------------------------------------------------------------------------
-- Which of the six notification types a person has switched off, and — because
-- `enqueue_notification` is the single place a notification is created — one
-- check that applies to all of them.
--
-- Three decisions shape this.
--
-- **Muting is enforced in the database, not the interface.** Filtering rows out
-- of the panel would leave them written, counted by the badge, and pushed over
-- the websocket to be filtered again on arrival. Refusing to write the row means
-- a muted notification costs nothing and cannot leak through a surface that
-- forgot to filter — the unread count being the obvious one.
--
-- **Stored as what is off, not what is on.** The default is therefore an empty
-- array and a new account receives everything, which is the behaviour that
-- existed before this table. Storing what is on would mean every row inserted
-- before a type was added silently opts out of it, and the person who never
-- opened this screen is the one who would notice least.
--
-- **`user_preferences`, not `notification_preferences`.** Anything else somebody
-- may set about their own use of the application belongs beside this as another
-- column, rather than as a third table with the same key and the same policies.
-- The name says that; today the table happens to hold one column.
--
-- Not on `public.profiles`, though the key is the same, because the two have
-- different owners. A profile's role and status are written by an administrator
-- and read by other people; a preference is written and read by nobody but its
-- holder. Keeping them apart is what lets the policies below be a single
-- comparison, without loosening anything on a table other people can read.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table if not exists public.user_preferences (
  -- Both the key and the owner. `auth.uid()` *is* the profile id, so every
  -- policy below is a comparison against this column rather than a lookup, and
  -- one row per person is a constraint rather than a convention.
  profile_id uuid primary key references public.profiles (id) on delete cascade,

  -- Constrained against the same six values as `notifications.type`, by
  -- containment rather than by a per-element trigger. An unrecognised value
  -- would be a preference for an event that cannot happen — harmless, but it
  -- would also be the first sign that this list and that one have drifted, and
  -- silence is the wrong response to that.
  muted_notification_types text[] not null default '{}' check (
    muted_notification_types <@ array[
      'daily_update_submitted',
      'feedback_added',
      'task_assigned',
      'task_reassigned',
      'task_status_changed',
      'work_blocked'
    ]::text[]
  ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.user_preferences is
  'Per-person settings, written and read only by their holder. muted_notification_types lists the notification types to suppress; empty means everything is delivered.';

-- Dropped first so the whole migration can be run twice, like the `if not
-- exists` above and the `drop policy if exists` below.
drop trigger if exists user_preferences_set_updated_at on public.user_preferences;

create trigger user_preferences_set_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- SELECT, INSERT and UPDATE, all pinned to the holder. INSERT is available here
-- unlike on `notifications`, and for the mirror-image reason: a notification
-- addressed to somebody else is a forgery, whereas a preference row can only
-- ever describe whoever wrote it — `with check` sees to that, and the primary
-- key means a second attempt is an update rather than a duplicate.
--
-- No DELETE. "Everything on" is the empty array, so removing the row expresses
-- nothing an update cannot, and a verb nobody needs is a verb that cannot be
-- misused. Rows go when the profile does, by cascade.

alter table public.user_preferences enable row level security;

drop policy if exists user_preferences_select on public.user_preferences;

create policy user_preferences_select on public.user_preferences
  for select to authenticated
  using (profile_id = auth.uid());

comment on policy user_preferences_select on public.user_preferences is
  'A profile reads its own preferences and no others. No administrator exception: what somebody chose not to be told is not team data.';

drop policy if exists user_preferences_insert on public.user_preferences;

create policy user_preferences_insert on public.user_preferences
  for insert to authenticated
  with check (profile_id = auth.uid());

drop policy if exists user_preferences_update on public.user_preferences;

create policy user_preferences_update on public.user_preferences
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

comment on policy user_preferences_update on public.user_preferences is
  'Restricted to the holder by using, and pinned to them by with check so a row cannot be re-addressed to somebody else.';

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on public.user_preferences from anon;
grant select, insert, update on public.user_preferences to authenticated;

-- ---------------------------------------------------------------------------
-- The mute check, in the one place notifications are created
-- ---------------------------------------------------------------------------
-- Identical to `20260913120000_notifications.sql` apart from the third guard.
-- Replaced whole rather than wrapped because every trigger already routes
-- through it, which is the property that makes one check here cover all six
-- types and any type added later.
--
-- The recipient's row is read despite the SELECT policy above, because
-- `security definer` runs as the owner. That is correct rather than a hole: the
-- question being asked is what the *recipient* chose, at a moment when the
-- person whose action triggered this is somebody else entirely. They learn
-- nothing either way — the function returns void, and a suppressed notification
-- is indistinguishable to them from one that was delivered.
--
-- Placed after the self-check, so the cheaper comparison still short-circuits
-- the common case of somebody moving their own task.

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

  if exists (
    select 1
    from public.user_preferences
    where profile_id = p_recipient_profile_id
      and p_type = any (muted_notification_types)
  ) then
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

-- Repeated rather than inherited. `create or replace` keeps the privileges the
-- function already had, so this changes nothing on a database that has run the
-- earlier migration — but it means the revoke cannot be lost by a future
-- replacement that forgets it, and a void-returning function is a PostgREST RPC
-- endpoint until it is taken away.
revoke all on function public.enqueue_notification(uuid, text, text, text, text, uuid)
  from public, anon, authenticated;

comment on function public.enqueue_notification(uuid, text, text, text, text, uuid) is
  'Internal. Called only by the notification triggers; drops anything addressed to the acting user or to a type they have muted. EXECUTE is revoked from every browser-reachable role because a void-returning function is a PostgREST RPC endpoint.';
