import { z } from 'zod'

import { apiEndpoints } from '@config/api'
import type { AppUser, SignInCredentials } from '@models/user.model'
import { USER_ROLES } from '@models/user.model'
import { apiGet, apiPost, onApiUnauthorized } from '@services/api/api-client'
import { ApiForbiddenError, ApiUnauthorizedError } from '@services/api/api.errors'
import { clearToken, hasStoredToken, storeToken } from '@services/api/token-store'
import { DataSourceUnavailableError } from '@services/data-provider/data-provider.errors'

import type { AuthProvider } from './auth-provider.interface'
import {
  InactiveAccountError,
  InvalidCredentialsError,
  SignInFailedError,
} from './auth.errors'
import { forgetSignedInEmail, rememberSignedInEmail } from './session-store'

const authenticatedUserSchema = z.object({
  email: z.string().min(1),
  name: z.string().min(1),
  role: z.enum(USER_ROLES),
  developerId: z.string().min(1).nullable().optional(),
  mentorId: z.string().min(1).nullable().optional(),
  mustChangePassword: z.boolean().optional(),
})

const signInSchema = z.object({
  accessToken: z.string().min(1),
  expiresAt: z.string().min(1),
  user: authenticatedUserSchema,
})

type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>

function toAppUser(user: AuthenticatedUser): AppUser {
  return {
    email: user.email,
    name: user.name,
    role: user.role,
    ...(user.developerId === null || user.developerId === undefined
      ? {}
      : { developerId: user.developerId }),
    ...(user.mentorId === null || user.mentorId === undefined ? {} : { mentorId: user.mentorId }),
    ...(user.mustChangePassword === true ? { mustChangePassword: true } : {}),
  }
}

function readUser(payload: unknown, context: string): AppUser {
  const parsed = authenticatedUserSchema.safeParse(payload)

  if (!parsed.success) {
    throw new SignInFailedError(
      `${context} came back in an unexpected shape, so your access cannot be confirmed.`,
      { cause: parsed.error },
    )
  }

  return toAppUser(parsed.data)
}

/**
 * Signs in against the Identity service and keeps the issued access token.
 *
 * The token is the whole session: it carries the role and the roster links
 * the API authorises against, so identity is read from `/api/auth/me` rather
 * than pieced together from roster queries in the browser.
 */
export class ApiAuthProvider implements AuthProvider {
  readonly name = 'api'

  /** Every operation is a network call, so a session is never assumed. */
  readonly isOffline = false

  readonly usesCredentials = true

  async signIn(credentials?: SignInCredentials): Promise<AppUser> {
    if (credentials === undefined) throw new InvalidCredentialsError()

    let payload: unknown

    try {
      payload = await apiPost<unknown>(
        apiEndpoints.auth.login,
        { email: credentials.email.trim(), password: credentials.password },
        { anonymous: true },
      )
    } catch (error) {
      throw mapSignInError(error)
    }

    const parsed = signInSchema.safeParse(payload)

    if (!parsed.success) {
      throw new SignInFailedError(
        'Sign-in succeeded but the response could not be read. Please try again.',
        { cause: parsed.error },
      )
    }

    const { accessToken, expiresAt, user } = parsed.data

    storeToken({ accessToken, expiresAt })
    rememberSignedInEmail(user.email)

    return toAppUser(user)
  }

  async signOut(): Promise<void> {
    // The token is self-contained, so discarding it ends the session; there is
    // nothing on the server to tell.
    clearToken()
    forgetSignedInEmail()
  }

  async restoreSession(): Promise<AppUser | null> {
    return this.readCurrentIdentity()
  }

  async refreshIdentity(): Promise<AppUser | null> {
    return this.readCurrentIdentity()
  }

  private async readCurrentIdentity(): Promise<AppUser | null> {
    if (!hasStoredToken()) return null

    try {
      return readUser(await apiGet<unknown>(apiEndpoints.auth.me), 'Your profile')
    } catch (error) {
      if (error instanceof ApiUnauthorizedError || error instanceof ApiForbiddenError) {
        await this.signOut()
        return null
      }

      // A server that cannot be reached is not a signed-out session: reporting
      // it as one would drop somebody at the sign-in screen mid-session.
      throw error
    }
  }

  onSessionChange(listener: (user: AppUser | null) => void): () => void {
    return onApiUnauthorized(() => {
      forgetSignedInEmail()
      listener(null)
    })
  }
}

function mapSignInError(error: unknown): Error {
  if (error instanceof ApiUnauthorizedError) return new InvalidCredentialsError()
  if (error instanceof ApiForbiddenError) return new InactiveAccountError()

  if (error instanceof DataSourceUnavailableError) {
    return new SignInFailedError(
      'Could not reach the sign-in service. Check your connection and try again.',
      { cause: error },
    )
  }

  if (error instanceof Error) {
    return new SignInFailedError(error.message, { cause: error })
  }

  return new SignInFailedError('Sign-in could not be completed. Please try again.', {
    cause: error,
  })
}

/** Replaces the whole password, returning the session the server re-issued. */
export async function changeOwnPassword(input: {
  readonly currentPassword?: string
  readonly newPassword: string
}): Promise<AppUser> {
  const payload = await apiPost<unknown>(apiEndpoints.auth.changePassword, {
    ...(input.currentPassword === undefined ? {} : { currentPassword: input.currentPassword }),
    newPassword: input.newPassword,
  })

  const parsed = signInSchema.safeParse(payload)

  if (!parsed.success) {
    throw new SignInFailedError(
      'The password was changed but the new session could not be read. Sign in again.',
      { cause: parsed.error },
    )
  }

  const { accessToken, expiresAt, user } = parsed.data

  storeToken({ accessToken, expiresAt })
  rememberSignedInEmail(user.email)

  return toAppUser(user)
}
