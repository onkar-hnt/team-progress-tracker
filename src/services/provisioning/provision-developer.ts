import { getSupabaseClient } from '@services/supabase/index'

/**
 * Asks the server to give an employee a login.
 *
 * The work itself happens in the `provision-developer-user` Edge Function,
 * because creating an auth account needs the service-role key and that key
 * must never reach a browser. This module is only the call and the error
 * translation — there is no Supabase Admin API use anywhere in the bundle.
 *
 * The caller's own session travels with the request, and the function
 * re-reads their role from `public.profiles` before doing anything, so an
 * administrator is proven server-side rather than assumed from the UI.
 */

/** What the server did, which decides what the admin screen says afterwards. */
export type ProvisionOutcome =
  /** A fresh account was created and an invitation email sent. */
  | 'invited'
  /** An account already existed for that address and was attached. */
  | 'linked-existing'
  /** The employee already had a login. Nothing changed. */
  | 'already-linked'

export interface ProvisionDeveloperResult {
  developerId: string
  authUserId: string
  email: string
  outcome: ProvisionOutcome
}

export interface ProvisionDeveloperInput {
  developerId: string

  /** Used only when the employee record carries no address of its own. */
  email?: string
}

/**
 * A provisioning attempt that failed, carrying enough to act on.
 *
 * `authUserId` is present only for the one failure worth separating: the
 * account was created but could not be attached to the employee. Retrying is
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
async function describeFailure(error: unknown): Promise<ProvisioningError> {
  const context = (error as { context?: unknown }).context

  if (context instanceof Response) {
    try {
      const body = (await context.json()) as FailureBody

      if (typeof body.message === 'string') {
        return new ProvisioningError(
          body.message,
          typeof body.code === 'string' ? body.code : 'unknown',
          typeof body.authUserId === 'string' ? body.authUserId : undefined,
        )
      }
    } catch {
      // Body was not JSON, so the status is the most informative thing left.
    }

    if (context.status === 404) {
      return new ProvisioningError(
        'The provisioning service is not deployed, so no login could be created. Deploy the provision-developer-user function, then retry.',
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

function isResult(value: unknown): value is ProvisionDeveloperResult {
  if (typeof value !== 'object' || value === null) return false

  const candidate = value as Record<string, unknown>

  return (
    typeof candidate.developerId === 'string' &&
    typeof candidate.authUserId === 'string' &&
    typeof candidate.outcome === 'string'
  )
}

export async function provisionDeveloperLogin(
  input: ProvisionDeveloperInput,
): Promise<ProvisionDeveloperResult> {
  const client = getSupabaseClient()

  // The caller's token, attached by hand.
  //
  // `functions.invoke` starts from the client's default headers, which already
  // carry `Authorization: Bearer <publishable key>`, and the auth-aware fetch
  // wrapper only sets that header when it is missing. So the default is never
  // replaced and the project's anon key travels where a user's token was
  // meant. The gateway accepts it — an anon key is a valid JWT — and the
  // function then cannot identify the caller at all, which is
  // indistinguishable from an expired session.
  const {
    data: { session },
  } = await client.auth.getSession()

  if (session === null) {
    throw new ProvisioningError(
      'Your session has expired, so the login could not be created. Sign in again and retry.',
      'no-session',
    )
  }

  const { data, error } = await client.functions.invoke('provision-developer-user', {
    body: input,
    headers: { Authorization: `Bearer ${session.access_token}` },
  })

  if (error !== null) throw await describeFailure(error)

  if (!isResult(data)) {
    throw new ProvisioningError(
      'The server gave an unexpected answer, so the account state is unknown. Refresh before retrying.',
      'unexpected-response',
    )
  }

  return data
}
