import { describe, expect, it } from 'vitest'

import { AuthError, InvalidCredentialsError } from '@services/auth/auth.errors'
import {
  DataProviderError,
  DuplicateRecordError,
  RecordInUseError,
  RecordNotFoundError,
  ReferentialIntegrityError,
  RowValidationError,
  SchemaMismatchError,
} from '@services/data-provider/data-provider.errors'
import { toUserMessage } from '@services/errors/error-message'
import { ProvisioningError } from '@services/provisioning/provision-login'

const FALLBACK = 'The project could not be saved. Please try again.'

describe('toUserMessage', () => {
  it('says what is still using a record that cannot be deleted', () => {
    const message = toUserMessage(
      new RecordInUseError('Projects', 'atlas', ['3 tasks', '12 daily updates']),
      FALLBACK,
    )

    expect(message).toContain('3 tasks, 12 daily updates')
    expect(message).toContain('mark this record inactive instead')
  })

  it('names the kind of record a broken reference pointed at, in the reader’s words', () => {
    expect(toUserMessage(new ReferentialIntegrityError('developerId', 'asha'), FALLBACK)).toContain(
      'points at a employee which no longer exists',
    )
    expect(toUserMessage(new ReferentialIntegrityError('projectId', 'atlas'), FALLBACK)).toContain(
      'points at a project which no longer exists',
    )
  })

  it('asks the reader to refresh when the record has gone', () => {
    expect(toUserMessage(new RecordNotFoundError('Projects', 'atlas'), FALLBACK)).toBe(
      'That record no longer exists. Refresh the page and try again.',
    )
  })

  /**
   * A schema or row problem is not something the reader can act on, so both
   * say the same thing and point at an administrator.
   */
  it('blames the setup, not the reader, when the data does not match what is expected', () => {
    const expected =
      'The data could not be read because it does not match the expected structure. ' +
      'Ask an administrator to check the setup.'

    expect(toUserMessage(new SchemaMismatchError('Projects', ['Code']), FALLBACK)).toBe(expected)
    expect(
      toUserMessage(new RowValidationError('Projects', [{ index: 0, messages: ['bad'] }]), FALLBACK),
    ).toBe(expected)
  })

  it('points at an administrator when two records share an identifier', () => {
    expect(toUserMessage(new DuplicateRecordError('Projects', ['atlas']), FALLBACK)).toContain(
      'Two records share the same identifier',
    )
  })

  /** These carry messages already written for a reader, so they are passed through. */
  it('passes through the message from a data-layer, sign-in or provisioning failure', () => {
    expect(toUserMessage(new DataProviderError('The connection timed out.'), FALLBACK)).toBe(
      'The connection timed out.',
    )
    expect(toUserMessage(new AuthError('Your session has expired.'), FALLBACK)).toBe(
      'Your session has expired.',
    )
    expect(toUserMessage(new InvalidCredentialsError(), FALLBACK)).toBe(
      'Email or password is incorrect.',
    )
    expect(toUserMessage(new ProvisioningError('No email is on file.', 'no_email'), FALLBACK)).toBe(
      'No email is on file.',
    )
  })

  it('falls back to the caller’s wording for anything it does not recognise', () => {
    expect(toUserMessage(new Error('socket hang up'), FALLBACK)).toBe(FALLBACK)
    expect(toUserMessage('not even an error', FALLBACK)).toBe(FALLBACK)
    expect(toUserMessage(undefined, FALLBACK)).toBe(FALLBACK)
  })

  /** The specific case must be recognised before its base class. */
  it('prefers the specific explanation over the base message it inherits', () => {
    const inUse = new RecordInUseError('Projects', 'atlas', ['3 tasks'])

    expect(toUserMessage(inUse, FALLBACK)).not.toBe(inUse.message)
  })
})
