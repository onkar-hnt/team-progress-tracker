-- ---------------------------------------------------------------------------
-- Any write sweeps the bin, not only an update
-- ---------------------------------------------------------------------------
-- Listening for UPDATE alone saw every arrival in the bin, but what has to be
-- seen is a write fifteen days later to carry the pass that removes it. Inserts
-- mostly reach an update through other triggers, which left retention resting
-- on that chain staying intact.
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
