-- ---------------------------------------------------------------------------
-- Any write sweeps the bin, not only an update
-- ---------------------------------------------------------------------------
-- The purge triggers listened for UPDATE alone, on the reasoning that a soft
-- delete is an update and every arrival in the bin would therefore be seen. It
-- would be, but that is the wrong thing to depend on: what has to be seen is
-- not the arrival, it is some write fifteen days later to carry the pass that
-- removes it.
--
-- Most inserts do reach an update — logging a day of work recalculates its
-- task's hours, which updates `tasks` — but that is a chain of other triggers
-- holding retention up, and a later change to any link in it would break
-- cleanup somewhere far away, silently, in a way nothing would report. Adding
-- INSERT costs one guarded pass and removes the dependency: any write of any
-- kind to any table with a bin now sweeps all of them.
--
-- The function is unchanged; only the events these triggers fire on.

drop trigger if exists daily_updates_purge_bin on public.daily_updates;
create trigger daily_updates_purge_bin
  after insert or update on public.daily_updates
  for each statement execute function public.purge_expired_deletions();

drop trigger if exists tasks_purge_bin on public.tasks;
create trigger tasks_purge_bin
  after insert or update on public.tasks
  for each statement execute function public.purge_expired_deletions();

drop trigger if exists feedback_purge_bin on public.feedback;
create trigger feedback_purge_bin
  after insert or update on public.feedback
  for each statement execute function public.purge_expired_deletions();

drop trigger if exists developers_purge_bin on public.developers;
create trigger developers_purge_bin
  after insert or update on public.developers
  for each statement execute function public.purge_expired_deletions();

drop trigger if exists mentors_purge_bin on public.mentors;
create trigger mentors_purge_bin
  after insert or update on public.mentors
  for each statement execute function public.purge_expired_deletions();

drop trigger if exists projects_purge_bin on public.projects;
create trigger projects_purge_bin
  after insert or update on public.projects
  for each statement execute function public.purge_expired_deletions();
