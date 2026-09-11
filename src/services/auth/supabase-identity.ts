import { z } from 'zod'

import type { AppUser } from '@models/user.model'
import { USER_ROLES } from '@models/user.model'
import type { AppSupabaseClient } from '@services/supabase/index'

import { InactiveAccountError, MissingProfileError, SignInFailedError } from './auth.errors'

/**
 * Resolves what a signed-in Supabase user may do, from the database.
 *
 * The workbook equivalent of this is `workbook-identity.ts`, and the division
 * of responsibility is the same: proving who somebody is belongs to the auth
 * provider, and deciding what they are belongs here.
 *
 * Nothing is read from the browser. The role comes from `public.profiles`,
 * which no client can insert into and only an admin can change — and the same
 * row is what every RLS policy consults, so what the UI believes and what the
 * database enforces cannot drift apart.
 *
 * `user_metadata` is specifically not consulted: it is writable by the account
 * holder through `auth.updateUser`, so a role taken from there would be
 * self-granted.
 */

const PROFILE_STATUSES = ['active', 'inactive'] as const

/**
 * Validated rather than cast.
 *
 * The client is not yet generated against the schema, so the rows arrive
 * untyped. Parsing them here means a column rename shows up as one clear
 * error at sign-in instead of `undefined` spreading through the app.
 */
const profileRowSchema = z.object({
  id: z.string().min(1),
  email: z.string().min(1),
  display_name: z.string().min(1),
  role: z.enum(USER_ROLES),
  status: z.enum(PROFILE_STATUSES),
  must_change_password: z.boolean(),
})

const linkedRowSchema = z.object({ id: z.string().min(1) })

/**
 * The mentor or developer record belonging to a profile, if there is one.
 *
 * Absence is legitimate and common: the administrator owns no work and
 * mentors nobody. A query *failure*, though, is not treated as absence —
 * silently returning no ids would leave the person signed in and staring at
 * empty screens, so it is reported instead.
 */
async function findLinkedRecordId(
  client: AppSupabaseClient,
  table: 'developers' | 'mentors',
  profileId: string,
): Promise<string | undefined> {
  const { data, error } = await client
    .from(table)
    .select('id')
    .eq('profile_id', profileId)
    .maybeSingle()

  if (error !== null) {
    throw new SignInFailedError(
      `Your ${table === 'mentors' ? 'mentor' : 'employee'} record could not be read. Please try again.`,
      { cause: error },
    )
  }

  if (data === null) return undefined

  const parsed = linkedRowSchema.safeParse(data)
  return parsed.success ? parsed.data.id : undefined
}

/** The authenticated Supabase user, narrowed to what identity resolution needs. */
export interface SupabaseAuthUser {
  id: string
  email?: string | undefined
}

/**
 * Maps an authenticated Supabase user onto the application's `AppUser`.
 *
 * Throws rather than returning a partial user: a session without a usable
 * profile must not reach the route guards, because every screen behind them
 * assumes a role.
 */
export async function resolveSupabaseIdentity(
  client: AppSupabaseClient,
  authUser: SupabaseAuthUser,
): Promise<AppUser> {
  const { data, error } = await client
    .from('profiles')
    .select('id, email, display_name, role, status, must_change_password')
    .eq('id', authUser.id)
    .maybeSingle()

  if (error !== null) {
    throw new SignInFailedError('Your profile could not be loaded. Please try again.', {
      cause: error,
    })
  }

  // The row is absent either because the account predates the bootstrap
  // trigger, or because an administrator has not set the person up yet.
  if (data === null) throw new MissingProfileError(authUser.email ?? authUser.id)

  const parsed = profileRowSchema.safeParse(data)

  if (!parsed.success) {
    throw new SignInFailedError(
      'Your profile is stored in an unexpected shape, so your access cannot be confirmed.',
      { cause: parsed.error },
    )
  }

  const profile = parsed.data

  // Checked before the linked records are fetched: a disabled account should
  // cost one query, not three.
  if (profile.status !== 'active') throw new InactiveAccountError()

  // Someone still holding the password they were issued is going straight to
  // the change-password screen, so their mentor and developer records are not
  // fetched — nothing behind the guard will render to use them.
  if (profile.must_change_password) {
    return {
      email: profile.email,
      name: profile.display_name,
      role: profile.role,
      mustChangePassword: true,
    }
  }

  // A person can be both — a mentor who also logs work — so neither lookup
  // short-circuits the other.
  const [developerId, mentorId] = await Promise.all([
    findLinkedRecordId(client, 'developers', profile.id),
    findLinkedRecordId(client, 'mentors', profile.id),
  ])

  return {
    email: profile.email,
    name: profile.display_name,
    role: profile.role,
    ...(developerId === undefined ? {} : { developerId }),
    ...(mentorId === undefined ? {} : { mentorId }),
  }
}
