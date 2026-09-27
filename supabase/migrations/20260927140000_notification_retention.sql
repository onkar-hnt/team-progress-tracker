-- ---------------------------------------------------------------------------
-- The inbox forgets
-- ---------------------------------------------------------------------------
-- `notifications` was the one table with no way of losing a row. There is no
-- DELETE policy and no client call, which was deliberate — a notification is
-- evidence that somebody was told — but it left the only table in the schema
-- that grows with traffic rather than with head-count and never gives anything
-- back. Measured today it is 64 kB; unbounded, at two notifications per daily
-- update, it is the largest share of this project's growth.
--
-- Two windows rather than one, because a read notification and an unread one
-- are different things. Read is a closed matter: the panel showed it, somebody
-- looked, and nobody has ever gone back a month for it. Unread is still a claim
-- on that person's attention, so it outlives the other — but a quarter is long
-- past the point where the thing it asked for still matters.
--
-- Measured from `created_at`, which is the only timestamp the row has: `is_read`
-- is a flag with no date beside it. So a read notification's window runs from
-- when it arrived and not from when it was read, and one read on its last day
-- leaves at thirty just the same. Adding `read_at` to date the other event would
-- be a wider change than this is worth.

create or replace function public.notification_retention_days(p_is_read boolean)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p_is_read then 30 else 90 end;
$$;

comment on function public.notification_retention_days is
  'How long a notification is kept: thirty days once read, ninety while unread. The only place either window is written.';

-- The sweep's own index. Both existing indexes lead with `recipient_profile_id`
-- — they answer "newest for me", which is the panel's question — so neither can
-- serve an ordered scan across everybody, which is this one's. It costs a page
-- now, and it is what keeps the check below from reading the table.

create index if not exists notifications_created_at_idx
  on public.notifications (created_at);

-- ---------------------------------------------------------------------------
-- The sweep
-- ---------------------------------------------------------------------------
-- Same shape as `prune_record_history`: a statement trigger on the table
-- itself, so no other function can be revised in a way that drops the pruning,
-- and a capped batch so a pass cannot hold the table.
--
-- On insert *or* update, which is the correction `20260916120000` had to make to
-- the bin's triggers. A pass has to be carried by a write that happens after the
-- rows expire, and a quiet week with nothing new arriving is exactly when the
-- backlog is oldest. Marking one as read is the write that is always available.
--
-- Cut smaller than the log's 500 because of who is watching: every signed-in
-- client subscribes to `postgres_changes` on this table, and a delete of n rows
-- reaches each of them as n events, each one invalidating their notification
-- queries. In steady state a pass takes a handful of rows, so a hundred is far
-- more headroom than it needs and a burst nobody will feel.
--
-- The `exists` checks are not an optimisation of the deletes; they are what
-- makes the trigger free to have. It fires on every notification written and
-- every one marked read, and on all but a few of those there is nothing to do —
-- so the common case has to be two index range scans that stop at the first row,
-- rather than two ordered scans of the whole table.

create or replace function public.prune_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch constant integer := 100;
  v_read_cutoff timestamptz :=
    pg_catalog.now() - (public.notification_retention_days(true) || ' days')::interval;
  v_unread_cutoff timestamptz :=
    pg_catalog.now() - (public.notification_retention_days(false) || ' days')::interval;
begin
  if exists (
    select 1
      from public.notifications expired
     where expired.is_read
       and expired.created_at < v_read_cutoff
  ) then
    delete from public.notifications
     where id in (
       select expired.id
         from public.notifications expired
        where expired.is_read
          and expired.created_at < v_read_cutoff
        order by expired.created_at
        limit v_batch
     );
  end if;

  if exists (
    select 1
      from public.notifications expired
     where not expired.is_read
       and expired.created_at < v_unread_cutoff
  ) then
    delete from public.notifications
     where id in (
       select expired.id
         from public.notifications expired
        where not expired.is_read
          and expired.created_at < v_unread_cutoff
        order by expired.created_at
        limit v_batch
     );
  end if;

  return null;
end;
$$;

comment on function public.prune_notifications is
  'Drops notifications past notification_retention_days, a capped batch at a time, as new ones arrive or existing ones are read. security definer: the sweep belongs to the schema, not to whoever happened to write next.';

revoke all on function public.prune_notifications() from public, anon, authenticated;

-- A pass is a DELETE, and DELETE fires neither of these events, so it cannot
-- start a second pass inside the first. No recursion guard is needed here.

drop trigger if exists notifications_prune on public.notifications;

create trigger notifications_prune
  after insert or update on public.notifications
  for each statement execute function public.prune_notifications();

-- ---------------------------------------------------------------------------
-- Asking first
-- ---------------------------------------------------------------------------
-- What a window would take, before it takes it. Both numbers are zero the day
-- this is applied — the table was created on 13 September and cannot hold a row
-- older than a fortnight, so the thirty-day window has sixteen days to spare —
-- and the point of the function is the next time either number changes: edit
-- `notification_retention_days`, read this, then let the trigger run.
--
-- Administrators only, and modelled on `resource_usage`: counts across every
-- recipient's inbox are not something one person's session may otherwise read.

create or replace function public.notification_retention_preview()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_read_cutoff timestamptz :=
    pg_catalog.now() - (public.notification_retention_days(true) || ' days')::interval;
  v_unread_cutoff timestamptz :=
    pg_catalog.now() - (public.notification_retention_days(false) || ' days')::interval;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator may preview notification retention.'
      using errcode = '42501';
  end if;

  return pg_catalog.jsonb_build_object(
    'read_window_days', public.notification_retention_days(true),
    'unread_window_days', public.notification_retention_days(false),

    'total', (select pg_catalog.count(*) from public.notifications),
    'oldest_at', (select pg_catalog.min(n.created_at) from public.notifications n),

    'read_expiring', (
      select pg_catalog.count(*)
        from public.notifications n
       where n.is_read
         and n.created_at < v_read_cutoff
    ),
    'unread_expiring', (
      select pg_catalog.count(*)
        from public.notifications n
       where not n.is_read
         and n.created_at < v_unread_cutoff
    )
  );
end;
$$;

comment on function public.notification_retention_preview is
  'How many notifications the current windows would remove, and the age of the oldest row. Counts only; removes nothing. Administrators only.';

revoke all on function public.notification_retention_preview() from public, anon;
grant execute on function public.notification_retention_preview() to authenticated;

-- ---------------------------------------------------------------------------
-- The backlog, counted and left alone
-- ---------------------------------------------------------------------------
-- `20260916100000` cleared its backlog here in one uncapped pass, so its
-- triggers would start from empty. This one does not, for two reasons: there is
-- no backlog to clear, and a migration that deletes rows the first time anybody
-- applies it is the thing this feature is supposed to be careful about.
--
-- So the pass is a count. It prints what the windows match on whatever data this
-- is applied to — zero on this project today — and the trigger takes the first
-- row on its own, no earlier than the sixteenth of October.

do $$
declare
  v_read bigint;
  v_unread bigint;
  v_oldest timestamptz;
begin
  select pg_catalog.count(*) filter (
           where n.is_read
             and n.created_at < pg_catalog.now() - (public.notification_retention_days(true) || ' days')::interval
         ),
         pg_catalog.count(*) filter (
           where not n.is_read
             and n.created_at < pg_catalog.now() - (public.notification_retention_days(false) || ' days')::interval
         ),
         pg_catalog.min(n.created_at)
    into v_read, v_unread, v_oldest
    from public.notifications n;

  raise notice 'notification retention: % read past 30 days, % unread past 90 days, oldest row %. Nothing deleted by this migration.',
    v_read, v_unread, coalesce(v_oldest::text, 'none');
end;
$$;
