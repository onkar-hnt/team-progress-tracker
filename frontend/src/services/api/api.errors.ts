// Imports the leaf module rather than the data-provider barrel: the barrel
// builds the provider, which is itself built on this client.
import {
  DataProviderError,
  DataSourceUnavailableError,
} from '@services/data-provider/data-provider.errors'

/**
 * A request the API refused and described in the standard envelope.
 *
 * Derives from {@link DataProviderError} so the message the backend wrote —
 * already a sentence meant for the person reading the screen — is what the
 * existing UI shows.
 */
export class ApiRequestError extends DataProviderError {
  /** The HTTP status, which the envelope repeats in its `status` property. */
  readonly status: number

  /** The individual problems, when the refusal listed more than one. */
  readonly errors: readonly string[]

  constructor(
    status: number,
    message: string,
    options?: { errors?: readonly string[]; cause?: unknown },
  ) {
    super(message, options)
    this.name = 'ApiRequestError'
    this.status = status
    this.errors = options?.errors ?? []
  }
}

/** The request carried no usable session, so nothing was done. */
export class ApiUnauthorizedError extends ApiRequestError {
  constructor(message: string, options?: { errors?: readonly string[]; cause?: unknown }) {
    super(401, message, options)
    this.name = 'ApiUnauthorizedError'
  }
}

/** The session is valid but not allowed to do this. */
export class ApiForbiddenError extends ApiRequestError {
  constructor(message: string, options?: { errors?: readonly string[]; cause?: unknown }) {
    super(403, message, options)
    this.name = 'ApiForbiddenError'
  }
}

export class ApiNotFoundError extends ApiRequestError {
  constructor(message: string, options?: { errors?: readonly string[]; cause?: unknown }) {
    super(404, message, options)
    this.name = 'ApiNotFoundError'
  }
}

/** The change collided with the current state of the record. */
export class ApiConflictError extends ApiRequestError {
  constructor(message: string, options?: { errors?: readonly string[]; cause?: unknown }) {
    super(409, message, options)
    this.name = 'ApiConflictError'
  }
}

/** The request was understood but something in it needs correcting. */
export class ApiValidationError extends ApiRequestError {
  constructor(message: string, options?: { errors?: readonly string[]; cause?: unknown }) {
    super(400, message, options)
    this.name = 'ApiValidationError'
  }
}

/**
 * The browser reports no connection, so nothing was sent.
 *
 * Distinct from {@link ApiUnreachableError}: the request never left the
 * machine, and repeating it now cannot help.
 */
export class ApiOfflineError extends DataSourceUnavailableError {
  constructor(options?: { cause?: unknown }) {
    super('You are currently offline, so that could not be saved or loaded.', options)
    this.name = 'ApiOfflineError'
  }
}

/** The request was sent but nothing answered within the allowed time. */
export class ApiTimeoutError extends DataSourceUnavailableError {
  constructor(options?: { cause?: unknown }) {
    super('The request took too long to answer. Please try again.', options)
    this.name = 'ApiTimeoutError'
  }
}

/** The connection failed: no gateway listening, DNS, TLS or a dropped socket. */
export class ApiUnreachableError extends DataSourceUnavailableError {
  constructor(options?: { cause?: unknown }) {
    super(
      'Could not reach the application server. Check that it is running, then try again.',
      options,
    )
    this.name = 'ApiUnreachableError'
  }
}

/** The answer did not arrive in the envelope every endpoint uses. */
export class ApiResponseShapeError extends DataProviderError {
  constructor(detail: string, options?: { cause?: unknown }) {
    super(
      `The API answered in an unexpected shape, so it cannot be read: ${detail}`,
      options,
    )
    this.name = 'ApiResponseShapeError'
  }
}
