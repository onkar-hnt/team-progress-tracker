import type { AppSupabaseClient } from './supabase-client'

/**
 * The transport every Supabase request goes through, with one retry behind a
 * forced token refresh.
 *
 * `autoRefreshToken` and `getSession()` between them already renew a token
 * that the browser can see has expired: `getSession()` is what resolves the
 * `Authorization` header for every request, and it refreshes when the stored
 * token is inside its expiry margin. That covers the ordinary case, and it is
 * why most long sessions never notice anything.
 *
 * What it does not cover is a token the *server* rejects while the browser
 * still believes it is good, which is the case behind "it threw an error when
 * I saved":
 *
 * - A clock that is out by more than the expiry margin. The browser compares
 *   `expires_at` against its own clock, so a machine running a few minutes
 *   fast sees a live token and sends it; the auth server disagrees, and no
 *   amount of waiting fixes it because the local check keeps passing.
 * - A background refresh that failed earlier — the refresh ticker stops while
 *   the tab is hidden — leaving a token that expired before the tab came back.
 * - A request already in flight when the token expired underneath it.
 *
 * Left alone each of these surfaces as a rejected write. The work is still in
 * the form, but the person has to notice the message, and pressing Save again
 * is the only thing that helps — which is exactly the retry this does for
 * them.
 *
 * The same pattern is applied by hand for Edge Function calls in
 * `provision-login.ts`; this puts it under every read and write instead, so no
 * repository has to remember it.
 */

/** What both PostgREST and the Edge gateway answer with when they reject a token. */
const UNAUTHORIZED = 401

/**
 * Requests to the auth server itself, which must never be retried this way.
 *
 * A refresh is issued as a request like any other and so arrives back here. A
 * rejected refresh answering 401 would otherwise ask for another refresh,
 * without end. It is also the wrong response: a refresh token the server
 * refuses is the one failure a new token cannot fix.
 */
function isAuthRequest(url: string): boolean {
  return url.includes('/auth/v1/')
}

function readUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

/**
 * Whether the request can be sent a second time.
 *
 * A body that is a stream has already been consumed by the first attempt and
 * cannot be replayed. PostgREST sends JSON strings, so this holds in practice;
 * it is checked rather than assumed so that a future caller passing a stream
 * degrades to the old behaviour instead of sending an empty body.
 *
 * Replaying is safe for the statement itself: a 401 is refused at the gateway,
 * before anything reaches the database, so there is no risk of the first
 * attempt having half-applied a write.
 */
function canReplay(init: RequestInit | undefined): boolean {
  const body = init?.body

  if (body === undefined || body === null) return true
  return typeof body === 'string' || body instanceof URLSearchParams
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

/**
 * `getClient` is a callback rather than the client itself because the client
 * owns this wrapper: it is built while the client is being constructed, and
 * cannot hold something that does not exist yet. Requests the auth client
 * makes during its own initialisation therefore find nothing here, which is
 * correct — those are auth requests, and skipped regardless.
 */
export function createSessionRecoveringFetch(
  getClient: () => AppSupabaseClient | undefined,
): FetchLike {
  return async (input, init) => {
    const response = await fetch(input, init)

    // Only a rejected token. A 403 is row-level security refusing the row,
    // which is the database deciding correctly and must be reported, not
    // retried with a different token.
    if (response.status !== UNAUTHORIZED) return response
    if (isAuthRequest(readUrl(input))) return response
    if (!canReplay(init)) return response

    const client = getClient()
    if (client === undefined) return response

    // Forced rather than `getSession()`, which would consult the same local
    // expiry the server has just contradicted and hand back the token that was
    // refused. Concurrent callers are collapsed onto one request by the auth
    // client, so a screen whose queries all fail together refreshes once.
    const renewed = await client.auth.refreshSession()
    const token = renewed.data.session?.access_token

    // Nothing better to send. The original response is returned so the caller
    // reports the rejected token, which is what happened: the mapping for
    // PostgREST's `PGRST301` already asks the person to sign in again, and by
    // this point that is genuinely what is needed.
    if (renewed.error !== null || token === undefined) return response

    const headers = new Headers(init?.headers)
    if (headers.get('Authorization') === `Bearer ${token}`) return response

    headers.set('Authorization', `Bearer ${token}`)

    // The global `fetch`, not this wrapper, so a second rejection is reported
    // rather than starting again.
    return fetch(input, { ...init, headers })
  }
}
