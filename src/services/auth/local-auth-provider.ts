import { USER_ROLES } from '@models/user.model'
import type { AppUser, SignInCredentials, UserRole } from '@models/user.model'

import type { AuthProvider } from './auth-provider.interface'
import { InvalidCredentialsError } from './auth.errors'
import { HARDCODED_ACCOUNTS } from './credentials'

/**
 * Session key. Versioned so that changing the stored shape later invalidates
 * old sessions instead of rehydrating something unexpected.
 */
const SESSION_STORAGE_KEY = 'team-progress-tracker.session.v1'

/**
 * Sign-in against the hardcoded account list.
 *
 * The session lives in `sessionStorage` rather than `localStorage` so that
 * closing the tab signs the user out. On a shared machine that is the safer
 * default, and it costs a signed-in user only one extra sign-in per session.
 */
export class LocalAuthProvider implements AuthProvider {
  readonly name = 'hardcoded'
  readonly isOffline = true

  async signIn(credentials: SignInCredentials): Promise<AppUser> {
    const email = credentials.email.trim().toLowerCase()

    const account = HARDCODED_ACCOUNTS.find(
      (candidate) => candidate.email.toLowerCase() === email,
    )

    // Passwords are compared as typed; only the email is case-insensitive.
    if (account === undefined || account.password !== credentials.password) {
      throw new InvalidCredentialsError()
    }

    const user: AppUser = {
      email: account.email,
      name: account.name,
      role: account.role,
      ...(account.developerId === undefined ? {} : { developerId: account.developerId }),
    }

    this.persistSession(user)
    return user
  }

  async signOut(): Promise<void> {
    readSessionStorage()?.removeItem(SESSION_STORAGE_KEY)
  }

  restoreSession(): AppUser | null {
    const raw = readSessionStorage()?.getItem(SESSION_STORAGE_KEY)
    if (raw === null || raw === undefined) return null

    try {
      return parseStoredUser(JSON.parse(raw) as unknown)
    } catch {
      // Corrupted or hand-edited session data: drop it and require sign-in.
      return null
    }
  }

  private persistSession(user: AppUser): void {
    readSessionStorage()?.setItem(SESSION_STORAGE_KEY, JSON.stringify(user))
  }
}

/** Storage is unavailable in some privacy modes, so never assume it exists. */
function readSessionStorage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}

function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && USER_ROLES.includes(value as UserRole)
}

/**
 * Revalidates a restored session against the account list.
 *
 * Trusting the stored blob would let anyone grant themselves admin by editing
 * session storage, so the role and identity are re-read from the source of
 * truth and the stored value is used only to identify who was signed in.
 */
function parseStoredUser(value: unknown): AppUser | null {
  if (typeof value !== 'object' || value === null) return null

  const candidate = value as Partial<AppUser>
  if (typeof candidate.email !== 'string' || !isUserRole(candidate.role)) return null

  const account = HARDCODED_ACCOUNTS.find(
    (entry) => entry.email.toLowerCase() === candidate.email?.toLowerCase(),
  )

  if (account === undefined) return null

  return {
    email: account.email,
    name: account.name,
    role: account.role,
    ...(account.developerId === undefined ? {} : { developerId: account.developerId }),
  }
}
