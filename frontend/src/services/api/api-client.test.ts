/**
 * The client is written against browser things — `AbortController`,
 * `localStorage`, online/offline events — so this file needs a browser.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiEndpoints } from '@config/api'

import { apiClient, onApiUnauthorized } from './api-client'
import { onApiFailure, type ApiFailure } from './api-failure'
import {
  ApiConflictError,
  ApiForbiddenError,
  ApiNotFoundError,
  ApiOfflineError,
  ApiRequestError,
  ApiResponseShapeError,
  ApiTimeoutError,
  ApiUnauthorizedError,
  ApiValidationError,
} from './api.errors'
import { clearToken, readAccessToken, storeToken } from './token-store'

const GATEWAY = 'http://localhost:5100'

/**
 * Only the four members the client reads. A real `Response` would drag in
 * differences between the jsdom and Node implementations for no gain.
 */
function respond(status: number, body: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
  } as unknown as Response
}

function envelope(status: number, data: unknown, message = 'Operation completed.'): Response {
  return respond(status, JSON.stringify({ message, status, data }))
}

let fetchMock: ReturnType<typeof vi.fn>

function lastRequest(): { url: string; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit]
  return { url, init }
}

function signIn(): void {
  storeToken({
    accessToken: 'token-123',
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  })
}

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  clearToken()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()

  // The offline tests flip module state that outlives them.
  window.dispatchEvent(new Event('online'))
})

describe('reading a response', () => {
  it('asks the configured gateway and returns what is inside the envelope', async () => {
    fetchMock.mockResolvedValue(envelope(200, [{ id: 'dev-1' }]))

    const developers = await apiClient.get<{ id: string }[]>(apiEndpoints.developers.list)

    expect(developers).toEqual([{ id: 'dev-1' }])
    expect(lastRequest().url).toBe(`${GATEWAY}/api/developers`)
  })

  it('treats an empty body as success rather than as a malformed answer', async () => {
    fetchMock.mockResolvedValue(respond(204, ''))

    await expect(apiClient.delete(apiEndpoints.developers.byId('dev-1'))).resolves.toBeUndefined()
  })

  it('refuses a body that is not the standard envelope', async () => {
    fetchMock.mockResolvedValue(respond(200, JSON.stringify({ id: 'dev-1' })))

    await expect(apiClient.get(apiEndpoints.developers.list)).rejects.toBeInstanceOf(
      ApiResponseShapeError,
    )
  })
})

describe('the session', () => {
  it('sends the stored token', async () => {
    signIn()
    fetchMock.mockResolvedValue(envelope(200, { id: 'dev-1' }))

    await apiClient.get(apiEndpoints.auth.me)

    const headers = new Headers(lastRequest().init.headers)
    expect(headers.get('Authorization')).toBe('Bearer token-123')
  })

  it('sends no token when the call is the one that has no session yet', async () => {
    signIn()
    fetchMock.mockResolvedValue(envelope(200, { accessToken: 'new' }))

    await apiClient.post(apiEndpoints.auth.login, { email: 'a@b.c' }, { anonymous: true })

    const headers = new Headers(lastRequest().init.headers)
    expect(headers.has('Authorization')).toBe(false)
  })

  it('discards the token and announces a sign-out when the session has expired', async () => {
    signIn()
    fetchMock.mockResolvedValue(envelope(401, null, 'Please sign in again.'))

    const signedOut = vi.fn()
    const unsubscribe = onApiUnauthorized(signedOut)

    await expect(apiClient.get(apiEndpoints.auth.me)).rejects.toBeInstanceOf(ApiUnauthorizedError)

    unsubscribe()
    expect(signedOut).toHaveBeenCalledTimes(1)
    expect(readAccessToken()).toBeNull()
  })

  it('leaves nothing to clear when a sign-in attempt is refused', async () => {
    fetchMock.mockResolvedValue(envelope(401, null, 'Those details were not recognised.'))

    const signedOut = vi.fn()
    const unsubscribe = onApiUnauthorized(signedOut)

    await expect(
      apiClient.post(apiEndpoints.auth.login, { email: 'a@b.c' }, { anonymous: true }),
    ).rejects.toBeInstanceOf(ApiUnauthorizedError)

    unsubscribe()
    expect(signedOut).not.toHaveBeenCalled()
  })
})

describe('query filters', () => {
  it('sends a list comma-separated and omits what was not asked for', async () => {
    fetchMock.mockResolvedValue(envelope(200, []))

    await apiClient.get(apiEndpoints.tasks.list, {
      query: {
        developerIds: ['dev-1', 'dev-2'],
        statuses: undefined,
        dueOnOrBefore: null,
        limit: 25,
      },
    })

    expect(lastRequest().url).toBe(
      `${GATEWAY}/api/tasks?developerIds=dev-1%2Cdev-2&limit=25`,
    )
  })

  // "Nothing selected" and "no filter" are different questions, and only the
  // second one means every row.
  it('sends an empty selection rather than dropping it', async () => {
    fetchMock.mockResolvedValue(envelope(200, []))

    await apiClient.get(apiEndpoints.tasks.list, { query: { developerIds: [] } })

    expect(lastRequest().url).toBe(`${GATEWAY}/api/tasks?developerIds=`)
  })
})

describe('refusals', () => {
  it.each([
    [400, ApiValidationError],
    [401, ApiUnauthorizedError],
    [403, ApiForbiddenError],
    [404, ApiNotFoundError],
    [409, ApiConflictError],
    [418, ApiRequestError],
  ])('turns %i into the matching error', async (status, expected) => {
    fetchMock.mockResolvedValue(envelope(status, null, 'Refused.'))

    await expect(apiClient.get(apiEndpoints.developers.list)).rejects.toBeInstanceOf(expected)
  })

  it('carries the message and the field errors the backend wrote', async () => {
    fetchMock.mockResolvedValue(
      envelope(
        400,
        { errors: ['Progress must be between 0 and 100.'] },
        'Some details need correcting before this can be saved.',
      ),
    )

    await expect(apiClient.post(apiEndpoints.tasks.create, {})).rejects.toMatchObject({
      message: 'Some details need correcting before this can be saved.',
      errors: ['Progress must be between 0 and 100.'],
    })
  })
})

describe('who announces a failure', () => {
  function collectFailures(): { failures: ApiFailure[]; stop: () => void } {
    const failures: ApiFailure[] = []
    const stop = onApiFailure((failure) => failures.push(failure))
    return { failures, stop }
  }

  it('announces a server fault, which no screen can act on', async () => {
    fetchMock.mockResolvedValue(envelope(500, null, 'Something went wrong.'))
    const { failures, stop } = collectFailures()

    await expect(apiClient.post(apiEndpoints.tasks.create, {})).rejects.toBeInstanceOf(
      ApiRequestError,
    )

    stop()
    expect(failures.map((failure) => failure.kind)).toEqual(['server'])
  })

  it('stays quiet about a refusal the screen should explain itself', async () => {
    fetchMock.mockResolvedValue(envelope(404, null, 'That task no longer exists.'))
    const { failures, stop } = collectFailures()

    await expect(apiClient.get(apiEndpoints.tasks.byId('task-1'))).rejects.toBeInstanceOf(
      ApiNotFoundError,
    )

    stop()
    expect(failures).toEqual([])
  })
})

describe('retrying', () => {
  it('sends a GET again after a transient failure', async () => {
    fetchMock
      .mockResolvedValueOnce(envelope(503, null, 'Service unavailable.'))
      .mockResolvedValueOnce(envelope(200, [{ id: 'dev-1' }]))

    vi.useFakeTimers()
    const pending = apiClient.get<{ id: string }[]>(apiEndpoints.developers.list)
    await vi.advanceTimersByTimeAsync(1_000)

    await expect(pending).resolves.toEqual([{ id: 'dev-1' }])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  // "No answer" is not "not applied": a second POST can create a second row.
  it('never sends a mutation again', async () => {
    fetchMock.mockResolvedValue(envelope(503, null, 'Service unavailable.'))

    await expect(apiClient.post(apiEndpoints.tasks.create, {})).rejects.toBeInstanceOf(
      ApiRequestError,
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('gives up after three attempts', async () => {
    fetchMock.mockResolvedValue(envelope(503, null, 'Service unavailable.'))

    vi.useFakeTimers()
    const pending = apiClient.get(apiEndpoints.developers.list)
    const settled = expect(pending).rejects.toBeInstanceOf(ApiRequestError)
    await vi.advanceTimersByTimeAsync(5_000)
    await settled

    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})

describe('the connection', () => {
  it('sends nothing while the browser reports no connection', async () => {
    window.dispatchEvent(new Event('offline'))

    await expect(apiClient.get(apiEndpoints.developers.list)).rejects.toBeInstanceOf(
      ApiOfflineError,
    )

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('stops waiting for an answer that does not come', async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          )
        }),
    )

    vi.useFakeTimers()
    const pending = apiClient.post(apiEndpoints.tasks.create, {})
    const settled = expect(pending).rejects.toBeInstanceOf(ApiTimeoutError)
    await vi.advanceTimersByTimeAsync(30_000)
    await settled
  })
})
