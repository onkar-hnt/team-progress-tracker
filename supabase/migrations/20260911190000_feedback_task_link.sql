-- ---------------------------------------------------------------------------
-- Feedback is written against a task
-- ---------------------------------------------------------------------------
-- Until now a comment named a developer and, optionally, a project. That made
-- feedback hard to act on: "the error handling needs work" against a project
-- running for three months does not say which piece of work it is about, and
-- the developer reading it has to guess.
--
-- A task is the unit both sides already share. The mentor picks from the work
-- they assigned, and the developer sees the note against the task it belongs
-- to.
--
-- `project_id` stays, and is not replaced by this column. A task carries its
-- own project, so the application now derives `project_id` from the chosen
-- task rather than asking twice — but the column is what `MentorCommentQuery`
-- filters on and what the feedback timeline displays, so removing it would
-- break reads for the sake of tidiness.
--
-- Nullable, deliberately. Existing rows predate the column and there is no
-- honest value to backfill them with — guessing a task from the project and
-- the date would invent a link somebody never made. The requirement is
-- enforced in the form, where the person who knows the answer is present;
-- the column records what was actually chosen.
--
-- `on delete set null` matches `project_id`. Feedback is part of somebody's
-- record and must outlive the task it was about, so deleting a task detaches
-- the note rather than destroying it.

alter table public.feedback
  add column if not exists task_id uuid references public.tasks (id) on delete set null;

comment on column public.feedback.task_id is
  'The task the feedback is about. Null only for rows recorded before feedback was task-scoped.';

-- Feedback is read per task on the developer's own pages, and the column is
-- sparse while old rows carry null, so the index skips them.
create index if not exists feedback_task_id_idx
  on public.feedback (task_id) where task_id is not null;

-- ---------------------------------------------------------------------------
-- The task must belong to the developer the feedback is about
-- ---------------------------------------------------------------------------
-- Two foreign keys cannot express this: each of `developer_id` and `task_id`
-- is individually valid while naming different people, which would attach a
-- note to somebody else's work and show it on the wrong timeline.
--
-- This is integrity rather than authorisation, and the two compose. Who may
-- write the row is settled by `feedback_insert`, which already requires
-- `can_view_developer(developer_id)`; this only checks the row is coherent.
-- So SECURITY DEFINER is right here: reading `tasks` through RLS would make a
-- legitimate write fail whenever the caller had lost sight of the developer,
-- and it would add nothing, because a caller who cannot see the developer was
-- refused by the policy before this runs.
--
-- Only checked when one of the two columns is actually being written. A mentor
-- may edit their own older comment after an assignment has ended, and
-- re-validating a link they are not touching would block an edit to the text.

create or replace function public.guard_feedback_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.task_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.task_id is not distinct from old.task_id
     and new.developer_id is not distinct from old.developer_id
  then
    return new;
  end if;

  if not exists (
    select 1
      from public.tasks t
     where t.id = new.task_id
       and t.developer_id = new.developer_id
  ) then
    raise exception 'Feedback must name a task assigned to the same developer.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.guard_feedback_task is
  'Keeps feedback.task_id pointing at a task belonging to feedback.developer_id.';

drop trigger if exists feedback_guard_task on public.feedback;

create trigger feedback_guard_task
  before insert or update on public.feedback
  for each row execute function public.guard_feedback_task();

-- No policy changes. `feedback_select`, `feedback_insert`, `feedback_update`
-- and `feedback_delete` already decide access from `developer_id` and
-- `mentor_id`, and a new column does not change who may see or write a row.
