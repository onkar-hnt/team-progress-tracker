import { DataSourceUnavailableError } from '@services/data-provider/data-provider.errors'

import {
  ApiOfflineError,
  ApiRequestError,
  ApiResponseShapeError,
  ApiTimeoutError,
  ApiUnreachableError,
} from './api.errors'

/**
 * The one place that decides who tells the person about a failed call.
 *
 * ## Ownership
 *
 * **This layer announces** the failures no screen can do anything about, and
 * which would otherwise turn into a different vague sentence in every feature:
 * offline, unreachable gateway, timeout, retries exhausted, 429, 5xx, and an
 * answer that is not in the standard envelope.
 *
 * **The feature announces** refusals that are about what was asked: 400
 * validation, 403 not allowed, 404 missing, 409 conflict. Those carry a
 * message the backend wrote about that specific action, and the screen usually
 * has somewhere better to put it than a snackbar.
 *
 * A 401 belongs to neither: the session channel (`onApiUnauthorized`) owns it,
 * because the outcome is a sign-out rather than a message.
 *
 * Whatever this layer announces is recorded, so a feature that also catches
 * the error can call {@link wasAnnouncedGlobally} and stay quiet instead of
 * showing a second snackbar about the same failure.
 */
export type ApiFailureKind = 'offline' | 'unavailable' | 'rate-limit' | 'server' | 'unexpected'

export interface ApiFailure {
  readonly kind: ApiFailureKind
  /** Ready to show: the backend's sentence when there was one. */
  readonly message: string
  readonly error: unknown
}

type ApiFailureListener = (failure: ApiFailure) => void

const listeners = new Set<ApiFailureListener>()

/** Errors this layer has already announced. Weak, so nothing is retained. */
const announced = new WeakSet<object>()

const SERVER_FALLBACK = 'Something went wrong. Please try again.'
const RATE_LIMIT_FALLBACK = 'Too many requests just now. Please wait a moment and try again.'

function classify(error: unknown): ApiFailureKind | null {
  if (error instanceof ApiOfflineError) return 'offline'

  if (error instanceof ApiTimeoutError || error instanceof ApiUnreachableError) {
    return 'unavailable'
  }

  // Also covers "the API is not configured", which is equally nothing a screen
  // can recover from.
  if (error instanceof DataSourceUnavailableError) return 'unavailable'

  if (error instanceof ApiResponseShapeError) return 'unexpected'

  if (error instanceof ApiRequestError) {
    if (error.status === 429 || error.status === 408) return 'rate-limit'
    if (error.status >= 500) return 'server'

    // 400/401/403/404/409 and anything else in the 4xx range: not ours.
    return null
  }

  return null
}

function describe(kind: ApiFailureKind, error: unknown): string {
  // The backend writes these for the person reading the screen.
  if (error instanceof ApiRequestError && error.message !== '') return error.message

  if (error instanceof Error && error.message !== '') return error.message

  return kind === 'rate-limit' ? RATE_LIMIT_FALLBACK : SERVER_FALLBACK
}

/**
 * Offers a failure to the global layer. Returns the announcement when this
 * layer owns it, or `null` when the calling feature does.
 */
export function reportApiFailure(error: unknown): ApiFailure | null {
  const kind = classify(error)
  if (kind === null) return null

  const failure: ApiFailure = { kind, message: describe(kind, error), error }

  if (typeof error === 'object' && error !== null) announced.add(error)

  for (const listener of [...listeners]) listener(failure)

  return failure
}

/** Subscribes to globally owned failures. Returns the unsubscribe function. */
export function onApiFailure(listener: ApiFailureListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * True when the global layer has already shown a message for this error.
 *
 * The `cause` chain is followed, because a feature that turns a transport
 * failure into its own error — sign-in reporting "could not reach the sign-in
 * service", say — is still describing the failure that was already announced.
 */
export function wasAnnouncedGlobally(error: unknown): boolean {
  let current: unknown = error

  // Bounded, so a self-referencing cause cannot spin.
  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current !== 'object' || current === null) return false
    if (announced.has(current)) return true

    current = current instanceof Error ? current.cause : null
  }

  return false
}
