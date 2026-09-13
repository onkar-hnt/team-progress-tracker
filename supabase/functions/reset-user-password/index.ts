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
 * Sets somebody else's password, on behalf of an administrator or a mentor.
 *
 * Here rather than in the browser because there is no other place it can be.
 * Changing an account's password other than your own is a GoTrue Admin API call,
 * and that needs the service-role key — which bypasses row-level security
 * entirely and so must never reach a bundle. This function is therefore written
 * as a gate, in the same shape as the provisioning functions beside it:
 * establish who is calling, ask the database whether they may, and only then
 * touch anything.
 *
 * ## What is trusted, and what is not
 *
 * Nothing on the request decides anything except *which* account is the target.
 * The caller's identity comes from resolving their bearer token at the auth
 * server and reading their role out of `public.profiles` — never from the JWT's
 * own claims, which carry whatever `user_metadata` the account holder has set on
 * themselves. And the decision is not made here at all: it is
 * `public.may_reset_password`, so the rule lives in the database next to the
 * policies that express the rest of the access model, and a second caller could
 * not implement it differently.
 *
 * A mentor calling this against a developer who is not theirs is refused by that
 * function, whatever the interface showed them. So is a mentor against another
 * mentor, anybody against an administrator, and anybody against themselves.
 *
 * ## The plumbing is imported, not repeated
 *
 * CORS, the privileged key, the JSON shapes and the caller resolution are the
 * provisioning module's, exported from it rather than copied. They took real
 * effort to get right — the header reflection in `corsHeaders` and the direct
 * `fetch` to `/auth/v1/user` both exist because the obvious versions failed in
 * ways that were invisible from the browser — and a second copy would be a
 * second place for that to be relearned. If a third privileged function is ever
 * added, they should move to a `_shared` module of their own; two does not
 * justify the churn on code that is deployed and working.
 *
 * ## The password
 *
 * Arrives in the POST body over TLS, is passed to the Admin API, and is held in
 * a local `const` in between. It is never logged, never returned, never written
 * to a table, never put in a URL, and never passed to a SQL function — a
 * function's arguments can surface in `pg_stat_activity` and in log lines, which
 * is reason enough to keep the authorization question and the secret apart.
 *
 * Refused under eight characters before the Admin API is called, so the rule
 * holds against a caller who skips the form. GoTrue applies the project's own
 * minimum as well, and takes the stricter of the two.
 */

/** Mirrors `PASSWORD_MIN_LENGTH` in `src/services/auth/password-policy.ts`. */
const PASSWORD_MIN_LENGTH = 8

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const FUNCTION_NAME = 'reset-user-password'

/** The business tables a target can be named through. */
type TargetTable = 'developers' | 'mentors'

interface ResetRequest {
  table: TargetTable
  rowId: string
  password: string
}

/**
 * Reads the body without trusting any of it.
 *
 * The table is checked against the two allowed values rather than interpolated,
 * so a caller cannot name `profiles` — or anything else — and have this function
 * read a row out of it with the service key.
 */
function parseBody(body: unknown): ResetRequest | null {
  if (typeof body !== 'object' || body === null) return null

  const fields = body as Record<string, unknown>
  const { password, rowId, table } = fields

  if (table !== 'developers' && table !== 'mentors') return null
  if (typeof rowId !== 'string' || !UUID_PATTERN.test(rowId)) return null
  if (typeof password !== 'string') return null

  return { table, rowId, password }
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
      'The password reset function is missing its configuration.',
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
    const { message, status } = describeRejection(caller.rejection, 'reset a password')

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
      'A valid record id and a new password are required.',
      400,
      origin,
    )
  }

  // Length checked here as well as in the browser, because the browser is not
  // where a rule is kept. Reported without echoing anything that was sent.
  if (parsed.password.length < PASSWORD_MIN_LENGTH) {
    return failure(
      'password-too-short',
      `The new password must be at least ${String(PASSWORD_MIN_LENGTH)} characters.`,
      400,
      origin,
    )
  }

  // ------------------------------------------------------------- the target

  const { data: row, error: rowError } = await admin
    .from(parsed.table)
    .select('id, name, profile_id')
    .eq('id', parsed.rowId)
    .maybeSingle<{ id: string; name: string; profile_id: string | null }>()

  if (rowError !== null) {
    console.error(`${FUNCTION_NAME}: target lookup failed`, rowError)

    return failure('lookup-failed', 'That record could not be read.', 500, origin)
  }

  if (row === null) {
    return failure('target-not-found', 'That record no longer exists.', 404, origin)
  }

  // No login, nothing to reset. Said plainly, because the fix is a different
  // button on a different screen: Create login, which issues a password of its
  // own.
  if (row.profile_id === null) {
    return failure(
      'target-has-no-login',
      `${row.name} has no login yet, so there is no password to reset. Use Create login instead.`,
      409,
      origin,
    )
  }

  // ------------------------------------------------------ may they, though?

  const { data: isAuthorised, error: authorisationError } = await admin.rpc('may_reset_password', {
    p_actor_profile_id: caller.user.id,
    p_target_profile_id: row.profile_id,
  })

  if (authorisationError !== null) {
    console.error(`${FUNCTION_NAME}: authorization check failed`, authorisationError)

    // Refused rather than allowed. A check that cannot be run has not passed,
    // and the alternative — carrying on because the database was unreachable —
    // is how a permission model stops meaning anything.
    return failure(
      'authorization-unavailable',
      'Your permission to reset this password could not be confirmed, so nothing was changed. If this persists, the may_reset_password migration may not have been applied.',
      500,
      origin,
    )
  }

  if (isAuthorised !== true) {
    // One message for every refusal, on purpose. Distinguishing "not assigned to
    // you" from "that person is a mentor" would answer questions about people the
    // caller is not entitled to ask about.
    console.warn(`${FUNCTION_NAME}: refused`, {
      actor: caller.user.id,
      table: parsed.table,
      rowId: parsed.rowId,
    })

    return failure(
      'not-authorised',
      'You may not reset this password. Administrators can reset any employee or mentor; a mentor can reset only the employees assigned to them.',
      403,
      origin,
    )
  }

  // --------------------------------------------------------- set it, then

  const { error: updateError } = await admin.auth.admin.updateUserById(row.profile_id, {
    password: parsed.password,
  })

  if (updateError !== null) {
    console.error(`${FUNCTION_NAME}: password update failed`, updateError.message)

    return failure(
      'update-failed',
      `The password could not be changed: ${updateError.message}`,
      502,
      origin,
    )
  }

  // ------------------------------------------- and make them replace it

  // Whoever just set this password knows it, which is the whole difference
  // between a reset and somebody choosing their own. So the account is put back
  // behind the change-password screen, exactly as a newly provisioned one is.
  //
  // Raising the flag needs no escape hatch: `guard_profile_privileges` refuses
  // only to see it *lowered* by anything other than
  // `public.complete_password_change`, which is what makes that function the one
  // way it can ever go false.
  //
  // Reported as a partial success rather than a failure, and deliberately not
  // rolled back. The password has already changed — telling the administrator it
  // failed would send them to try again with a password that is already live.
  const { error: flagError } = await admin
    .from('profiles')
    .update({ must_change_password: true })
    .eq('id', row.profile_id)

  if (flagError !== null) {
    console.error(`${FUNCTION_NAME}: must_change_password not set`, flagError)

    return json(
      {
        name: row.name,
        mustChangePassword: false,
        warning: `The password was changed, but ${row.name} will not be asked to replace it at their next sign-in. Tell them to change it themselves from their profile.`,
      },
      200,
      origin,
    )
  }

  // Nothing about the password comes back. There is nothing the caller needs
  // that they do not already have — they chose it — and a response carrying it
  // would put it into logs and network panels for no gain.
  return json({ name: row.name, mustChangePassword: true }, 200, origin)
}

Deno.serve(async (request: Request): Promise<Response> => {
  const origin = request.headers.get('Origin')

  try {
    return await handle(request, origin)
  } catch (error) {
    // An uncaught throw becomes a platform 500 with no CORS headers, which the
    // browser blocks before any status reaches JavaScript — leaving the screen
    // able to say only that the service was unreachable.
    return failure(
      'unhandled',
      `The password reset function failed unexpectedly: ${
        error instanceof Error ? error.message : String(error)
      }`,
      500,
      origin,
    )
  }
})
