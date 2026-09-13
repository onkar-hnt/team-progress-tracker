import { getSupabaseClient } from '@services/supabase/index'

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

  initialPassword?: string

  note?: string
}

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

async function describeFailure(
  error: unknown,
  functionName: string,
  nothingHappened: string,
): Promise<ProvisioningError> {
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
        `The ${functionName} function is not deployed, so ${nothingHappened}. Deploy it, then retry.`,
        'not-deployed',
      )
    }

    return new ProvisioningError(
      `The server refused the request (HTTP ${context.status}), so ${nothingHappened}.`,
      'http-error',
    )
  }

  return new ProvisioningError(
    `The ${functionName} function could not be reached, so ${nothingHappened}. If it has not been deployed yet that is the cause; otherwise check the network connection and the function logs.`,
    'unreachable',
  )
}

function isResult(value: unknown): value is ProvisionResult {
  if (typeof value !== 'object' || value === null) return false

  const candidate = value as Record<string, unknown>

  return typeof candidate.authUserId === 'string' && typeof candidate.outcome === 'string'
}

export interface PrivilegedCall<TResult> {
  functionName: string

  body: Record<string, string>

  nothingHappened: string

  /** What a successful answer looks like, checked rather than assumed. */
  isExpected: (value: unknown) => value is TResult
}

export async function invokePrivilegedFunction<TResult>({
  body,
  functionName,
  isExpected,
  nothingHappened,
}: PrivilegedCall<TResult>): Promise<TResult> {
  const client = getSupabaseClient()

  const {
    data: { session },
  } = await client.auth.getSession()

  if (session === null) {
    throw new ProvisioningError(
      `Your session has expired, so ${nothingHappened}. Sign in again and retry.`,
      'no-session',
    )
  }

  const secondsRemaining = (session.expires_at ?? 0) - Math.floor(Date.now() / 1000)
  let accessToken = session.access_token

  if (secondsRemaining < 60) {
    const { data: renewed, error: renewError } = await client.auth.refreshSession()

    if (renewError !== null || renewed.session === null) {
      throw new ProvisioningError(
        `Your session could not be renewed, so ${nothingHappened}. Sign out, sign in again, and retry.`,
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

  if (error !== null) {
    const failure = await describeFailure(error, functionName, nothingHappened)

    if (failure.code !== 'invalid-token') throw failure

    const { data: renewed, error: renewError } = await client.auth.refreshSession()

    if (renewError !== null || renewed.session === null) {
      throw new ProvisioningError(
        `Your sign-in is no longer valid on the server, so ${nothingHappened}. This happens when a session is ended elsewhere. Sign out, sign in again, and retry.`,
        'session-revoked',
      )
    }

    ;({ data, error } = await send(renewed.session.access_token))

    if (error !== null) throw await describeFailure(error, functionName, nothingHappened)
  }

  if (!isExpected(data)) {
    throw new ProvisioningError(
      'The server gave an unexpected answer, so the account state is unknown. Refresh before retrying.',
      'unexpected-response',
    )
  }

  return data
}

export async function invokeProvisioning(
  functionName: string,
  body: Record<string, string>,
): Promise<ProvisionResult> {
  return invokePrivilegedFunction({
    functionName,
    body,
    nothingHappened: 'no login was created',
    isExpected: isResult,
  })
}
