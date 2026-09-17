/**
 * The store is `localStorage`, so this file needs a browser.
 *
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { clearToken, hasStoredToken, readAccessToken, readToken, storeToken } from './token-store'

const STORAGE_KEY = 'team-progress-tracker.access-token.v1'

function inHours(hours: number): string {
  return new Date(Date.now() + hours * 3_600_000).toISOString()
}

beforeEach(() => {
  localStorage.clear()
})

describe('the stored session', () => {
  it('survives a reload', () => {
    const token = { accessToken: 'token-123', expiresAt: inHours(8) }
    storeToken(token)

    expect(readToken()).toEqual(token)
    expect(hasStoredToken()).toBe(true)
  })

  it('reports nothing when the person has not signed in', () => {
    expect(readToken()).toBeNull()
    expect(readAccessToken()).toBeNull()
  })

  it('forgets a token on sign-out', () => {
    storeToken({ accessToken: 'token-123', expiresAt: inHours(8) })
    clearToken()

    expect(hasStoredToken()).toBe(false)
  })
})

/**
 * A token that will not be accepted is worse than none: the call fails, and
 * the screen looks broken rather than signed out. Each of these is therefore
 * discarded rather than returned.
 */
describe('a token that cannot be used', () => {
  it('is dropped once it has expired', () => {
    storeToken({ accessToken: 'token-123', expiresAt: inHours(-1) })

    expect(readToken()).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  // Expiry is compared with a skew window, so a token with seconds left is
  // treated as already gone rather than sent and refused mid-flight.
  it('is dropped while it is still technically valid but about to lapse', () => {
    storeToken({ accessToken: 'token-123', expiresAt: new Date(Date.now() + 5_000).toISOString() })

    expect(readToken()).toBeNull()
  })

  it('is dropped when the stored value is not readable', () => {
    localStorage.setItem(STORAGE_KEY, 'not json')

    expect(readToken()).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('is dropped when the stored value has the wrong shape', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ accessToken: 'token-123' }))

    expect(readToken()).toBeNull()
  })

  it('is dropped when the expiry is not a date', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ accessToken: 'token-123', expiresAt: 'whenever' }),
    )

    expect(readToken()).toBeNull()
  })
})
