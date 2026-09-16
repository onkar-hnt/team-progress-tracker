-- ---------------------------------------------------------------------------
-- A purge pass sweeps every table, not just the one that woke it
-- ---------------------------------------------------------------------------
-- As first written, the pass read `tg_table_name` and cleaned only the table
-- whose update fired it. For `daily_updates` and `tasks` that is fine, because
-- they are written constantly. For the roster it is not: a mentor or project is
-- deleted once in months, and if nothing else in `mentors` is ever updated
-- again, the expired row waits indefinitely for a trigger that never fires.
-- Retention would then hold for the busy tables and quietly not for the others.
--
-- So a pass now sweeps all six, whichever table woke it. The cost is six index
-- lookups instead of one, on partial indexes that only cover deleted rows, and
-- still only once per transaction.
--
-- Dependent tables come first, which also makes a pass go further than before:
-- `RESTRICT` keys mean an expired task cannot be destroyed while its feedback
-- is still present, and taking feedback first frees the task within the same
-- pass rather than the next one.
--
-- The triggers are unchanged: they already call this function by name.

create or replace function public.purge_expired_deletions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cutoff timestamptz := now() - (public.retention_days() || ' days')::interval;
  v_table text;
  v_id uuid;
begin
  if coalesce(current_setting('app.purging_bin', true), '') = 'on' then
    return null;
  end if;

  perform set_config('app.purging_bin', 'on', true);

  foreach v_table in array array[
    'feedback', 'daily_updates', 'tasks', 'projects', 'mentors', 'developers'
  ] loop
    for v_id in
      execute format(
        'select id from public.%I where deleted_at < $1 order by deleted_at limit 25',
        v_table
      ) using v_cutoff
    loop
      begin
        execute format('delete from public.%I where id = $1', v_table) using v_id;
      exception
        when foreign_key_violation then
          null;
      end;
    end loop;
  end loop;

  perform set_config('app.purging_bin', 'off', true);

  return null;
end;
$$;

comment on function public.purge_expired_deletions is
  'Destroys rows soft-deleted longer ago than retention_days, across every table with a bin, skipping any a foreign key still holds. Restoring sets deleted_at back to null, which takes the row out of reach of this entirely.';
