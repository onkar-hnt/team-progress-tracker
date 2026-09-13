import { z } from 'zod'

import type { AppUser } from '@models/user.model'
import { USER_ROLES } from '@models/user.model'
import type { AppSupabaseClient } from '@services/supabase/index'

import { InactiveAccountError, MissingProfileError, SignInFailedError } from './auth.errors'

const PROFILE_STATUSES = ['active', 'inactive'] as const

const profileRowSchema = z.object({
  id: z.string().min(1),
  email: z.string().min(1),
  display_name: z.string().min(1),
  role: z.enum(USER_ROLES),
  status: z.enum(PROFILE_STATUSES),
  must_change_password: z.boolean(),
})

const linkedRowSchema = z.object({ id: z.string().min(1) })

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
