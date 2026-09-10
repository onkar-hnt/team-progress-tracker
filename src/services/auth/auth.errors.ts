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
