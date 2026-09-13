export class AuthError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'AuthError'
  }
}

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

export class UnknownAccountError extends AuthError {
  constructor(email: string) {
    super(
      `${email} is not set up on the team. Ask an administrator to add you on the Employees screen.`,
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

export class MissingProfileError extends AuthError {
  constructor(email: string) {
    super(
      `${email} signed in, but has no profile in the application database. ` +
        'Ask an administrator to set up your access.',
    )
    this.name = 'MissingProfileError'
  }
}

export class AuthConfigurationError extends AuthError {
  constructor(detail: string, options?: { cause?: unknown }) {
    super(`Sign-in is not available: ${detail}`, options)
    this.name = 'AuthConfigurationError'
  }
}
