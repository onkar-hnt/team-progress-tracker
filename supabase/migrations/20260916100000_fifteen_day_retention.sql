-- ---------------------------------------------------------------------------
-- Fifteen days, for the log and for the bin
-- ---------------------------------------------------------------------------
-- Two tables only ever grew. `record_history` gained a row for every write to
-- the six recorded tables and never lost one, and a soft-deleted row sat in the
-- bin until somebody opened that screen and destroyed it by hand — which, for
-- work nobody misses, is never. On a free project that is the storage that runs
-- out, and it runs out quietly: the rows that fill it are the ones nobody is
-- looking at.
--
-- Both now expire after fifteen days: a log line is dropped, and a deleted
-- record is destroyed unless somebody restored it first.
--
-- ## Why triggers and not a scheduled job
--
-- `pg_cron` would be the obvious home for this, and it is the wrong one here.
-- It is per-project configuration living outside the migrations, so a restored
-- or re-created project would carry the schema and silently not the cleanup,
-- which is the failure nobody notices until the disk is full again. Attaching
-- the work to the writes means the thing that grows each table is the thing
-- that trims it, in the same transaction, and it arrives with `db push`.
--
-- The cost is bounded rather than absent: each pass is capped, indexed, and
-- usually finds nothing.

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

-- ---------------------------------------------------------------------------
-- The change log drops what it has outlived
-- ---------------------------------------------------------------------------
-- A statement trigger on the log itself rather than a line inside
-- `record_change`, so the function that decides what a change *is* stays the
-- one thing it was, and pruning cannot be lost by a later revision of it.
--
-- Deleting from this table fires nothing, so there is no recursion to guard
-- against. Five hundred a pass keeps a long-idle project from charging one
-- unlucky developer for a month of expired rows; the writes after theirs take
-- the rest.

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

-- ---------------------------------------------------------------------------
-- The bin destroys what nobody restored
-- ---------------------------------------------------------------------------
-- One function for all six tables, reading `tg_table_name`, because the rule is
-- the same for each and a copy per table would be six places to correct.
--
-- Row at a time, each in its own block, because these tables are reached by
-- `RESTRICT` foreign keys: a project still carrying work, or a task whose
-- feedback is in the bin but not yet expired, cannot be destroyed today. Such a
-- row is left where it is rather than allowed to abort the write that triggered
-- the pass — a developer saving a daily update must not see it fail because an
-- unrelated old project has a dependent row. The next pass finds it again, and
-- by then the dependent row will have expired too.
--
-- Once per transaction, enforced by a transaction-local flag. Destroying a
-- daily update recalculates its task's hours, which updates `tasks`, which
-- would otherwise start a second pass from inside the first.

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

-- A soft delete is an UPDATE, so an update trigger sees every arrival in the
-- bin. A purge is a DELETE and fires none of these, which is the other half of
-- why this cannot run away.

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

-- ---------------------------------------------------------------------------
-- What has already outlived the window
-- ---------------------------------------------------------------------------
-- Uncapped here, once, so the triggers above start from an empty backlog. The
-- dependent tables are taken before the ones they point at, so a project whose
-- expired work is also expired goes in the same pass rather than waiting for
-- the next write.

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
