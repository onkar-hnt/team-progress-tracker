import { createClient } from 'jsr:@supabase/supabase-js@2'
import type { SupabaseClient, User } from 'jsr:@supabase/supabase-js@2'

/**
 * Gives an existing `public.developers` row a login.
 *
 * This runs on the server because it is the only place the service-role key
 * may exist. That key bypasses row-level security entirely, so the whole
 * function is written as a gate: establish who is calling, prove they are an
 * active administrator, and only then touch anything.
 *
 * It deliberately does not create the developer record. The admin screen
 * already does that through the ordinary RLS-checked path, and keeping the
 * two apart means a provisioning failure never leaves a half-written
 * business row behind — the record exists either way, and provisioning can
 * be retried against it.
 *
 * Idempotent by design. Every step asks what is already true before acting,
 * because the expensive failure here is a second identity for one person:
 * two auth users with the same address, one of them linked to nothing.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Deliberately permissive. The authority on deliverability is the mail server. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Origins allowed to call this function.
 *
 * The deployed site and local development. An unknown origin is answered
 * without CORS headers, so the browser refuses the response.
 */
const ALLOWED_ORIGINS = new Set([
  'https://onkar-hnt.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
])

type ProvisionOutcome = 'invited' | 'linked-existing' | 'already-linked'

interface ProvisionRequest {
  developerId: string
  email?: string
}

interface ProfileRow {
  id: string
  email: string
  role: string
  status: string
}

interface DeveloperRow {
  id: string
  name: string
  email: string | null
  profile_id: string | null
}

/**
 * The privileged key, from whichever variable the platform provides.
 *
 * Newer projects are given `SUPABASE_SECRET_KEYS`, a JSON dictionary keyed by
 * key name; older ones only have the plain `SUPABASE_SERVICE_ROLE_KEY`, now
 * the deprecated path. Both are injected by the platform, and neither can be
 * supplied as a secret even deliberately — the `SUPABASE_` prefix is
 * reserved, so `secrets set` refuses those names.
 */
function readPrivilegedKey(): string | undefined {
  const dictionary = Deno.env.get('SUPABASE_SECRET_KEYS')

  if (dictionary !== undefined) {
    try {
      const keys = JSON.parse(dictionary) as Record<string, unknown>
      const preferred = keys.default ?? Object.values(keys)[0]

      if (typeof preferred === 'string') return preferred
    } catch {
      // Not the dictionary we expected. The legacy variable is still there.
    }
  }

  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
}

function corsHeaders(origin: string | null): Record<string, string> {
  if (origin === null || !ALLOWED_ORIGINS.has(origin)) return {}

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  })
}

/**
 * An error the admin screen can act on.
 *
 * `code` is what the frontend switches on; `message` is what it shows. Both
 * are written for an administrator, not a developer reading logs.
 */
function failure(
  code: string,
  message: string,
  status: number,
  origin: string | null,
  extra?: Record<string, unknown>,
): Response {
  return json({ code, message, ...extra }, status, origin)
}

/**
 * The caller, if they are an active administrator.
 *
 * The role is read from `public.profiles` rather than from the token: a JWT
 * carries whatever `user_metadata` the account holder has set on themselves,
 * so trusting it here would let anybody with a login provision accounts.
 */
async function resolveAdminCaller(
  admin: SupabaseClient,
  request: Request,
): Promise<{ user: User } | { error: 'unauthenticated' | 'forbidden' }> {
  const header = request.headers.get('Authorization')

  if (header === null || !header.startsWith('Bearer ')) return { error: 'unauthenticated' }

  const { data, error } = await admin.auth.getUser(header.slice('Bearer '.length))

  if (error !== null || data.user === null) return { error: 'unauthenticated' }

  const { data: profile } = await admin
    .from('profiles')
    .select('id, role, status')
    .eq('id', data.user.id)
    .maybeSingle<Pick<ProfileRow, 'id' | 'role' | 'status'>>()

  if (profile === null) return { error: 'forbidden' }
  if (profile.role !== 'admin' || profile.status !== 'active') return { error: 'forbidden' }

  return { user: data.user }
}

async function parseBody(request: Request): Promise<ProvisionRequest | null> {
  try {
    const body: unknown = await request.json()

    if (typeof body !== 'object' || body === null) return null

    const { developerId, email } = body as Record<string, unknown>

    if (typeof developerId !== 'string') return null
    if (email !== undefined && typeof email !== 'string') return null

    return email === undefined ? { developerId } : { developerId, email }
  } catch {
    return null
  }
}

Deno.serve(async (request: Request): Promise<Response> => {
  const origin = request.headers.get('Origin')

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }

  if (request.method !== 'POST') {
    return failure('method-not-allowed', 'Use POST.', 405, origin)
  }

  const serviceRoleKey = readPrivilegedKey()
  const supabaseUrl = Deno.env.get('SUPABASE_URL')

  // Where the invitation link sends the person once Supabase has verified it.
  // Configured rather than hardcoded so the same function serves local
  // development and the deployed site.
  const redirectTo = Deno.env.get('APP_REDIRECT_URL')

  if (serviceRoleKey === undefined || supabaseUrl === undefined || redirectTo === undefined) {
    return failure(
      'misconfigured',
      'The provisioning function is missing its configuration.',
      500,
      origin,
    )
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const caller = await resolveAdminCaller(admin, request)

  if ('error' in caller) {
    return caller.error === 'unauthenticated'
      ? failure('unauthenticated', 'Sign in again and retry.', 401, origin)
      : failure('forbidden', 'Only an active administrator may provision logins.', 403, origin)
  }

  const body = await parseBody(request)

  if (body === null || !UUID_PATTERN.test(body.developerId)) {
    return failure('invalid-request', 'A valid developer id is required.', 400, origin)
  }

  // ------------------------------------------------------------- the target

  const { data: developer, error: developerError } = await admin
    .from('developers')
    .select('id, name, email, profile_id')
    .eq('id', body.developerId)
    .maybeSingle<DeveloperRow>()

  if (developerError !== null) {
    return failure('lookup-failed', 'The employee record could not be read.', 500, origin)
  }

  if (developer === null) {
    return failure('developer-not-found', 'That employee record no longer exists.', 404, origin)
  }

  // Asked first, so a duplicate click costs one read and changes nothing.
  if (developer.profile_id !== null) {
    return json(
      {
        developerId: developer.id,
        authUserId: developer.profile_id,
        email: developer.email,
        outcome: 'already-linked' satisfies ProvisionOutcome,
      },
      200,
      origin,
    )
  }

  // The record's own address wins over anything the caller sends, so the
  // login and the employee row cannot drift apart. Lowercased to match how
  // GoTrue stores it, which keeps the employee row and the account agreeing
  // on one spelling.
  const email = (developer.email ?? body.email ?? '').trim().toLowerCase()

  if (!EMAIL_PATTERN.test(email)) {
    return failure(
      'invalid-email',
      'This employee has no valid work email, so no invitation can be sent.',
      400,
      origin,
    )
  }

  // --------------------------------------------------- existing account?

  // Checked before inviting rather than after failing, because the retry case
  // matters: an earlier call may have created the account and then failed to
  // link it. Asking here turns that retry into a link instead of a second
  // identity for the same person.
  //
  // Case-insensitive to agree with the unique index, which is on
  // `lower(email)`. Escaped because LIKE reads `_` and `%` as wildcards, so
  // an address such as `first_last@example.com` would otherwise be a pattern
  // matching several people and could find the wrong one.
  const emailPattern = email.replace(/[\\%_]/g, (character) => `\\${character}`)

  const { data: existing, error: existingError } = await admin
    .from('profiles')
    .select('id, email, role, status')
    .ilike('email', emailPattern)
    .maybeSingle<ProfileRow>()

  if (existingError !== null) {
    return failure('lookup-failed', 'Existing accounts could not be checked.', 500, origin)
  }

  let authUserId: string
  let outcome: ProvisionOutcome

  if (existing === null) {
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
    })

    if (inviteError !== null || invited.user === null) {
      return failure(
        'invite-failed',
        `The invitation could not be sent: ${inviteError?.message ?? 'unknown error'}`,
        502,
        origin,
      )
    }

    authUserId = invited.user.id
    outcome = 'invited'
  } else {
    // Refused rather than overwritten. Forcing this to `developer` would
    // silently demote whoever owns the address — an administrator, in the
    // worst case — and the correct answer is that the address is taken.
    if (existing.role !== 'developer') {
      return failure(
        'email-belongs-to-other-role',
        `That address already belongs to a ${existing.role} account. Use a different work email.`,
        409,
        origin,
      )
    }

    authUserId = existing.id
    outcome = 'linked-existing'
  }

  // ------------------------------------------------------------ the profile

  // The trigger on `auth.users` has already written this row. Read it back
  // rather than assume it: if the trigger were ever changed or dropped, the
  // link below would point at nothing and only fail later, at sign-in.
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, email, role, status')
    .eq('id', authUserId)
    .maybeSingle<ProfileRow>()

  if (profileError !== null || profile === null) {
    return failure(
      'profile-missing',
      'The login account was created but its profile is missing. Contact support before retrying.',
      500,
      origin,
      { authUserId },
    )
  }

  if (profile.role !== 'developer' || profile.status !== 'active') {
    const { error: repairError } = await admin
      .from('profiles')
      .update({ role: 'developer', status: 'active' })
      .eq('id', authUserId)

    if (repairError !== null) {
      return failure(
        'profile-update-failed',
        'The login account exists but its role could not be set.',
        500,
        origin,
        { authUserId },
      )
    }
  }

  // --------------------------------------------------------------- the link

  // Conditional on the column still being empty, so two administrators acting
  // at the same moment cannot both believe they linked it. The unique
  // constraint on `profile_id` is the backstop for the same race.
  const { data: linked, error: linkError } = await admin
    .from('developers')
    .update({ profile_id: authUserId })
    .eq('id', developer.id)
    .is('profile_id', null)
    .select('id')

  if (linkError !== null) {
    return failure(
      'link-failed',
      `The login account exists but could not be attached to ${developer.name}. Retry, and if it fails again the account may already belong to another employee.`,
      500,
      origin,
      { authUserId },
    )
  }

  // Nothing updated means somebody else won the race. That is a success for
  // the person, not a failure, so it is reported as the idempotent outcome.
  if ((linked ?? []).length === 0) {
    return json(
      { developerId: developer.id, authUserId, email, outcome: 'already-linked' },
      200,
      origin,
    )
  }

  return json({ developerId: developer.id, authUserId, email, outcome }, 200, origin)
})
