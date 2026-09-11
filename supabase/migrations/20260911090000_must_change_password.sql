-- ---------------------------------------------------------------------------
-- Forced password change on first sign-in
-- ---------------------------------------------------------------------------
-- Accounts are provisioned with a temporary password derived from the
-- person's name, so every one of them is guessable by anybody who knows who
-- works here. That is tolerable only because the password is required to be
-- replaced before the account can be used, which means the requirement has to
-- be a fact in the database rather than a branch in React.
--
-- Three things are needed for that, and all three are here:
--
--   1. A column saying the change is outstanding.
--   2. A guard stopping the account holder from clearing it themselves.
--   3. One function that clears it, and only after checking that the
--      temporary password no longer works.
--
-- The flag deliberately does not live in `auth.users.user_metadata`, where an
-- earlier version of this feature put it. Metadata is writable by the account
-- holder through `auth.updateUser`, so a single call from the browser console
-- would have lifted the requirement without changing any password.

-- ---------------------------------------------------------------------------
-- The temporary password rule
-- ---------------------------------------------------------------------------
-- Mirrored from `initialPasswordFor` in the provisioning Edge Function, and
-- the two must not drift: this is what decides whether a password has
-- actually been replaced.
--
-- The rule, exactly:
--
--   1. Trim the name and split it on whitespace; take the first word.
--   2. Remove every character that is not A-Z, a-z or 0-9. Case is kept as
--      entered, so "Shubham Deshmukh" gives "Shubham".
--   3. If fewer than three characters survive, use the whole name with the
--      same characters removed instead, so a two-letter first name does not
--      produce a password Supabase rejects for length.
--   4. If that is still under three characters, use "Employee".
--   5. Append "@123".
--
-- "Shubham Deshmukh" -> "Shubham@123".

create or replace function public.initial_password_for(full_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  with cleaned as (
    select
      regexp_replace(
        (regexp_split_to_array(btrim(coalesce(full_name, '')), '\s+'))[1],
        '[^A-Za-z0-9]', '', 'g'
      ) as first_word,
      regexp_replace(coalesce(full_name, ''), '[^A-Za-z0-9]', '', 'g') as whole
  )
  select
    case
      when length(coalesce(first_word, '')) >= 3 then first_word
      when length(whole) >= 3 then whole
      else 'Employee'
    end || '@123'
  from cleaned;
$$;

comment on function public.initial_password_for is
  'The temporary password a given name is provisioned with. Mirrors initialPasswordFor in the provision-developer-user Edge Function.';

-- Not a browser-callable endpoint. The rule is not a secret — it is printed
-- on the admin screen when an account is created — but there is no reason to
-- publish a service that computes other people's temporary passwords.
revoke all on function public.initial_password_for(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The column
-- ---------------------------------------------------------------------------
-- Default true, so an account created by any route arrives needing a change
-- and nothing has to remember to set it.
--
-- Existing rows are decided by asking the question the flag is meant to
-- answer: does the temporary password still open this account? Blanket-
-- clearing would have exempted precisely the accounts already provisioned
-- with a guessable password, which are the ones this exists for; blanket-
-- setting would have forced the change on people who chose their own password
-- and on the administrator who has to be able to sign in and fix it.
--
-- This must run before the guard below learns about the column, because the
-- guard refuses exactly this kind of UPDATE.

alter table public.profiles
  add column must_change_password boolean not null default true;

do $$
begin
  begin
    update public.profiles p
       set must_change_password = coalesce((
             select u.encrypted_password = extensions.crypt(
                      public.initial_password_for(
                        coalesce(
                          (select d.name from public.developers d where d.profile_id = p.id),
                          p.display_name
                        )
                      ),
                      u.encrypted_password
                    )
               from auth.users u
              where u.id = p.id
           ), false);
  exception
    when others then
      -- No pgcrypto, or a hash `crypt` does not recognise. The question
      -- cannot be asked, so nobody is locked into the change screen on a
      -- guess. Same reasoning as the check in complete_password_change.
      raise notice 'Temporary-password backfill skipped: %', sqlerrm;
      update public.profiles set must_change_password = false;
  end;
end;
$$;

-- Administrators are exempted outright rather than left to the check above.
-- Nobody provisions an administrator with a temporary password, and an admin
-- wrongly held on the change screen is the one failure with no way out from
-- inside the application.
update public.profiles set must_change_password = false where role = 'admin';

comment on column public.profiles.must_change_password is
  'True while the account still holds the temporary password it was issued. Cleared only by public.complete_password_change().';

-- ---------------------------------------------------------------------------
-- The flag cannot be cleared by its owner
-- ---------------------------------------------------------------------------
-- `profiles_update` lets a person update their own row so a display name can
-- be corrected, which would otherwise let them turn the requirement off with
-- one PATCH. This extends the existing privilege guard to cover it.
--
-- Raising the flag is allowed and only lowering it is refused. The dangerous
-- direction is the one that grants access; being made to change a password
-- again is a nuisance, not a hole, and allowing it keeps the provisioning
-- function able to re-arm the requirement when it links an existing account.
--
-- The check sits ahead of the administrator short-circuit on purpose. An
-- admin clearing somebody else's flag by hand would hand out an account still
-- holding a temporary password everybody can guess.

create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.must_change_password is distinct from old.must_change_password
     and new.must_change_password = false
     and coalesce(current_setting('app.password_change_confirmed', true), '') <> 'on'
  then
    raise exception
      'The password-change requirement is cleared by public.complete_password_change(), not by updating the column.'
      using errcode = '42501';
  end if;

  if public.is_admin() then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'Only an administrator may change a role.'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    raise exception 'Only an administrator may change account status.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Clearing the flag
-- ---------------------------------------------------------------------------
-- Called by the change-password screen once Supabase has confirmed the new
-- password. It re-derives the temporary password from the person's name and
-- refuses to clear the flag while that password still opens the account, so
-- the requirement cannot be satisfied by calling this endpoint directly and
-- carrying on with the password everybody can guess.
--
-- `app.password_change_confirmed` is set transaction-locally to get the
-- UPDATE past the guard above. PostgREST exposes functions in the `public`
-- schema and nothing else, so `set_config` is not reachable from a client and
-- the setting cannot be forged; being transaction-local, it also cannot
-- outlive this call.
--
-- Returns true when the flag was cleared and false when there was nothing to
-- clear, so a screen retrying after a dropped connection sees success rather
-- than an error.

create or replace function public.complete_password_change()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  expected_name text;
  temporary_password text;
  still_temporary boolean := false;
begin
  if caller_id is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;

  -- The developer record's name, because that is what provisioning derived
  -- the password from. `display_name` is the fallback and is second by
  -- design: its owner can edit it, and a renamed profile would otherwise
  -- produce a temporary password that matches nothing and a check that
  -- passes without testing anything.
  select coalesce(d.name, p.display_name)
    into expected_name
    from public.profiles p
    left join public.developers d on d.profile_id = p.id
   where p.id = caller_id;

  if expected_name is null then
    raise exception 'Your profile could not be read.' using errcode = 'P0002';
  end if;

  temporary_password := public.initial_password_for(expected_name);

  -- Wrapped because it depends on how GoTrue happens to hash passwords.
  -- bcrypt today, and `crypt` verifies it; were that to change, this would
  -- raise and every account would be permanently stuck on a screen it cannot
  -- leave. Failing the check open is the lesser fault by a wide margin: the
  -- person has already authenticated, and the flag is a prompt to replace a
  -- weak password rather than the thing keeping anybody out.
  begin
    select u.encrypted_password = extensions.crypt(temporary_password, u.encrypted_password)
      into still_temporary
      from auth.users u
     where u.id = caller_id;
  exception
    when others then
      still_temporary := false;
  end;

  if coalesce(still_temporary, false) then
    raise exception 'Your new password must be different from the temporary one you were given.'
      using errcode = '22023';
  end if;

  perform set_config('app.password_change_confirmed', 'on', true);

  update public.profiles
     set must_change_password = false
   where id = caller_id
     and must_change_password;

  return found;
end;
$$;

comment on function public.complete_password_change is
  'Clears the caller''s password-change requirement, once the temporary password no longer opens the account. The only way the flag goes false.';

revoke all on function public.complete_password_change() from public, anon;
grant execute on function public.complete_password_change() to authenticated;

-- ---------------------------------------------------------------------------
-- New accounts arrive needing a change; the bootstrap administrator does not
-- ---------------------------------------------------------------------------
-- The administrator sets their own password when the project is stood up, so
-- there is no temporary one to replace and forcing the screen on them would
-- only lock the first account out of the application it has to administer.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, role, must_change_password)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1)
    ),
    case when lower(new.email) = 'admin@handt.ai' then 'admin' else 'developer' end,
    lower(new.email) <> 'admin@handt.ai'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
