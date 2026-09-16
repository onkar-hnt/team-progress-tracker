-- ---------------------------------------------------------------------------
-- Fifteen days, for the change log and for the bin
-- ---------------------------------------------------------------------------
-- Both only ever grew: `record_history` never lost a row, and a soft-deleted
-- row waited for somebody to destroy it by hand, which for work nobody misses
-- is never.
--
-- Triggers rather than `pg_cron`, because cron is per-project configuration
-- outside these migrations: a re-created project would carry the schema and
-- silently not the cleanup. Each pass is capped and indexed.

create or replace function public.retention_days()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 15;
$$;

comment on function public.retention_days is
  'How long a change log line is kept, and how long a deleted record stays restorable before it is destroyed.';

-- A trigger on the log itself rather than a line inside `record_change`, so a
-- later revision of that function cannot drop the pruning. Deleting from this
-- table fires nothing, so there is no recursion to guard against.

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
      where expired.changed_at < now() - (public.retention_days() || ' days')::interval
      order by expired.changed_at
      limit 500
   );

  return null;
end;
$$;

comment on function public.prune_record_history is
  'Drops change log lines older than retention_days, a batch at a time, as new ones are written.';

revoke all on function public.prune_record_history() from public, anon, authenticated;

drop trigger if exists record_history_prune on public.record_history;

create trigger record_history_prune
  after insert on public.record_history
  for each statement execute function public.prune_record_history();

-- The bin destroys what nobody restored.
--
-- Row at a time in its own block, because `RESTRICT` keys can refuse one: a
-- skipped row must not abort the unrelated write that triggered the pass, and
-- the next pass finds it again once its dependents have expired.
--
-- The flag keeps it to one pass per transaction. Destroying a daily update
-- recalculates its task's hours, which updates `tasks`, which would otherwise
-- start a second pass inside the first.

create or replace function public.purge_expired_deletions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cutoff timestamptz := now() - (public.retention_days() || ' days')::interval;
  v_id uuid;
begin
  if coalesce(current_setting('app.purging_bin', true), '') = 'on' then
    return null;
  end if;

  perform set_config('app.purging_bin', 'on', true);

  for v_id in
    execute format(
      'select id from public.%I where deleted_at < $1 order by deleted_at limit 50',
      tg_table_name
    ) using v_cutoff
  loop
    begin
      execute format('delete from public.%I where id = $1', tg_table_name) using v_id;
    exception
      when foreign_key_violation then
        null;
    end;
  end loop;

  perform set_config('app.purging_bin', 'off', true);

  return null;
end;
$$;

comment on function public.purge_expired_deletions is
  'Destroys rows soft-deleted longer ago than retention_days, skipping any a foreign key still holds. security definer: the purge belongs to the schema, not to whoever happened to write next.';

revoke all on function public.purge_expired_deletions() from public, anon, authenticated;

-- A purge is a DELETE and fires none of these, so it cannot run away.

drop trigger if exists daily_updates_purge_bin on public.daily_updates;
create trigger daily_updates_purge_bin
  after update on public.daily_updates
  for each statement execute function public.purge_expired_deletions();

drop trigger if exists tasks_purge_bin on public.tasks;
create trigger tasks_purge_bin
  after update on public.tasks
  for each statement execute function public.purge_expired_deletions();

drop trigger if exists feedback_purge_bin on public.feedback;
create trigger feedback_purge_bin
  after update on public.feedback
  for each statement execute function public.purge_expired_deletions();

drop trigger if exists developers_purge_bin on public.developers;
create trigger developers_purge_bin
  after update on public.developers
  for each statement execute function public.purge_expired_deletions();

drop trigger if exists mentors_purge_bin on public.mentors;
create trigger mentors_purge_bin
  after update on public.mentors
  for each statement execute function public.purge_expired_deletions();

drop trigger if exists projects_purge_bin on public.projects;
create trigger projects_purge_bin
  after update on public.projects
  for each statement execute function public.purge_expired_deletions();

-- The existing backlog, uncapped and once, so the triggers start from empty.
-- Dependent tables first, so an expired project whose work is also expired
-- goes in the same pass.

delete from public.record_history
 where changed_at < now() - (public.retention_days() || ' days')::interval;

do $$
declare
  v_table text;
  v_id uuid;
  v_cutoff timestamptz := now() - (public.retention_days() || ' days')::interval;
begin
  foreach v_table in array array[
    'feedback', 'daily_updates', 'tasks', 'projects', 'mentors', 'developers'
  ] loop
    for v_id in
      execute format('select id from public.%I where deleted_at < $1', v_table)
      using v_cutoff
    loop
      begin
        execute format('delete from public.%I where id = $1', v_table) using v_id;
      exception
        when foreign_key_violation then
          null;
      end;
    end loop;
  end loop;
end;
$$;
