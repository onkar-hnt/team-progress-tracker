import { z } from 'zod'

import { httpConfig, isRetryableStatus, retryDelayMs } from '@config/api'
import { DataSourceUnavailableError } from '@services/data-provider/data-provider.errors'

import { apiUrl, describeApiConfigProblem } from './api-config'
import { reportApiFailure } from './api-failure'
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
import { isOnline } from './network-status'
import { clearToken, readAccessToken } from './token-store'

/**
 * The single way the app talks to the API Gateway.
 *
 * Everything that is the same for every call lives here: the base URL, the
 * bearer token, query serialisation, the `{ message, status, data }` envelope,
 * the mapping from status to error type, the timeout, the retry policy, and
 * handing globally owned failures to `api-failure`. Feature services describe
 * *what* they want — a path from `@config/api` and a body — and nothing else.
 */

/**
 * A query value as the backend reads it.
 *
 * An array is sent comma-separated, which is the form every list filter
 * accepts. An empty array is sent as an empty value on purpose: the API
 * distinguishes "no filter" from "filter matching nothing", and the screens
 * that pass an empty selection mean the latter.
 */
export type ApiQueryValue = string | number | boolean | readonly string[] | null | undefined

export interface ApiRequestOptions {
  readonly query?: Readonly<Record<string, ApiQueryValue>>

  /** Sends no Authorization header. Used by sign-in, which has no session. */
  readonly anonymous?: boolean

  readonly signal?: AbortSignal

  /**
   * Whether a transient failure may be sent again.
   *
   * `GET` is retried by default because repeating it changes nothing. A
   * mutation is not, since "no answer" does not mean "not applied" and a blind
   * second `POST` can create a second record. Set it only where the endpoint
   * is genuinely idempotent.
   */
  readonly retry?: boolean
}

interface ApiSendOptions extends ApiRequestOptions {
  readonly body?: unknown
}

/** The one response shape every endpoint uses. */
export interface ApiEnvelope<T> {
  readonly message: string
  readonly status: number
  readonly data: T | null
}

const envelopeSchema = z.object({
  message: z.string(),
  status: z.number(),
  data: z.unknown().nullable().optional(),
})

const errorDataSchema = z.object({ errors: z.array(z.string()) })

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

const unauthorizedListeners = new Set<() => void>()

/**
 * Notified when a request carrying a session was refused as unauthenticated,
 * which is how an expired token becomes a sign-out rather than a broken
 * screen. Returns the unsubscribe function.
 */
export function onApiUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener)
  return () => unauthorizedListeners.delete(listener)
}

function announceUnauthorized(): void {
  for (const listener of [...unauthorizedListeners]) listener()
}

function buildQuery(query: ApiRequestOptions['query']): string {
  if (query === undefined) return ''

  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue

    params.append(key, Array.isArray(value) ? value.join(',') : String(value))
  }

  const rendered = params.toString()
  return rendered === '' ? '' : `?${rendered}`
}

function toRequestError(status: number, message: string, errors: readonly string[]): Error {
  switch (status) {
    case 400:
      return new ApiValidationError(message, { errors })
    case 401:
      return new ApiUnauthorizedError(message, { errors })
    case 403:
      return new ApiForbiddenError(message, { errors })
    case 404:
      return new ApiNotFoundError(message, { errors })
    case 409:
      return new ApiConflictError(message, { errors })
    default:
      return new ApiRequestError(status, message, { errors })
  }
}

function readErrors(data: unknown): readonly string[] {
  const parsed = errorDataSchema.safeParse(data)
  return parsed.success ? parsed.data.errors : []
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** A failure that is about the moment rather than the request. */
function isTransient(error: unknown): boolean {
  if (error instanceof ApiTimeoutError || error instanceof ApiUnreachableError) return true

  return error instanceof ApiRequestError && isRetryableStatus(error.status)
}

/** One attempt: no retry, no reporting. */
async function sendOnce<T>(
  method: HttpMethod,
  path: string,
  options: ApiSendOptions,
): Promise<ApiEnvelope<T>> {
  const problem = describeApiConfigProblem()

  if (problem !== null) {
    throw new DataSourceUnavailableError(`The API is not configured. ${problem}`)
  }

  // Nothing can be sent without a connection, and failing here keeps the
  // screens from queueing calls that are certain to fail.
  if (!isOnline()) throw new ApiOfflineError()

  const headers = new Headers({ Accept: 'application/json' })
  const token = options.anonymous === true ? null : readAccessToken()

  if (token !== null) headers.set('Authorization', `Bearer ${token}`)

  const hasBody = options.body !== undefined
  if (hasBody) headers.set('Content-Type', 'application/json')

  const controller = new AbortController()
  const abortForCaller = () => controller.abort()
  let timedOut = false

  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, httpConfig.timeoutMs)

  options.signal?.addEventListener('abort', abortForCaller)

  let response: Response

  try {
    response = await fetch(apiUrl(path) + buildQuery(options.query), {
      method,
      headers,
      signal: controller.signal,
      ...(hasBody ? { body: JSON.stringify(options.body) } : {}),
    })
  } catch (error) {
    if (timedOut) throw new ApiTimeoutError({ cause: error })

    // The caller walked away — an unmounted screen, a superseded search — so
    // this is not a failure anybody needs to hear about.
    if (isAbort(error)) throw error

    throw new ApiUnreachableError({ cause: error })
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', abortForCaller)
  }

  // 204 and an empty 200 both read as no content; neither is an error.
  const text = await response.text()

  if (text === '') {
    if (response.ok) return { message: '', status: response.status, data: null }

    throw toRequestError(response.status, `The request was refused (${response.status}).`, [])
  }

  let payload: unknown

  try {
    payload = JSON.parse(text)
  } catch (error) {
    throw new ApiResponseShapeError(`${response.status} did not carry JSON.`, { cause: error })
  }

  const envelope = envelopeSchema.safeParse(payload)

  if (!envelope.success) {
    throw new ApiResponseShapeError('the body has no message/status/data envelope.', {
      cause: envelope.error,
    })
  }

  const { data, message } = envelope.data

  if (!response.ok) {
    if (response.status === 401 && token !== null) {
      clearToken()
      announceUnauthorized()
    }

    throw toRequestError(response.status, message, readErrors(data))
  }

  return { message, status: response.status, data: (data ?? null) as T | null }
}

/**
 * Performs one call and returns the whole envelope, so a caller that needs
 * the message the server wrote can read it.
 *
 * Retries a transient failure up to {@link httpConfig.retry.maxAttempts}
 * attempts with a growing gap, then reports the failure to the global layer
 * and rethrows it for the caller that wants to react to it.
 */
export async function apiEnvelope<T>(
  method: HttpMethod,
  path: string,
  options: ApiSendOptions = {},
): Promise<ApiEnvelope<T>> {
  const mayRetry = options.retry ?? method === 'GET'
  const maxAttempts = mayRetry ? httpConfig.retry.maxAttempts : 1

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await sendOnce<T>(method, path, options)
    } catch (error) {
      // A cancelled request is not a failure: no retry, no snackbar.
      if (isAbort(error)) throw error

      const lastAttempt = attempt >= maxAttempts

      // Waiting cannot help while the machine has no connection.
      if (lastAttempt || !isTransient(error) || !isOnline()) {
        reportApiFailure(error)
        throw error
      }

      await delay(retryDelayMs(attempt + 1))
    }
  }
}

/** The payload, for an endpoint that always returns one. */
export async function apiData<T>(
  method: HttpMethod,
  path: string,
  options: ApiSendOptions = {},
): Promise<T> {
  const envelope = await apiEnvelope<T>(method, path, options)

  if (envelope.data === null) {
    const error = new ApiResponseShapeError(`${method} ${path} returned no data.`)
    reportApiFailure(error)
    throw error
  }

  return envelope.data
}

export function apiGet<TResponse>(
  path: string,
  options?: ApiRequestOptions,
): Promise<TResponse> {
  return apiData<TResponse>('GET', path, options)
}

export function apiPost<TResponse, TRequest = unknown>(
  path: string,
  body?: TRequest,
  options?: ApiRequestOptions,
): Promise<TResponse> {
  return apiData<TResponse>('POST', path, { ...options, body })
}

export function apiPut<TResponse, TRequest = unknown>(
  path: string,
  body?: TRequest,
  options?: ApiRequestOptions,
): Promise<TResponse> {
  return apiData<TResponse>('PUT', path, { ...options, body })
}

export function apiPatch<TResponse, TRequest = unknown>(
  path: string,
  body?: TRequest,
  options?: ApiRequestOptions,
): Promise<TResponse> {
  return apiData<TResponse>('PATCH', path, { ...options, body })
}

/** For endpoints whose whole answer is "it worked". */
export async function apiSend<TRequest = unknown>(
  method: HttpMethod,
  path: string,
  options?: ApiRequestOptions & { readonly body?: TRequest },
): Promise<void> {
  await apiEnvelope<unknown>(method, path, options)
}

export function apiDelete(path: string, options?: ApiRequestOptions): Promise<void> {
  return apiSend('DELETE', path, options)
}

/**
 * The same functions as one object, for call sites that read better as
 * `apiClient.get(...)`. Not a second implementation.
 */
export const apiClient = {
  get: apiGet,
  post: apiPost,
  put: apiPut,
  patch: apiPatch,
  delete: apiDelete,
  send: apiSend,
  envelope: apiEnvelope,
  data: apiData,
} as const
