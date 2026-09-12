-- ---------------------------------------------------------------------------
-- Notifications: narrow the table privileges
-- ---------------------------------------------------------------------------
-- `20260913120000_notifications.sql` granted `select, update` to
-- `authenticated` without revoking anything first, which made the grant
-- meaningless: this database has default privileges on schema `public` that
-- hand every newly created table to `authenticated` in full, so the role also
-- came away with insert, delete, truncate, references and trigger.
--
-- Nothing was reachable through that. Row security is on, there is no insert
-- policy and no delete policy, and a table privilege does not substitute for a
-- missing policy. The revoke below is so that adding a permissive `for all`
-- policy later cannot quietly open a write path, and so that reading the
-- privilege list states the intent instead of contradicting it.
--
-- `update` is narrowed to `is_read`. The `notifications_guard_update` trigger
-- already rejects a change to any other column, but a column grant refuses the
-- statement before the row is touched. Neither `markNotificationRead` nor
-- `markAllNotificationsRead` chains a `select`, so no other column is ever
-- named in a write.

revoke all on public.notifications from anon, authenticated;

grant select on public.notifications to authenticated;
grant update (is_read) on public.notifications to authenticated;
