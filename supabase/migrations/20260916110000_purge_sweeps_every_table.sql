-- ---------------------------------------------------------------------------
-- A purge pass sweeps every table, not just the one that woke it
-- ---------------------------------------------------------------------------
-- Reading `tg_table_name` meant retention held for `tasks` and `daily_updates`,
-- which are written constantly, and quietly failed for the roster: a mentor
-- deleted once in months waits for another write to `mentors` that may never
-- come.
--
-- Dependent tables first, so removing expired feedback frees its expired task
-- in the same pass. Triggers are unchanged; they call this by name.

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
  'Destroys rows soft-deleted longer ago than retention_days, across every table with a bin, skipping any a foreign key still holds. Restoring clears deleted_at, which puts the row out of reach of this.';
