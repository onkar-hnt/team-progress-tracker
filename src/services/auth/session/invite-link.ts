
export interface InviteLink {
  accessToken: string
  refreshToken: string

  /** A new account being set up, or an existing one being recovered. */
  kind: 'invite' | 'recovery'
}

let captured: InviteLink | null = null
let rejection: string | null = null

export function captureInviteLink(): void {
  const raw = window.location.hash.replace(/^#/, '')

  if (raw === '' || !raw.includes('=')) return

  const params = new URLSearchParams(raw)

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

export function readInviteLink(): { link: InviteLink | null; rejection: string | null } {
  return { link: captured, rejection }
}

/** Called once the tokens have done their job and the password is set. */
export function clearInviteLink(): void {
  captured = null
  rejection = null
}
