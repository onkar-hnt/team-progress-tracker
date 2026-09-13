import type { AppSupabaseClient } from './supabase-client'

/** What both PostgREST and the Edge gateway answer with when they reject a token. */
const UNAUTHORIZED = 401

function isAuthRequest(url: string): boolean {
  return url.includes('/auth/v1/')
}

function readUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

function canReplay(init: RequestInit | undefined): boolean {
  const body = init?.body

  if (body === undefined || body === null) return true
  return typeof body === 'string' || body instanceof URLSearchParams
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export function createSessionRecoveringFetch(
  getClient: () => AppSupabaseClient | undefined,
): FetchLike {
  return async (input, init) => {
    const response = await fetch(input, init)

    if (response.status !== UNAUTHORIZED) return response
    if (isAuthRequest(readUrl(input))) return response
    if (!canReplay(init)) return response

    const client = getClient()
    if (client === undefined) return response

    const renewed = await client.auth.refreshSession()
    const token = renewed.data.session?.access_token

    if (renewed.error !== null || token === undefined) return response

    const headers = new Headers(init?.headers)
    if (headers.get('Authorization') === `Bearer ${token}`) return response

    headers.set('Authorization', `Bearer ${token}`)

    // The global `fetch`, not this wrapper, so a second rejection is reported
    // rather than starting again.
    return fetch(input, { ...init, headers })
  }
}
