-- ---------------------------------------------------------------------------
-- Who may reset whose password
-- ---------------------------------------------------------------------------
-- One function, holding the whole rule, asked by the `reset-user-password` Edge
-- Function before it calls the Admin API. The interface asks the same question
-- of the data it already holds in order to decide what to draw, but that is a
-- usability layer: hiding a button hides it from somebody looking at a screen,
-- not from somebody with a session token and a terminal.
--
-- The rule:
--
--   * An **administrator** may reset any developer or mentor.
--   * A **mentor** may reset a developer currently assigned to them, and
--     nobody else. Not another mentor, not an administrator, not an unassigned
--     developer.
--   * A **developer** may reset nobody. Their own password is theirs to change
--     on the password screen, which goes through GoTrue with their own session
--     and never comes near this function.
--
-- Three refusals are worth stating outright, because each was a decision:
--
-- **Nobody resets an administrator.** Not even another administrator. Admin
-- accounts are not provisioned with a derived temporary password — the first one
-- sets its own when the project is stood up — so there is no admin equivalent of
-- the problem this solves. Recovering a locked-out administrator is a Supabase
-- dashboard action, deliberately outside the application. The same reasoning
-- already refuses provisioning against an admin address; see `decideExisting`.
--
-- **Nobody resets themselves through here.** An actor and target that match are
-- refused, so this path cannot be used as a way around the change-password
-- screen. That screen proves the old password still opens the account before it
-- clears the change requirement; this one, by design, proves nothing of the sort.
--
-- **A mentor is refused against anybody holding a mentor record**, even if that
-- person's profile role is `developer` and they are assigned to the actor. One
-- person can be both, `profiles.role` holds a single value, and "a mentor may
-- not reset a mentor's password" should not turn on which of the two roles their
-- profile happens to record.
--
-- What this does *not* check is the target's account status. A deactivated
-- account is not made reachable by having its password set — status and the
-- change requirement are what govern that — and refusing here would only mean an
-- administrator preparing for somebody's return got an error they would have to
-- work out for themselves.
--
-- A note on scope, so it is not mistaken for a hole: a mentor maintains their
-- own assignment list, so a mentor can bring a developer within reach of this
-- rule by claiming them. That is the existing, deliberate policy — the same one
-- that governs whose work and feedback a mentor can see, documented on
-- `canManageMentorAssignments` and bounded by the `mentor_assignments` policies.
-- This function is not the place to reverse it.

create or replace function public.may_reset_password(
  p_actor_profile_id uuid,
  p_target_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with actor as (
    select p.role, p.status
    from public.profiles p
    where p.id = p_actor_profile_id
  ),
  target as (
    select p.role
    from public.profiles p
    where p.id = p_target_profile_id
  )
  select
    p_actor_profile_id is not null
    and p_target_profile_id is not null
    and p_actor_profile_id <> p_target_profile_id
    and exists (select 1 from actor where status = 'active')
    and (
      -- An administrator: anybody who is not an administrator.
      (
        exists (select 1 from actor where role = 'admin')
        and exists (select 1 from target where role in ('developer', 'mentor'))
      )
      or
      -- A mentor: a developer of theirs, by the same table `can_view_developer`
      -- reads. Written out with the actor as a parameter rather than reusing that
      -- function, because it resolves the mentor from `auth.uid()` — which is
      -- null inside a service-role request, so every one of these would be false.
      (
        exists (select 1 from actor where role = 'mentor')
        and exists (select 1 from target where role = 'developer')
        and not exists (
          select 1 from public.mentors m where m.profile_id = p_target_profile_id
        )
        and exists (
          select 1
          from public.mentor_assignments ma
          join public.mentors am on am.id = ma.mentor_id
          join public.developers d on d.id = ma.developer_id
          where am.profile_id = p_actor_profile_id
            and d.profile_id = p_target_profile_id
            and ma.active
        )
      )
    );
$$;

comment on function public.may_reset_password is
  'Whether one profile may set another profile''s password. Admin to any developer or mentor; a mentor only to a developer actively assigned to them; nobody to an administrator or to themselves. Asked by the reset-user-password Edge Function.';

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
-- Service role and nothing else, exactly like `assign_profile_role`. Two
-- reasons, and the second is the one that matters.
--
-- A boolean-returning function in `public` is a PostgREST RPC endpoint the
-- moment `authenticated` can execute it, so leaving it open would publish a
-- service that answers "may this person reset that person's password" to anyone
-- with a login. That is not a secret worth much, but it is an enumeration of who
-- mentors whom, offered to people the RLS policies deliberately do not offer it
-- to.
--
-- And the answer is of no use to a browser in any case: nothing the client could
-- do with a `true` would be trusted. The password is set by the Edge Function,
-- which asks this itself, with the caller's identity established from
-- `public.profiles` rather than from anything the request claimed.

revoke all on function public.may_reset_password(uuid, uuid) from public, anon, authenticated;
grant execute on function public.may_reset_password(uuid, uuid) to service_role;
