import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
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

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Application root element was not found.')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
