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

type ProvisionOutcome = 'created' | 'linked-existing' | 'already-linked'

/**
 * The initial password, derived from the employee's first name.
 *
 * A deliberate decision by the team, taken over emailing an invitation, so
 * that onboarding does not depend on the mail service. The consequence is
 * that the password is predictable from information that is not secret —
 * names and the address pattern are both public — so it protects nothing on
 * its own. What makes it acceptable is `profiles.must_change_password`: the
 * account cannot reach any screen until this password has been replaced.
 *
 * The rule, exactly:
 *
 *   1. Trim the name and split it on whitespace; take the first word.
 *   2. Remove every character that is not A-Z, a-z or 0-9. Case is kept as
 *      entered, so "Shubham Deshmukh" gives "Shubham".
 *   3. If fewer than three characters survive, use the whole name with the
 *      same characters removed instead.
 *   4. If that is still under three characters, use "Employee".
 *   5. Append "@123".
 *
 * "Shubham Deshmukh" -> "Shubham@123".
 *
 * Mirrored in SQL as `public.initial_password_for`, which is what decides
 * whether the password has actually been replaced. The two must not drift.
 */
function initialPasswordFor(name: string): string {
  const strip = (value: string) => value.replace(/[^A-Za-z0-9]/g, '')
  const [first = ''] = name.trim().split(/\s+/)

  const firstWord = strip(first)
  const whole = strip(name)

  // Supabase refuses anything under six characters, which a very short first
  // name would produce. Falling back to the whole name keeps the result
  // something an administrator can still work out, rather than padding it
  // with characters nobody could guess.
  const stem = firstWord.length >= 3 ? firstWord : whole.length >= 3 ? whole : 'Employee'

  return `${stem}@123`
}

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
function readPrivilegedKey(): { key: string | undefined; source: string } {
  // The legacy variable first, despite being the deprecated path, because it
  // holds exactly one key and so cannot be read wrongly. The dictionary can:
  // it may carry several keys, and picking by position means a platform-side
  // reordering silently changes which one this function authenticates with.
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (legacy !== undefined && legacy !== '') {
    return { key: legacy, source: 'SUPABASE_SERVICE_ROLE_KEY' }
  }

  const dictionary = Deno.env.get('SUPABASE_SECRET_KEYS')

  if (dictionary !== undefined) {
    try {
      const keys = JSON.parse(dictionary) as Record<string, unknown>
      const values = Object.entries(keys).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== '',
      )

      // A named default, else a key that announces itself as a secret one,
      // else the first available — in that order, so position is only ever
      // the last resort.
      const chosen =
        values.find(([name]) => name === 'default') ??
        values.find(([, value]) => value.startsWith('sb_secret_')) ??
        values[0]

      if (chosen !== undefined) {
        return { key: chosen[1], source: `SUPABASE_SECRET_KEYS[${chosen[0]}]` }
      }
    } catch {
      // Not the dictionary we expected, and no legacy variable to fall back on.
    }
  }

  return { key: undefined, source: 'none' }
}

function corsHeaders(origin: string | null, request?: Request): Record<string, string> {
  if (origin === null || !ALLOWED_ORIGINS.has(origin)) return {}

  // Reflected rather than listed. `supabase-js` attaches its own headers to
  // an invoke — `x-client-info` and `apikey` alongside the obvious two — and
  // a preflight that omits even one of them makes the browser refuse to send
  // the request at all. That failure is invisible from the client: no status,
  // no body, nothing to read but "could not be reached". Guessing the list
  // is what caused exactly that, so the list is no longer guessed.
  //
  // Echoing back whatever was asked for is safe because the origin has
  // already been checked against the allowlist above; a browser will not send
  // this header for an origin it was refused.
  const requested = request?.headers.get('Access-Control-Request-Headers')

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers':
      requested === null || requested === undefined || requested.trim() === ''
        ? 'authorization, x-client-info, apikey, content-type'
        : requested,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin, Access-Control-Request-Headers',
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
 * Why a caller was turned away.
 *
 * Separated because one message for four causes is not diagnosable. "Sign in
 * again" is sound advice for an expired token and a waste of everybody's time
 * when the real problem is a misconfigured key on this side — and from the
 * browser the two are indistinguishable.
 */
type CallerRejection =
  /** No bearer token on the request at all. */
  | 'missing-header'
  /** The auth server would not resolve the token to a user. */
  | 'invalid-token'
  /** A valid account with no `public.profiles` row. */
  | 'no-profile'
  /** A real profile, but not an active administrator. */
  | 'not-admin'

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
): Promise<{ user: User } | { rejection: CallerRejection }> {
  const header = request.headers.get('Authorization')

  if (header === null || !header.startsWith('Bearer ')) return { rejection: 'missing-header' }

  const { data, error } = await admin.auth.getUser(header.slice('Bearer '.length))

  if (error !== null || data.user === null) {
    // Logged rather than returned. The cause is often something only this
    // side can see — a rejected service key looks exactly like an expired
    // user token from the browser — and the detail belongs in the function
    // logs, not in a response to a caller who has not been identified yet.
    console.error('provision-developer-user: token not resolved', {
      message: error?.message,
      status: error?.status,
    })

    return { rejection: 'invalid-token' }
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, role, status')
    .eq('id', data.user.id)
    .maybeSingle<Pick<ProfileRow, 'id' | 'role' | 'status'>>()

  if (profileError !== null) {
    console.error('provision-developer-user: profile lookup failed', profileError)
    return { rejection: 'no-profile' }
  }

  if (profile === null) return { rejection: 'no-profile' }
  if (profile.role !== 'admin' || profile.status !== 'active') return { rejection: 'not-admin' }

  return { user: data.user }
}

/** Each rejection gets the status and the wording that actually fits it. */
function describeRejection(rejection: CallerRejection): { status: number; message: string } {
  switch (rejection) {
    case 'missing-header':
      return { status: 401, message: 'The request carried no sign-in token. Sign in again.' }
    case 'invalid-token':
      return {
        status: 401,
        message:
          'The sign-in token was not accepted by the authentication server. If signing in again does not help, check this function’s logs — a rejected key on the server looks the same from here.',
      }
    case 'no-profile':
      return {
        status: 403,
        message: 'Your account has no profile record, so its role cannot be established.',
      }
    case 'not-admin':
      return { status: 403, message: 'Only an active administrator may provision logins.' }
  }
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

async function handle(request: Request, origin: string | null): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin, request) })
  }

  if (request.method !== 'POST') {
    return failure('method-not-allowed', 'Use POST.', 405, origin)
  }

  const { key: serviceRoleKey, source: keySource } = readPrivilegedKey()
  const supabaseUrl = Deno.env.get('SUPABASE_URL')

  // `APP_REDIRECT_URL` is no longer read. It existed to tell an invitation
  // link where to land, and accounts are now created with a password instead
  // of invited. The secret can stay set; it costs nothing and would be needed
  // again if invitations ever come back.
  if (serviceRoleKey === undefined || supabaseUrl === undefined) {
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

  if ('rejection' in caller) {
    // A refused token and a refused key are the same 401 from here: the auth
    // server is sent the caller's token *and* this function's key, and says
    // only that it did not like the pair. Telling an administrator to sign in
    // again when the fault is a key they cannot see wastes their afternoon, so
    // the key gets tested before the blame is assigned.
    if (caller.rejection === 'invalid-token') {
      const { error: keyError } = await admin.from('profiles').select('id').limit(1)

      if (keyError !== null) {
        console.error('provision-developer-user: privileged key refused', {
          source: keySource,
          message: keyError.message,
        })

        return failure(
          'server-key-rejected',
          'The provisioning function is not authenticating correctly with Supabase, so no login was created. This is a server configuration fault, not a problem with your sign-in — the function needs redeploying.',
          500,
          origin,
        )
      }

      // The key works, so it really was the caller's token.
      console.error('provision-developer-user: caller token refused, key is good', keySource)
    }

    const { message, status } = describeRejection(caller.rejection)
    return failure(caller.rejection, message, status, origin)
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
  let initialPassword: string | undefined

  if (existing === null) {
    const password = initialPasswordFor(developer.name)

    // Created with a password rather than invited, so provisioning never
    // depends on the mail service. `email_confirm` is set because nobody will
    // receive a confirmation link to click, and the display name is passed
    // through so the trigger writes the person's real name to their profile
    // instead of falling back to the local part of their address.
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,

      // Only the display name. The password-change requirement used to be set
      // here too and is now a column on `public.profiles`, because metadata
      // is writable by the account holder: one `auth.updateUser` call from
      // the browser console lifted the requirement without changing any
      // password. The trigger on `auth.users` sets the column instead.
      user_metadata: { display_name: developer.name },
    })

    if (createError !== null || created.user === null) {
      return failure(
        'create-failed',
        `The login account could not be created: ${createError?.message ?? 'unknown error'}`,
        502,
        origin,
      )
    }

    authUserId = created.user.id
    outcome = 'created'
    initialPassword = password
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

    // `must_change_password` is deliberately left as it stands. This branch
    // sets no password — the account already had one — so the existing flag
    // is already the right answer: still true if a previous provisioning
    // issued a temporary password nobody has replaced, already false if they
    // have. Forcing it true would make somebody re-choose a password they
    // chose themselves.
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

  // The password is returned so the administrator can pass it on. Withholding
  // it would not protect anything: it is derived from the person's name by a
  // fixed rule, so anyone who knows the rule already knows the password.
  return json(
    {
      developerId: developer.id,
      authUserId,
      email,
      outcome,
      ...(initialPassword === undefined ? {} : { initialPassword }),
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
    // An uncaught throw becomes a platform 500 with no CORS headers, which
    // the browser blocks before any status reaches JavaScript. The admin
    // screen can then only say the service was unreachable — true, and
    // useless. Answering here keeps the diagnosis in the response, where
    // whoever clicked the button can actually read it.
    return failure(
      'unhandled',
      `The provisioning function failed unexpectedly: ${
        error instanceof Error ? error.message : String(error)
      }`,
      500,
      origin,
    )
  }
})
