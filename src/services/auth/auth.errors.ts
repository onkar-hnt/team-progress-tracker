export class AuthError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'AuthError'
  }
}

/**
 * Deliberately vague: the message never reveals whether it was the email or
 * the password that was wrong.
 */
export class InvalidCredentialsError extends AuthError {
  constructor() {
    super('Email or password is incorrect.')
    this.name = 'InvalidCredentialsError'
  }
}

/** The account exists but is no longer active in the team. */
export class InactiveAccountError extends AuthError {
  constructor() {
    super('This account is no longer active. Please contact your mentor.')
    this.name = 'InactiveAccountError'
  }
}

/**
 * Authentication succeeded but the address is not in the workbook.
 *
 * Distinct from invalid credentials on purpose: the person proved who they
 * are, so telling them their account is not set up is both accurate and
 * actionable, and reveals nothing they did not already know.
 */
export class UnknownAccountError extends AuthError {
  constructor(email: string) {
    super(
      `${email} is not set up in the team workbook. Ask an administrator to add you to the Employees sheet.`,
    )
    this.name = 'UnknownAccountError'
  }
}

/** Sign-in could not complete against the identity provider. */
export class SignInFailedError extends AuthError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'SignInFailedError'
  }
}

/**
 * Credentials were accepted but the account has no application profile.
 *
 * The database counterpart of `UnknownAccountError`: the person proved who
 * they are to Supabase Auth, but no `public.profiles` row carries their role,
 * so there is nothing to authorise them with. An administrator has to create
 * it — the application cannot, and deliberately has no policy allowing it.
 */
export class MissingProfileError extends AuthError {
  constructor(email: string) {
    super(
      `${email} signed in, but has no profile in the application database. ` +
        'Ask an administrator to set up your access.',
    )
    this.name = 'MissingProfileError'
  }
}

/**
 * The identity provider is not configured, so sign-in cannot be attempted.
 *
 * Separate from a failed sign-in: nothing was rejected, the deployment is
 * incomplete. Carries the detail so a developer sees which variable is wrong
 * rather than a generic failure.
 */
export class AuthConfigurationError extends AuthError {
  constructor(detail: string, options?: { cause?: unknown }) {
    super(`Sign-in is not available: ${detail}`, options)
    this.name = 'AuthConfigurationError'
  }
}
