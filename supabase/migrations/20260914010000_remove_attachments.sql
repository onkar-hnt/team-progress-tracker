-- ---------------------------------------------------------------------------
-- No files. Text only.
-- ---------------------------------------------------------------------------
-- 20260913234500 gave tasks, work entries and feedback a private bucket to hang files
-- from. This takes it away again, and the reason is the plan rather than the design:
-- this project is on the free tier, where storage is 1 GB and — the part that runs out
-- first — egress is 5 GB a month, which every download of every file is charged
-- against. A team attaching screenshots to daily updates would spend both on evidence
-- that a sentence usually carries better anyway.
--
-- So the application stores what people write and nothing else. That is a smaller
-- product, and it is a product that keeps working: a database of text for a team of this
-- size lives inside 500 MB for years, while a shared folder of screenshots does not live
-- inside 1 GB for long.
--
-- ## What this removes, in dependency order
--
-- The bucket's policies first, because they are written against `storage.objects` and
-- would otherwise outlive the table they defer to — a policy asking about a table that
-- no longer exists fails every read of that bucket rather than none of them.
--
-- Then the table, which takes its own policies and its trigger with it, and then the
-- trigger's function, which is not owned by the table it fired on.
--
-- ## What this cannot remove, and why that is enough
--
-- The bucket row itself. Supabase refuses `delete from storage.buckets` and
-- `delete from storage.objects` outright — "Direct deletion from storage tables is not
-- allowed. Use the Storage API instead." — because the rows are only half of an object;
-- the file behind them lives outside the database, and a row deleted in SQL would leave
-- it there, paid for and unreachable.
--
-- So `attachments` stays as an empty bucket with no policy on it, which is inert: every
-- upload, read and delete of a storage object is refused unless a policy permits it, and
-- after this migration none does. Nothing in the application asks any more either.
--
-- To be rid of the bucket as well, delete it from Storage in the Supabase dashboard,
-- which goes through the API that is allowed to. It holds nothing — this project reports
-- zero files — so that is a tidying step and not a data one.

drop policy if exists attachments_objects_select on storage.objects;
drop policy if exists attachments_objects_insert on storage.objects;
drop policy if exists attachments_objects_delete on storage.objects;

drop table if exists public.attachments;

drop function if exists public.stamp_attachment_subject();
