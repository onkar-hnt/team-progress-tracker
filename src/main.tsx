import { createRoot } from 'react-dom/client'
import { App } from './App'
import { captureInviteLink } from '@services/auth/invite-link'
import '@styles/global.scss'

/**
 * Puts the address back on the app's own path, keeping the route.
 *
 * Routing is by hash, so everything after `#` is the route and the path
 * before it should only ever be the deployment base. A stray path — a
 * mistyped or half-edited address such as `/team-progress-tracker/oops#/…` —
 * still loads here, because the dev server answers any path with
 * `index.html`, and the app then works while showing an address that is
 * wrong.
 *
 * That is worth correcting rather than tolerating: the same address on
 * GitHub Pages is a 404, since no file sits at that path. Rewriting it now
 * means a link copied out of the browser is one that will work again.
 *
 * `replaceState` rather than a redirect, so it leaves no entry in the back
 * history, and it runs before React mounts — the hash is untouched, so the
 * router never sees the difference.
 */
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

// After the path is settled and before the router reads the fragment, since
// an invitation arrives as tokens in that fragment and the router would
// treat them as a route.
captureInviteLink()

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Application root element was not found.')
}

/**
 * Mounted without `StrictMode`.
 *
 * StrictMode's second render and second effect pass are a development-only
 * check for effects that are not safe to run twice, and everything here was
 * written to survive it — the session subscription is idempotent, and workbook
 * preparation is guarded so both passes share one run. What it also does is
 * double every render and every effect in development, which made the console
 * and the network panel read as though the application were doing twice the
 * work it does in production.
 *
 * Removed for that reason, so what is observed while developing is what a
 * signed-in person actually causes. The cost is losing an early warning about
 * effects that are not idempotent, which now has to be noticed by reading them.
 */
createRoot(rootElement).render(<App />)
