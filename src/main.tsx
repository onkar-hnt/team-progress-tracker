import { createRoot } from 'react-dom/client'
import { App } from '@app/App'
import { captureInviteLink } from '@services/auth/invite-link'
import '@styles/global.scss'

/** Rewrite stray pathnames to BASE_URL before mount; hash routing is unchanged. */
function normaliseAddress(): void {
  const base = import.meta.env.BASE_URL

  if (window.location.pathname === base) return

  window.history.replaceState(
    null,
    '',
    `${base}${window.location.search}${window.location.hash}`,
  )
}

normaliseAddress()

// Capture invite tokens from the hash before the router reads it.
captureInviteLink()

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Application root element was not found.')
}

// No StrictMode: development should match production network and render cost.
createRoot(rootElement).render(<App />)
