-- ---------------------------------------------------------------------------
-- The log must not be able to refuse a save
-- ---------------------------------------------------------------------------
-- `record_history.changed_by` referenced `profiles`, which was tidy and wrong. The
-- insert happens inside the transaction that writes the record, so a row the foreign
-- key refused would refuse the *user's* write with it: somebody whose profile was
-- missing — created before the trigger that makes them, or removed by hand — would
-- find that they could no longer save a daily update, and the error would name a
-- table they have never heard of.
--
-- The reference bought very little. Nothing joins through it: names are resolved from
-- the roster, because `profiles` is readable only by an administrator and the log is
-- read by everybody. What is left is a uuid identifying whoever was signed in, which
-- is exactly what the log is for, and which stays meaningful after a login is deleted
-- — arguably more meaningful than the `on delete set null` that used to erase it.
--
-- The insert can still fail for a reason that is a real fault, and it should. This
-- removes the one failure that would have been the log's own fault rather than a
-- symptom of something worth stopping for.

alter table public.record_history
  drop constraint if exists record_history_changed_by_fkey;

comment on column public.record_history.changed_by is
  'Whoever was signed in, as auth.uid(). Deliberately not a foreign key: the log is written inside the transaction it records, so a reference that could be refused would refuse the write it was recording.';
