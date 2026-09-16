/**
 * Where the access token lives between page loads.
 *
 * Versioned, so a future change of shape invalidates old tokens instead of
 * being misread. Kept in `localStorage` because a refresh — or a second tab —
 * must not force somebody to sign in again.
 */
const TOKEN_STORAGE_KEY = 'team-progress-tracker.access-token.v1'

/** A token that expires within this window is treated as already gone. */
const CLOCK_SKEW_MS = 30_000

export interface StoredToken {
  readonly accessToken: string

  /** ISO-8601, as the sign-in response states it. */
  readonly expiresAt: string
}

/** Storage is unavailable in some privacy modes, so never assume it exists. */
function readLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function hasExpired(expiresAt: string): boolean {
  const expiry = Date.parse(expiresAt)
  if (Number.isNaN(expiry)) return true

  return expiry - CLOCK_SKEW_MS <= Date.now()
}

export function storeToken(token: StoredToken): void {
  readLocalStorage()?.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token))
}

export function clearToken(): void {
  readLocalStorage()?.removeItem(TOKEN_STORAGE_KEY)
}

/**
 * The stored token, or `null` when there is none, it is unreadable, or it has
 * expired. An expired token is discarded rather than sent, which is what
 * turns a stale tab into a sign-in prompt instead of a failed request.
 */
export function readToken(): StoredToken | null {
  const raw = readLocalStorage()?.getItem(TOKEN_STORAGE_KEY)
  if (raw === null || raw === undefined || raw === '') return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    clearToken()
    return null
  }

  if (typeof parsed !== 'object' || parsed === null) {
    clearToken()
    return null
  }

  const candidate = parsed as Partial<StoredToken>

  if (typeof candidate.accessToken !== 'string' || candidate.accessToken === '') {
    clearToken()
    return null
  }

  if (typeof candidate.expiresAt !== 'string' || hasExpired(candidate.expiresAt)) {
    clearToken()
    return null
  }

  return { accessToken: candidate.accessToken, expiresAt: candidate.expiresAt }
}

export function readAccessToken(): string | null {
  return readToken()?.accessToken ?? null
}

export function hasStoredToken(): boolean {
  return readToken() !== null
}
