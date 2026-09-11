/**
 * Rescues an invitation link before the router throws it away.
 *
 * Supabase returns the tokens for an invite or a password reset in the URL
 * fragment. This application routes by hash, so that fragment is also where
 * the route lives, and the two collide: the client is configured with
 * `detectSessionInUrl: false` precisely so the auth library does not fight
 * the router over it, which leaves nobody reading the tokens. Without this
 * the fragment parses as a nonsense route, the catch-all sends the person to
 * the dashboard, the guard sends them to the login screen, and the
 * invitation is silently spent.
 *
 * So the fragment is inspected once, before React mounts, and swapped for a
 * real route. The tokens stay in memory only — never in storage, never in
 * the address bar, and never anywhere a later reader could find them.
 */

export interface InviteLink {
  accessToken: string
  refreshToken: string

  /** A new account being set up, or an existing one being recovered. */
  kind: 'invite' | 'recovery'
}

let captured: InviteLink | null = null
let rejection: string | null = null

/**
 * Called from `main.tsx` before the router exists.
 *
 * Leaves an ordinary route alone. A hash such as `#/developers` carries no
 * `access_token` and no `error`, so it falls through untouched.
 */
export function captureInviteLink(): void {
  const raw = window.location.hash.replace(/^#/, '')

  if (raw === '' || !raw.includes('=')) return

  const params = new URLSearchParams(raw)

  // Supabase reports a spent or expired link this way. Worth keeping: it is
  // the difference between a clear explanation and a login screen that gives
  // no hint why the invitation did not work.
  const failure = params.get('error_description') ?? params.get('error')

  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  const kind = params.get('type')

  if (failure !== null) {
    rejection = failure.replace(/\+/g, ' ')
  } else if (
    accessToken !== null &&
    refreshToken !== null &&
    (kind === 'invite' || kind === 'recovery')
  ) {
    captured = { accessToken, refreshToken, kind }
  } else {
    return
  }

  window.history.replaceState(null, '', `${import.meta.env.BASE_URL}#/set-password`)
}

/**
 * What the link carried, or nothing if this was an ordinary visit.
 *
 * Reading does not clear. React's strict mode mounts an effect twice in
 * development, and a read that consumed would leave the second attempt
 * believing the link was invalid.
 */
export function readInviteLink(): { link: InviteLink | null; rejection: string | null } {
  return { link: captured, rejection }
}

/** Called once the tokens have done their job and the password is set. */
export function clearInviteLink(): void {
  captured = null
  rejection = null
}
