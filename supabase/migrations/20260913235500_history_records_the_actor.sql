-- ---------------------------------------------------------------------------
-- The log says who, not which uuid
-- ---------------------------------------------------------------------------
-- `record_history.changed_by` holds a login id, and the screen was resolving it against
-- the roster the reader can already see. That works for an administrator and fails for
-- the person the log matters most to: a developer opening it to find out who moved their
-- task cannot read `profiles`, so their own mentor came back as "Someone else".
--
-- The name is therefore recorded with the change, exactly as `subject` records what the
-- record was called. Both are copies of a name at a moment, and both are right to be:
-- the log is read long after the fact, and a name that has to be looked up somewhere
-- else is a name that eventually cannot be.
--
-- Filled by its own BEFORE trigger rather than by `record_change`, which stays as it was.
-- The diff logic is the part of this feature worth having one copy of, and redefining a
-- hundred lines of it to add one column is how a second copy starts.
--
-- Only `display_name` is used. The email is not offered as a fallback: it is a piece of
-- personal information that a developer cannot otherwise see about their colleagues, and
-- it should not become visible through a log about their own tasks. A profile with no
-- display name leaves the name empty, and the screen says "Someone else" as before.

alter table public.record_history
  add column if not exists changed_by_name text not null default '';

comment on column public.record_history.changed_by_name is
  'Who made the change, as their display name at the time. Denormalised deliberately: profiles is readable only by an administrator, and the log is read by everybody.';

create or replace function public.stamp_history_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.changed_by is not null then
    select coalesce(nullif(btrim(p.display_name), ''), '')
      into new.changed_by_name
      from public.profiles p
     where p.id = new.changed_by;
  end if;

  -- A profile that has been removed leaves no name, and the select above leaves the
  -- column null rather than empty. The column is `not null`, and an empty name is what
  -- the screen already knows how to say.
  new.changed_by_name := coalesce(new.changed_by_name, '');

  return new;
end;
$$;

comment on function public.stamp_history_actor is
  'Copies the acting profile''s display name onto the history row, so the log can name whoever made a change without the reader needing to read profiles.';

drop trigger if exists record_history_stamp_actor on public.record_history;

create trigger record_history_stamp_actor
  before insert on public.record_history
  for each row execute function public.stamp_history_actor();
