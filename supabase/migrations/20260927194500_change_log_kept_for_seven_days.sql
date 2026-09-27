-- ---------------------------------------------------------------------------
-- Seven days for the change log, fifteen still for the bin
-- ---------------------------------------------------------------------------
-- `retention_days` answered two questions with one number: how long a line in
-- the log is kept, and how long a deleted record stays restorable. They are not
-- the same question. A log line is read while somebody works out what happened
-- this week; a deleted record is restored when somebody notices it is missing,
-- which takes longer. Shortening the log should not shorten the window for
-- getting work back, so the log gets its own number and the bin keeps that one.

create or replace function public.history_retention_days()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 7;
$$;

comment on function public.history_retention_days is
  'How long a change log line is kept. Separate from retention_days, which is how long a deleted record stays restorable.';

comment on function public.retention_days is
  'How long a deleted record stays restorable before it is destroyed. The change log is kept for its own window, in history_retention_days.';

-- Only the cutoff changes. The trigger names this function, so it keeps working
-- without being re-created.

create or replace function public.prune_record_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.record_history
   where id in (
     select expired.id
       from public.record_history expired
      where expired.changed_at < now() - (public.history_retention_days() || ' days')::interval
      order by expired.changed_at
      limit 500
   );

  return null;
end;
$$;

comment on function public.prune_record_history is
  'Drops change log lines older than history_retention_days, a batch at a time, as new ones are written.';

revoke all on function public.prune_record_history() from public, anon, authenticated;

-- The eight days between the old window and the new one, once and uncapped, so
-- the capped passes do not have to work through them 500 lines at a time.

delete from public.record_history
 where changed_at < now() - (public.history_retention_days() || ' days')::interval;
