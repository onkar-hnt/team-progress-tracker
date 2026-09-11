import { createClient } from 'jsr:@supabase/supabase-js@2'
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

/**
 * Gives an existing business row — an employee or a mentor — a login.
 *
 * This runs on the server because it is the only place the service-role key
 * may exist. That key bypasses row-level security entirely, so the whole
 * module is written as a gate: establish who is calling, prove they are an
 * active administrator, and only then touch anything.
 *
 * It deliberately does not create the business record. The admin screens
 * already do that through the ordinary RLS-checked path, and keeping the two
 * apart means a provisioning failure never leaves a half-written row behind —
 * the record exists either way, and provisioning can be retried against it.
 *
 * Idempotent by design. Every step asks what is already true before acting,
 * because the expensive failure here is a second identity for one person: two
 * auth users with the same address, one of them linked to nothing.
 *
 * Shared by both entry points rather than copied, so that the mentor flow
 * cannot drift away from the employee flow it is meant to match. Everything
 * that differs between them is in `ProvisionTarget` and nowhere else.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Deliberately permissive. The authority on deliverability is the mail server. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Origins allowed to call these functions.
 *
 * The deployed site and local development. An unknown origin is answered
 * without CORS headers, so the browser refuses the response.
 */
const ALLOWED_ORIGINS = new Set([
  'https://onkar-hnt.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
])

export type ProvisionOutcome = 'created' | 'linked-existing' | 'already-linked'

/** Everything that differs between provisioning an employee and a mentor. */
export interface ProvisionTarget {
  /** Used in log lines, so a message can be traced to an entry point. */
  functionName: string

  /** The business table holding the row being given a login. */
  table: 'developers' | 'mentors'

  /** The role the profile must end up with. Never `admin`. */
  role: 'developer' | 'mentor'

  /** The id field on the request, and the id field on the response. */
  idField: 'developerId' | 'mentorId'

  /** What to call one of these people in a message to an administrator. */
  noun: string
}

/**
 * The initial password, derived from the person's first name.
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
 * whether the password has actually been replaced, and in TypeScript as
 * `src/services/auth/initial-password.ts`. The three must not drift.
 */
export function initialPasswordFor(name: string): string {
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
  rowId: string
  email?: string
}

interface ProfileRow {
  id: string
  email: string
  role: string
  status: string
}

interface TargetRow {
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
  /** A real profile, but not an active administrator or mentor. */
  | 'not-privileged'

/**
 * The caller, if they are an active administrator or mentor.
 *
 * The role is read from `public.profiles` rather than from the token: a JWT
 * carries whatever `user_metadata` the account holder has set on themselves,
 * so trusting it here would let anybody with a login provision accounts.
 *
 * Mentors are accepted because they maintain the roster, and a roster entry
 * without a login is half an employee. It grants them no way upwards: the
 * role is set through `assign_profile_role`, which refuses anything but
 * developer and mentor, and an address already belonging to an administrator
 * is turned away below.
 */
async function resolvePrivilegedCaller(
  admin: SupabaseClient,
  request: Request,
  supabaseUrl: string,
  serviceRoleKey: string,
  functionName: string,
): Promise<{ user: { id: string } } | { rejection: CallerRejection; detail?: string }> {
  const header = request.headers.get('Authorization')

  if (header === null || !header.startsWith('Bearer ')) return { rejection: 'missing-header' }

  const token = header.slice('Bearer '.length).trim()

  if (token === '') return { rejection: 'missing-header' }

  // Asked of the auth server directly rather than through `auth.getUser()`.
  //
  // That method spent an afternoon reporting "Auth session missing!", which
  // is the client library's own error for having no JWT to work with — it
  // never made a request, so nothing had rejected anything. The import is
  // unpinned (`@2`), so each deploy resolves to whatever the latest 2.x is,
  // and the behaviour of passing a token to `getUser` changed underneath a
  // call site that had been working. One `fetch` against the documented
  // endpoint has no such semantics to change, and whatever comes back is the
  // auth server actually speaking.
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: serviceRoleKey },
  })

  if (!response.ok) {
    const body = await response.text()

    console.error(`${functionName}: token not resolved`, { status: response.status, body })

    // Returned as well as logged. This was logs-only on the reasoning that a
    // caller who has not been identified should be told as little as
    // possible, which was the wrong call in practice: nobody reads function
    // logs mid-task, so the one sentence that says whether a token is
    // expired, malformed, or attached to a session that no longer exists
    // never reached the person who could act on it. It describes the
    // caller's own token and gives away nothing they do not hold already.
    return {
      rejection: 'invalid-token',
      detail: `${body.slice(0, 200)} (HTTP ${response.status})`,
    }
  }

  const user = (await response.json()) as { id?: unknown }

  if (typeof user.id !== 'string') {
    return { rejection: 'invalid-token', detail: 'The auth server returned no user id.' }
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, role, status')
    .eq('id', user.id)
    .maybeSingle<Pick<ProfileRow, 'id' | 'role' | 'status'>>()

  if (profileError !== null) {
    console.error(`${functionName}: profile lookup failed`, profileError)
    return { rejection: 'no-profile' }
  }

  if (profile === null) return { rejection: 'no-profile' }
  if (
    (profile.role !== 'admin' && profile.role !== 'mentor') ||
    profile.status !== 'active'
  ) {
    return { rejection: 'not-privileged' }
  }

  return { user: { id: user.id } }
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
    case 'not-privileged':
      return {
        status: 403,
        message: 'Only an active administrator or mentor may provision logins.',
      }
  }
}

async function parseBody(
  request: Request,
  idField: ProvisionTarget['idField'],
): Promise<ProvisionRequest | null> {
  try {
    const body: unknown = await request.json()

    if (typeof body !== 'object' || body === null) return null

    const fields = body as Record<string, unknown>
    const rowId = fields[idField]
    const { email } = fields

    if (typeof rowId !== 'string') return null
    if (email !== undefined && typeof email !== 'string') return null

    return email === undefined ? { rowId } : { rowId, email }
  } catch {
    return null
  }
}

/**
 * What to do with an account that already exists for this address.
 *
 * The cross-role case is the interesting one, and it is the reason this is a
 * decision rather than a comparison. One person is often both a mentor and a
 * developer, and `profiles.role` holds a single value — so linking a mentor
 * row to somebody's existing developer profile has to choose between leaving
 * them as a developer and silently taking their developer access away.
 *
 * It leaves them alone and says so. Which of the two a person should be is a
 * judgement about their job, and quietly making it on their behalf while an
 * administrator was doing something else is how access ends up wrong.
 */
function decideExisting(
  existing: ProfileRow,
  target: ProvisionTarget,
): { link: true; setRole: boolean; note?: string } | { refuse: string } {
  if (existing.role === 'admin') {
    return {
      refuse: 'That address already belongs to an administrator account. Use a different work email.',
    }
  }

  if (existing.role === target.role) return { link: true, setRole: true }

  if (target.role === 'mentor' && existing.role === 'developer') {
    return {
      link: true,
      setRole: false,
      note: 'They already had an employee login, which is now linked to this mentor record. Their access role is still Developer — change it on the Employees screen if they should see team data.',
    }
  }

  return {
    refuse: `That address already belongs to a ${existing.role} account. Use a different work email.`,
  }
}

async function handle(
  request: Request,
  origin: string | null,
  target: ProvisionTarget,
): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin, request) })
  }

  if (request.method !== 'POST') {
    return failure('method-not-allowed', 'Use POST.', 405, origin)
  }

  const { key: serviceRoleKey, source: keySource } = readPrivilegedKey()
  const supabaseUrl = Deno.env.get('SUPABASE_URL')

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

  const caller = await resolvePrivilegedCaller(
    admin,
    request,
    supabaseUrl,
    serviceRoleKey,
    target.functionName,
  )

  if ('rejection' in caller) {
    // A refused token and a refused key are the same 401 from here: the auth
    // server is sent the caller's token *and* this function's key, and says
    // only that it did not like the pair. Telling an administrator to sign in
    // again when the fault is a key they cannot see wastes their afternoon, so
    // the key gets tested before the blame is assigned.
    if (caller.rejection === 'invalid-token') {
      const { error: keyError } = await admin.from('profiles').select('id').limit(1)

      if (keyError !== null) {
        console.error(`${target.functionName}: privileged key refused`, {
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
      console.error(`${target.functionName}: caller token refused, key is good`, keySource)
    }

    const { message, status } = describeRejection(caller.rejection)

    return failure(caller.rejection, message, status, origin, {
      ...(caller.detail === undefined ? {} : { detail: caller.detail }),
    })
  }

  const body = await parseBody(request, target.idField)

  if (body === null || !UUID_PATTERN.test(body.rowId)) {
    return failure('invalid-request', `A valid ${target.noun} id is required.`, 400, origin)
  }

  // ------------------------------------------------------------- the target

  const { data: row, error: rowError } = await admin
    .from(target.table)
    .select('id, name, email, profile_id')
    .eq('id', body.rowId)
    .maybeSingle<TargetRow>()

  if (rowError !== null) {
    return failure('lookup-failed', `The ${target.noun} record could not be read.`, 500, origin)
  }

  if (row === null) {
    return failure('target-not-found', `That ${target.noun} record no longer exists.`, 404, origin)
  }

  // Asked first, so a duplicate click costs one read and changes nothing.
  if (row.profile_id !== null) {
    return json(
      {
        [target.idField]: row.id,
        authUserId: row.profile_id,
        email: row.email,
        outcome: 'already-linked' satisfies ProvisionOutcome,
      },
      200,
      origin,
    )
  }

  // The record's own address wins over anything the caller sends, so the
  // login and the business row cannot drift apart. Lowercased to match how
  // GoTrue stores it, which keeps the two agreeing on one spelling.
  const email = (row.email ?? body.email ?? '').trim().toLowerCase()

  if (!EMAIL_PATTERN.test(email)) {
    return failure(
      'invalid-email',
      `This ${target.noun} has no valid work email, so no login can be created.`,
      400,
      origin,
    )
  }

  // --------------------------------------------------- existing account?

  // Checked before creating rather than after failing, because the retry case
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
  let note: string | undefined
  let shouldSetRole: boolean

  if (existing === null) {
    const password = initialPasswordFor(row.name)

    // Created with a password rather than invited, so provisioning never
    // depends on the mail service. `email_confirm` is set because nobody will
    // receive a confirmation link to click, and the display name is passed
    // through so the trigger writes the person's real name to their profile
    // instead of falling back to the local part of their address.
    //
    // Only the display name goes into metadata. The password-change
    // requirement is a column on `public.profiles`, because metadata is
    // writable by the account holder: one `auth.updateUser` call from the
    // browser console would lift the requirement without changing any
    // password. The trigger on `auth.users` sets the column instead.
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: row.name },
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

    // The trigger defaults everybody who is not the bootstrap administrator
    // to `developer`, so a mentor needs correcting and an employee does not.
    shouldSetRole = target.role !== 'developer'
  } else {
    const decision = decideExisting(existing, target)

    if ('refuse' in decision) {
      return failure('email-belongs-to-other-role', decision.refuse, 409, origin)
    }

    // No password is set on this branch — the account already had one — so
    // `must_change_password` is left exactly as it stands. It is already the
    // right answer: still true if an earlier provisioning issued a temporary
    // password nobody has replaced, already false if they have. Forcing it
    // true would make somebody re-choose a password they chose themselves.
    authUserId = existing.id
    outcome = 'linked-existing'
    shouldSetRole = decision.setRole && (existing.role !== target.role || existing.status !== 'active')
    note = decision.note
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

  if (shouldSetRole || profile.status !== 'active') {
    // Through a database function rather than a plain UPDATE. The guard on
    // `public.profiles` refuses role and status changes from anyone who is
    // not an administrator, and `auth.uid()` is null under the service key —
    // so this function is nobody as far as that guard is concerned. The
    // function is executable by the service role and by nothing else.
    const { error: assignError } = await admin.rpc('assign_profile_role', {
      p_profile_id: authUserId,
      p_role: shouldSetRole ? target.role : profile.role,
    })

    if (assignError !== null) {
      console.error(`${target.functionName}: role assignment failed`, assignError)

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
    .from(target.table)
    .update({ profile_id: authUserId })
    .eq('id', row.id)
    .is('profile_id', null)
    .select('id')

  if (linkError !== null) {
    return failure(
      'link-failed',
      `The login account exists but could not be attached to ${row.name}. Retry, and if it fails again the account may already belong to somebody else.`,
      500,
      origin,
      { authUserId },
    )
  }

  // Nothing updated means somebody else won the race. That is a success for
  // the person, not a failure, so it is reported as the idempotent outcome.
  if ((linked ?? []).length === 0) {
    return json(
      { [target.idField]: row.id, authUserId, email, outcome: 'already-linked' },
      200,
      origin,
    )
  }

  // The password is returned so the administrator can pass it on. Withholding
  // it would not protect anything: it is derived from the person's name by a
  // fixed rule, so anyone who knows the rule already knows the password.
  return json(
    {
      [target.idField]: row.id,
      authUserId,
      email,
      outcome,
      ...(initialPassword === undefined ? {} : { initialPassword }),
      ...(note === undefined ? {} : { note }),
    },
    200,
    origin,
  )
}

/**
 * Wraps the flow in the error handling every entry point needs.
 *
 * An uncaught throw becomes a platform 500 with no CORS headers, which the
 * browser blocks before any status reaches JavaScript. The admin screen can
 * then only say the service was unreachable — true, and useless. Answering
 * here keeps the diagnosis in the response, where whoever clicked the button
 * can actually read it.
 */
export function serveProvisioning(target: ProvisionTarget): void {
  Deno.serve(async (request: Request): Promise<Response> => {
    const origin = request.headers.get('Origin')

    try {
      return await handle(request, origin, target)
    } catch (error) {
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
}
