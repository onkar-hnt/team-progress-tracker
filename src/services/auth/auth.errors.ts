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
