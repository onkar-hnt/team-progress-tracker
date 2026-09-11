import { getSupabaseClient } from '@services/supabase/index'

/**
 * Asks the server to give somebody a login.
 *
 * The work itself happens in an Edge Function, because creating an auth
 * account needs the service-role key and that key must never reach a browser.
 * This module is only the call and the error translation — there is no
 * Supabase Admin API use anywhere in the bundle.
 *
 * The caller's own session travels with the request, and the function
 * re-reads their role from `public.profiles` before doing anything, so an
 * administrator is proven server-side rather than assumed from the UI.
 *
 * Employees and mentors go to different functions but share everything else,
 * so the difference is one argument and not a second copy of this file.
 */

/** What the server did, which decides what the admin screen says afterwards. */
export type ProvisionOutcome =
  /** A fresh account was created with an initial password. */
  | 'created'
  /** An account already existed for that address and was attached. */
  | 'linked-existing'
  /** They already had a login. Nothing changed. */
  | 'already-linked'

export interface ProvisionResult {
  authUserId: string
  email: string
  outcome: ProvisionOutcome

  /**
   * The password the account was created with, on `created` only.
   *
   * Present so the administrator can pass it on, since no email is sent.
   * It is derived from the person's name by a fixed rule, so it is guessable
   * by anyone who knows the rule and is meant to be replaced by them as soon
   * as they have signed in.
   */
  initialPassword?: string

  /**
   * Something the administrator should know that is not a failure.
   *
   * Used where the server declined to make a judgement on their behalf —
   * linking a mentor record to an existing employee login without deciding
   * which of the two roles that person should now have.
   */
  note?: string
}

/**
 * A provisioning attempt that failed, carrying enough to act on.
 *
 * `authUserId` is present only for the one failure worth separating: the
 * account was created but could not be attached to the record. Retrying is
 * safe — the function finds the existing account instead of making a second
 * one — but an administrator should know an account is out there.
 */
export class ProvisioningError extends Error {
  readonly code: string
  readonly authUserId: string | undefined

  constructor(message: string, code: string, authUserId?: string) {
    super(message)
    this.name = 'ProvisioningError'
    this.code = code
    this.authUserId = authUserId
  }
}

interface FailureBody {
  code?: unknown
  message?: unknown
  authUserId?: unknown

  /** The upstream reason, when the function has one worth repeating. */
  detail?: unknown
}

/**
 * Reads the structured failure the function returns.
 *
 * `supabase-js` surfaces a non-2xx as an opaque "Edge Function returned a
 * non-2xx status code" and hides the body on `context`, so without this the
 * administrator would see nothing they could act on.
 *
 * The three cases are deliberately distinguished, because they call for
 * different people to do different things. A structured body is the function
 * itself explaining a decision. A bare status is the platform refusing before
 * the function ran. And no response at all means the request never completed
 * — which, on a project where this has not been deployed, is by far the
 * likeliest outcome and the one worth naming rather than describing as a
 * failure to try again.
 */
async function describeFailure(error: unknown, functionName: string): Promise<ProvisioningError> {
  const context = (error as { context?: unknown }).context

  if (context instanceof Response) {
    try {
      const body = (await context.json()) as FailureBody

      if (typeof body.message === 'string') {
        const detail = typeof body.detail === 'string' ? ` (${body.detail})` : ''

        return new ProvisioningError(
          `${body.message}${detail}`,
          typeof body.code === 'string' ? body.code : 'unknown',
          typeof body.authUserId === 'string' ? body.authUserId : undefined,
        )
      }
    } catch {
      // Body was not JSON, so the status is the most informative thing left.
    }

    if (context.status === 404) {
      return new ProvisioningError(
        `The provisioning service is not deployed, so no login could be created. Deploy the ${functionName} function, then retry.`,
        'not-deployed',
      )
    }

    return new ProvisioningError(
      `The provisioning service refused the request (HTTP ${context.status}).`,
      'http-error',
    )
  }

  // No response reached JavaScript. A missing function answers the preflight
  // with a 404 that carries no CORS headers, so the browser blocks it and the
  // status never arrives — indistinguishable here from being offline.
  return new ProvisioningError(
    'The provisioning service could not be reached, so no login was created. If it has not been deployed yet that is the cause; otherwise check the network connection and the function logs.',
    'unreachable',
  )
}

function isResult(value: unknown): value is ProvisionResult {
  if (typeof value !== 'object' || value === null) return false

  const candidate = value as Record<string, unknown>

  return typeof candidate.authUserId === 'string' && typeof candidate.outcome === 'string'
}

/**
 * Invokes a provisioning function with the administrator's own token.
 *
 * `functions.invoke` starts from the client's default headers, which already
 * carry `Authorization: Bearer <publishable key>`, and the auth-aware fetch
 * wrapper only sets that header when it is missing. So the default is never
 * replaced and the project's anon key travels where a user's token was meant.
 * The gateway accepts it — an anon key is a valid JWT — and the function then
 * cannot identify the caller at all, which is indistinguishable from an
 * expired session. Hence the header by hand.
 */
export async function invokeProvisioning(
  functionName: string,
  body: Record<string, string>,
): Promise<ProvisionResult> {
  const client = getSupabaseClient()

  const {
    data: { session },
  } = await client.auth.getSession()

  if (session === null) {
    throw new ProvisioningError(
      'Your session has expired, so the login could not be created. Sign in again and retry.',
      'no-session',
    )
  }

  // `getSession` hands back what is stored and refreshes only when it judges
  // the token already expired. A token with seconds left on it, or one whose
  // background refresh failed earlier in a tab that has been open for hours,
  // still comes back stale — and the function then rejects it with a message
  // telling the administrator to sign in again, which is not what fixes it.
  // Checking the expiry here costs one comparison and removes that whole
  // class of failure.
  const secondsRemaining = (session.expires_at ?? 0) - Math.floor(Date.now() / 1000)
  let accessToken = session.access_token

  if (secondsRemaining < 60) {
    const { data: renewed, error: renewError } = await client.auth.refreshSession()

    if (renewError !== null || renewed.session === null) {
      throw new ProvisioningError(
        'Your session could not be renewed, so the login was not created. Sign out, sign in again, and retry.',
        'session-expired',
      )
    }

    accessToken = renewed.session.access_token
  }

  const send = async (token: string) =>
    client.functions.invoke(functionName, {
      body,
      headers: { Authorization: `Bearer ${token}` },
    })

  let { data, error } = await send(accessToken)

  // A token the auth server will not accept, retried once behind a refresh.
  //
  // The case this exists for is a session that has been ended server-side —
  // by a password change, or by the account being deleted and recreated —
  // while the browser still holds a signed, unexpired token for it. Nothing
  // notices, because PostgREST checks only the signature and so every screen
  // keeps working; it is the auth server, which also looks the session up,
  // that refuses. Left alone this persists until the token expires an hour
  // later, and no amount of retrying the action helps.
  if (error !== null) {
    const failure = await describeFailure(error, functionName)

    if (failure.code !== 'invalid-token') throw failure

    const { data: renewed, error: renewError } = await client.auth.refreshSession()

    if (renewError !== null || renewed.session === null) {
      throw new ProvisioningError(
        'Your sign-in is no longer valid on the server, so no login was created. This happens when a session is ended elsewhere. Sign out, sign in again, and retry.',
        'session-revoked',
      )
    }

    ;({ data, error } = await send(renewed.session.access_token))

    if (error !== null) throw await describeFailure(error, functionName)
  }

  if (!isResult(data)) {
    throw new ProvisioningError(
      'The server gave an unexpected answer, so the account state is unknown. Refresh before retrying.',
      'unexpected-response',
    )
  }

  return data
}
