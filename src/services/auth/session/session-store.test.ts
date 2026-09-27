import { afterEach, describe, expect, it } from 'vitest'

import {
  forgetSignedInEmail,
  readSignedInEmail,
  rememberSignedInEmail,
} from '@services/auth/session/session-store'

afterEach(() => {
  sessionStorage.clear()
})

describe('the signed-in email store', () => {
  it('reads back what was remembered', () => {
    rememberSignedInEmail('asha@example.com')

    expect(readSignedInEmail()).toBe('asha@example.com')
  })

  /** Stored lowercased so a sign-in typed in capitals matches the roster. */
  it('normalises the address before storing it', () => {
    rememberSignedInEmail('  ASHA@Example.com  ')

    expect(readSignedInEmail()).toBe('asha@example.com')
  })

  it('reads nothing when nobody has signed in', () => {
    expect(readSignedInEmail()).toBeNull()
  })

  it('reads nothing rather than an empty string when an empty address was stored', () => {
    rememberSignedInEmail('   ')

    expect(readSignedInEmail()).toBeNull()
  })

  it('forgets the address on sign-out', () => {
    rememberSignedInEmail('asha@example.com')
    forgetSignedInEmail()

    expect(readSignedInEmail()).toBeNull()
  })

  it('replaces the previous address rather than keeping both', () => {
    rememberSignedInEmail('asha@example.com')
    rememberSignedInEmail('ravi@example.com')

    expect(readSignedInEmail()).toBe('ravi@example.com')
  })

  it('can be forgotten when there was nothing to forget', () => {
    expect(() => {
      forgetSignedInEmail()
    }).not.toThrow()
  })
})
