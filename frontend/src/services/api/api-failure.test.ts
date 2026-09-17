import { describe, expect, it } from 'vitest'

import { DataSourceUnavailableError } from '@services/data-provider/data-provider.errors'

import { onApiFailure, reportApiFailure, wasAnnouncedGlobally } from './api-failure'
import {
  ApiConflictError,
  ApiForbiddenError,
  ApiNotFoundError,
  ApiOfflineError,
  ApiRequestError,
  ApiResponseShapeError,
  ApiTimeoutError,
  ApiUnauthorizedError,
  ApiUnreachableError,
  ApiValidationError,
} from './api.errors'

describe('failures this layer owns', () => {
  it.each([
    ['no connection', new ApiOfflineError(), 'offline'],
    ['a gateway that does not answer', new ApiUnreachableError(), 'unavailable'],
    ['an answer that never came', new ApiTimeoutError(), 'unavailable'],
    ['a data source that is not configured', new DataSourceUnavailableError('No base URL.'), 'unavailable'],
    ['an answer in an unknown shape', new ApiResponseShapeError('no envelope.'), 'unexpected'],
    ['too many requests', new ApiRequestError(429, 'Slow down.'), 'rate-limit'],
    ['a server fault', new ApiRequestError(500, 'Something went wrong.'), 'server'],
  ])('announces %s', (_case, error, kind) => {
    expect(reportApiFailure(error)?.kind).toBe(kind)
  })

  it('passes on the sentence the backend wrote', () => {
    const failure = reportApiFailure(new ApiRequestError(503, 'Reporting is restarting.'))

    expect(failure?.message).toBe('Reporting is restarting.')
  })

  it('tells its listeners', () => {
    const heard: string[] = []
    const stop = onApiFailure((failure) => heard.push(failure.kind))

    reportApiFailure(new ApiOfflineError())
    stop()
    reportApiFailure(new ApiTimeoutError())

    expect(heard).toEqual(['offline'])
  })
})

/**
 * A refusal carries a message about the specific action, and the screen that
 * asked usually has a better place for it than a snackbar. A 401 is nobody's
 * here either: it ends as a sign-out.
 */
describe('failures the feature owns', () => {
  it.each([
    ['validation', new ApiValidationError('Check the dates.')],
    ['a sign-in that lapsed', new ApiUnauthorizedError('Please sign in again.')],
    ['a refusal', new ApiForbiddenError('Not your employee.')],
    ['something missing', new ApiNotFoundError('That task no longer exists.')],
    ['a conflict', new ApiConflictError('That email is already in use.')],
  ])('leaves %s alone', (_case, error) => {
    expect(reportApiFailure(error)).toBeNull()
    expect(wasAnnouncedGlobally(error)).toBe(false)
  })
})

describe('knowing what has already been said', () => {
  it('remembers what it announced', () => {
    const error = new ApiTimeoutError()

    expect(wasAnnouncedGlobally(error)).toBe(false)
    reportApiFailure(error)
    expect(wasAnnouncedGlobally(error)).toBe(true)
  })

  // A feature that rewrites a transport failure in its own words — "could not
  // reach the sign-in service" — is still describing the announced failure.
  it('sees through an error that wraps an announced one', () => {
    const announced = new ApiUnreachableError()
    reportApiFailure(announced)

    const wrapped = new Error('Could not reach the sign-in service.', { cause: announced })

    expect(wasAnnouncedGlobally(wrapped)).toBe(true)
  })

  it('does not follow a cause chain for ever', () => {
    const looping = new Error('first')
    looping.cause = looping

    expect(wasAnnouncedGlobally(looping)).toBe(false)
  })

  it('says no for anything that is not an error', () => {
    expect(wasAnnouncedGlobally('offline')).toBe(false)
    expect(wasAnnouncedGlobally(null)).toBe(false)
  })
})
