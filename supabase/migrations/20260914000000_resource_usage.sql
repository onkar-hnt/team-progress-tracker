-- ---------------------------------------------------------------------------
-- What this project is using
-- ---------------------------------------------------------------------------
-- The free plan has caps, and the application had no way to say how close it was to
-- any of them. The honest answer to "are we about to run out" was to sign in to the
-- Supabase dashboard, which is a different account from the one an administrator of
-- this application necessarily has — so in practice nobody looked until something
-- stopped working.
--
-- ## What is measurable from inside the database, and what is not
--
-- Postgres knows its own size, and Storage keeps a row per object with the byte count
-- in it, so the two caps that actually bite a project like this one — 500 MB of
-- database and 1 GB of files — can be answered exactly. So can the number of accounts
-- and when the last write happened, which is the other free-plan hazard: a project
-- with no activity for a week is paused.
--
-- Egress, Edge Function invocations and realtime message counts cannot. Those are
-- metered by the platform rather than by the database, and reaching them means the
-- Management API and a personal access token — a credential that would have to live
-- somewhere this application could reach, which is a much larger decision than a
-- usage screen. The screen says so and links to the dashboard for them, rather than
-- inventing a number or quietly omitting the question.
--
-- ## Why one function returning json
--
-- Because it is one screen's worth of answers from four schemas: `pg_catalog` for the
-- sizes, `storage` for the files, `auth` for the accounts, `public` for the last
-- write. A view per answer would be four round trips and four sets of grants; a view
-- joining them would be a view nobody can read. The shape is the screen's, which is
-- the one case where that is the right thing for a function to return.
--
-- `security definer` because none of those schemas is readable by a signed-in client,
-- and deliberately so: `storage.objects` holds every file in the project and
-- `auth.users` holds every email and password hash. This function returns aggregates
-- over them and nothing else — a byte count, a row count, a timestamp — and it refuses
-- anybody who is not an administrator before it reads a single one of them.

create or replace function public.resource_usage()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  measured record;
  row_count bigint;
  tables jsonb := '[]'::jsonb;
  storage_bytes bigint;
  storage_objects bigint;
begin
  -- Before anything is read. The three schemas below are reachable from inside this
  -- function precisely because they are not reachable outside it, so this check is the
  -- whole security of it — not a courtesy mirroring a policy somewhere else.
  if not public.is_admin() then
    raise exception 'Only an administrator may read this project''s resource usage.'
      using errcode = '42501';
  end if;

  -- Every table in `public`, counted exactly rather than estimated.
  --
  -- `pg_class.reltuples` and `pg_stat_user_tables.n_live_tup` are both free and both
  -- misleading at this scale: they are planner statistics, so a table nothing has
  -- analysed yet reports zero rows while plainly occupying 48 kB, and a screen saying
  -- "0 rows, 48 kB" is a screen somebody has to be talked out of believing.
  --
  -- So this counts. That is a sequential scan per table, which is affordable because
  -- of what this is: one administrator opening one screen on demand, over tables that
  -- hold a team's work rather than a product's traffic. If a table here ever grows
  -- past a few million rows this is the line to revisit, and the estimate is what it
  -- would become.
  --
  -- Sizes are the total: heap, indexes, toast and free space, which is what the plan
  -- counts and therefore what the reader needs. Indexes are reported alongside,
  -- because "the table is fine, its indexes are four times its size" is a different
  -- problem with a different fix.
  for measured in
    select c.oid, c.relname
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
     order by c.relname
  loop
    execute pg_catalog.format('select count(*) from public.%I', measured.relname)
       into row_count;

    tables := tables || pg_catalog.jsonb_build_object(
      'name', measured.relname,
      'rows', row_count,
      'total_bytes', pg_catalog.pg_total_relation_size(measured.oid),
      'index_bytes', pg_catalog.pg_indexes_size(measured.oid)
    );
  end loop;

  -- Every bucket, not only this application's one. The cap is the project's, and an
  -- object left behind by something else still counts against it — which is exactly
  -- the kind of thing a usage screen exists to make visible.
  --
  -- The byte count lives in the object's `metadata` json rather than in a column, and
  -- is absent for a row written before its upload completed, so the sum coalesces.
  select coalesce(sum((o.metadata->>'size')::bigint), 0), count(*)
    into storage_bytes, storage_objects
    from storage.objects o;

  return pg_catalog.jsonb_build_object(
    'measured_at', pg_catalog.now(),

    'database_bytes', pg_catalog.pg_database_size(pg_catalog.current_database()),
    'tables', tables,

    'storage_bytes', storage_bytes,
    'storage_objects', storage_objects,

    -- Accounts, and the ones used lately. The second is this application's nearest
    -- honest equivalent of the plan's "monthly active users": the platform counts
    -- anybody whose session was refreshed, which the database does not record, so this
    -- counts logins that have signed in at all within the month. For a team of this
    -- size both numbers sit far below the cap, and showing them is how somebody comes
    -- to know that rather than assume it.
    'accounts', (select count(*) from auth.users),
    'accounts_active_30d', (
      select count(*)
        from auth.users u
       where u.last_sign_in_at > pg_catalog.now() - interval '30 days'
    ),

    -- The last time anything was written, from the audit trail — which has a trigger
    -- on every table holding work, so it is the one place that knows. Free-plan
    -- projects are paused after a week of inactivity, and paused is worse than full:
    -- nothing works at all, and somebody has to go and restore it by hand.
    'last_write_at', (select max(h.changed_at) from public.record_history h)
  );
end;
$$;

comment on function public.resource_usage is
  'Aggregate resource usage for the project: database and per-table sizes, storage bytes and object count, account counts, and the last write. Administrators only. Egress and function invocations are not measurable from here.';
