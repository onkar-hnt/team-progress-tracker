/**
 * Remembers *who* was signed in, and nothing else.
 *
 * Only the email address is stored. The role and record ids are deliberately
 * re-read from the workbook on every restore, so editing session storage can
 * at most impersonate an address that still has to exist in the Employees
 * table — it can never grant a role.
 *
 * `sessionStorage` rather than `localStorage` means closing the tab signs the
 * user out, which is the safer default on a shared machine.
 */

/** Versioned, so a future change of shape invalidates old sessions. */
const SESSION_STORAGE_KEY = 'team-progress-tracker.session.v2'

/** Storage is unavailable in some privacy modes, so never assume it exists. */
function readSessionStorage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}

export function rememberSignedInEmail(email: string): void {
  readSessionStorage()?.setItem(SESSION_STORAGE_KEY, email.trim().toLowerCase())
}

export function readSignedInEmail(): string | null {
  const value = readSessionStorage()?.getItem(SESSION_STORAGE_KEY)
  return value === null || value === undefined || value === '' ? null : value
}

export function forgetSignedInEmail(): void {
  readSessionStorage()?.removeItem(SESSION_STORAGE_KEY)
}
