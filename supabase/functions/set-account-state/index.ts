import { createClient } from 'jsr:@supabase/supabase-js@2'

import {
  corsHeaders,
  describeRejection,
  failure,
  json,
  readPrivilegedKey,
  resolvePrivilegedCaller,
} from '../_shared/provisioning.ts'

/**
 * Turns somebody's sign-in off, or back on.
 *
 * The third privileged function, in the same shape as the two beside it:
 * establish who is calling from their bearer token, ask the database whether they
 * may, and only then touch anything. Nothing on the request decides anything
 * except which account is the target.
 *
 * ## Why this is not a plain UPDATE from the browser
 *
 * It could have been, halfway. `profiles_update` already lets an administrator
 * update any profile and `guard_profile_privileges` already refuses a status
 * change from anybody else, so the column was reachable — but the column is only
 * half of what disabling an account means.
 *
 * `profiles.status` is read at sign-in and when a session is restored, so setting
 * it refuses the next sign-in and every page load after it. It is not read by any
 * row-level security policy, so a tab that is already open keeps working: the
 * access token in it stays valid and `supabase-js` keeps renewing it in the
 * background, indefinitely, because GoTrue has never heard of this column.
 *
 * Closing that means banning the auth user, which is a GoTrue Admin API call and
 * so needs the service-role key. Hence a function, and hence both writes here —
 * two halves of one decision, made in one place, rather than a column set in the
 * browser and a ban that somebody has to remember.
 *
 * The remaining window is the life of an access token already issued, an hour at
 * most, and it is reported rather than glossed over: the response says what was
 * revoked so the screen can say the same.
 *
 * ## Administrators only
 *
 * `resolvePrivilegedCaller` admits mentors, because the two functions beside this
 * one are things a mentor legitimately does. This one is not, and the refusal is
 * `public.may_manage_account` rather than an extra test here — same as the
 * password reset, so the rule sits in the database beside the policies expressing
 * the rest of the access model. That function also refuses the caller's own
 * account and any other administrator.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const FUNCTION_NAME = 'set-account-state'

/**
 * A hundred years, which is how GoTrue is told "indefinitely".
 *
 * `ban_duration` takes a Go duration string and has no unbounded value, so a span
 * nobody will outlive is the idiom. `'none'` is the documented way to lift one.
 */
const BAN_FOREVER = '876000h'

interface StateRequest {
  profileId: string
  state: 'active' | 'inactive'
}

function parseBody(body: unknown): StateRequest | null {
  if (typeof body !== 'object' || body === null) return null

  const fields = body as Record<string, unknown>
  const { profileId, state } = fields

  if (typeof profileId !== 'string' || !UUID_PATTERN.test(profileId)) return null
  if (state !== 'active' && state !== 'inactive') return null

  return { profileId, state }
}

async function handle(request: Request, origin: string | null): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin, request) })
  }

  if (request.method !== 'POST') {
    return failure('method-not-allowed', 'Use POST.', 405, origin)
  }

  const { key: serviceRoleKey } = readPrivilegedKey()
  const supabaseUrl = Deno.env.get('SUPABASE_URL')

  if (serviceRoleKey === undefined || supabaseUrl === undefined) {
    return failure(
      'misconfigured',
      'The account state function is missing its configuration.',
      500,
      origin,
    )
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const caller = await resolvePrivilegedCaller(
    admin,
    request,
    supabaseUrl,
    serviceRoleKey,
    FUNCTION_NAME,
  )

  if ('rejection' in caller) {
    const { message, status } = describeRejection(caller.rejection, 'enable or disable an account')

    return failure(caller.rejection, message, status, origin, {
      ...(caller.detail === undefined ? {} : { detail: caller.detail }),
    })
  }

  let body: unknown

  try {
    body = await request.json()
  } catch {
    return failure('invalid-request', 'The request body could not be read.', 400, origin)
  }

  const parsed = parseBody(body)

  if (parsed === null) {
    return failure(
      'invalid-request',
      'A valid account id and a state of active or inactive are required.',
      400,
      origin,
    )
  }

  // ------------------------------------------------------------- the target

  // Read for its name, which is what the screen says afterwards, and to tell a
  // missing account apart from one this caller may not touch.
  const { data: target, error: targetError } = await admin
    .from('profiles')
    .select('id, display_name, status')
    .eq('id', parsed.profileId)
    .maybeSingle<{ id: string; display_name: string; status: string }>()

  if (targetError !== null) {
    console.error(`${FUNCTION_NAME}: target lookup failed`, targetError)

    return failure('lookup-failed', 'That account could not be read.', 500, origin)
  }

  if (target === null) {
    return failure('target-not-found', 'That account no longer exists.', 404, origin)
  }

  // ------------------------------------------------------ may they, though?

  const { data: isAuthorised, error: authorisationError } = await admin.rpc('may_manage_account', {
    p_actor_profile_id: caller.user.id,
    p_target_profile_id: parsed.profileId,
  })

  if (authorisationError !== null) {
    console.error(`${FUNCTION_NAME}: authorization check failed`, authorisationError)

    // Refused rather than allowed: a check that could not be run has not passed.
    return failure(
      'authorization-unavailable',
      'Your permission to change this account could not be confirmed, so nothing was changed. If this persists, the may_manage_account migration may not have been applied.',
      500,
      origin,
    )
  }

  if (isAuthorised !== true) {
    console.warn(`${FUNCTION_NAME}: refused`, {
      actor: caller.user.id,
      target: parsed.profileId,
    })

    return failure(
      'not-authorised',
      'You may not change this account. Only an administrator can enable or disable a login, and not their own or another administrator’s.',
      403,
      origin,
    )
  }

  // Already where it was asked to be. Answered as a success, because the caller
  // wanted a state rather than a change — two administrators on the same list, or
  // one double click, should not produce a failure.
  if (target.status === parsed.state) {
    return json(
      {
        name: target.display_name,
        state: parsed.state,
        sessionsRevoked: parsed.state === 'inactive',
        unchanged: true,
      },
      200,
      origin,
    )
  }

  // ------------------------------------------------------------ the column

  const { error: statusError } = await admin.rpc('set_profile_status', {
    p_profile_id: parsed.profileId,
    p_status: parsed.state,
  })

  if (statusError !== null) {
    console.error(`${FUNCTION_NAME}: status update failed`, statusError)

    return failure(
      'update-failed',
      `The account state could not be changed: ${statusError.message}`,
      500,
      origin,
    )
  }

  // --------------------------------------------------------------- the ban

  // After the column, so the order of the two failures is the useful way round.
  // The column alone already refuses the next sign-in; the ban alone would refuse
  // sign-in while the profile still said active, which is the state that is hard
  // to explain from the interface.
  const { error: banError } = await admin.auth.admin.updateUserById(parsed.profileId, {
    ban_duration: parsed.state === 'inactive' ? BAN_FOREVER : 'none',
  })

  if (banError !== null) {
    console.error(`${FUNCTION_NAME}: ban not applied`, banError.message)

    // A partial success, reported as one and deliberately not rolled back. What
    // was asked for has largely happened, and undoing the column would leave the
    // account fully working — the worse of the two outcomes.
    return json(
      {
        name: target.display_name,
        state: parsed.state,
        sessionsRevoked: false,
        warning:
          parsed.state === 'inactive'
            ? `${target.display_name} can no longer sign in, but an open session of theirs was not ended and may keep working. Ask them to sign out, or retry.`
            : `${target.display_name} can sign in again, but the block on their account could not be lifted. Retry before telling them to try.`,
      },
      200,
      origin,
    )
  }

  return json(
    {
      name: target.display_name,
      state: parsed.state,
      // Banning ends token renewal rather than the token itself, so an open tab
      // survives until the access token it holds expires — under an hour.
      sessionsRevoked: parsed.state === 'inactive',
    },
    200,
    origin,
  )
}

Deno.serve(async (request: Request): Promise<Response> => {
  const origin = request.headers.get('Origin')

  try {
    return await handle(request, origin)
  } catch (error) {
    return failure(
      'unhandled',
      `The account state function failed unexpectedly: ${
        error instanceof Error ? error.message : String(error)
      }`,
      500,
      origin,
    )
  }
})
