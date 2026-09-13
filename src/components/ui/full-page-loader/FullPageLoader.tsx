import { useEffect, useState } from 'react'

import { Button } from '@components/ui/button/Button'
import { APP_EYEBROW, APP_NAME } from '@constants/app.constants'

import './FullPageLoader.scss'

/**
 * How long a wait has to run before the reader is offered a way out.
 *
 * Long enough that a slow network on a cold start passes without ever seeing it,
 * short enough to arrive while somebody is still looking at the screen rather than
 * after they have given up on it.
 */
const SLOW_AFTER_MS = 8000

/**
 * The application's initials, standing in for a logo it does not have.
 *
 * Three letters at most, from the first three words. Derived from the name rather
 * than written out, so renaming the application cannot leave a monogram behind
 * that belongs to the old one.
 */
function monogramFrom(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => word !== '')
    .slice(0, 3)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase()
}

/** Whether a wait has gone on longer than it should have. */
function useHasElapsed(ms: number): boolean {
  const [hasElapsed, setHasElapsed] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setHasElapsed(true)
    }, ms)

    return () => {
      window.clearTimeout(timer)
    }
  }, [ms])

  return hasElapsed
}

/**
 * Fills the viewport while the application decides what to show.
 *
 * Used by the route guards, the login and invitation screens, and the workbook
 * gate — anywhere rendering the destination early would either flash an empty
 * state or briefly reveal a screen the person may not open. It is the first thing
 * anybody sees on a cold start, and for a while it was the only thing they saw
 * that the application had not been designed: a grey ring on an empty page, which
 * is what a blank screen looks like when something has gone wrong.
 *
 * So it is the same card the login screen uses, with the same frame and the same
 * two lines of brand — a person waiting for a session to be restored is looking at
 * the application, not at a gap in it.
 *
 * The bar sweeps rather than fills. Nothing here knows how much of the wait is
 * done: a session is either restored or it is not, and a bar creeping to 90% and
 * stopping tells a lie that the reader will remember.
 *
 * After eight seconds it says so and offers a reload. That is the whole reason a
 * loading screen needs a control at all — before this, a session restore that
 * never resolved left somebody watching a ring for as long as they were willing
 * to, with nothing on the screen to press and no reason to think pressing anything
 * would help.
 */
export function FullPageLoader({ label = 'Loading…' }: { label?: string }) {
  const isSlow = useHasElapsed(SLOW_AFTER_MS)

  return (
    <div className="full-page-loader">
      <div className="full-page-loader__card">
        <span aria-hidden="true" className="full-page-loader__mark">
          {monogramFrom(APP_NAME)}
        </span>

        <span className="full-page-loader__words">
          <span className="full-page-loader__eyebrow">{APP_EYEBROW}</span>
          <strong className="full-page-loader__title">{APP_NAME}</strong>
        </span>

        <span aria-hidden="true" className="full-page-loader__track">
          <span className="full-page-loader__bar" />
        </span>

        {/* One live region for both lines, so the note is announced when it
            arrives rather than sitting there silently. The control stays outside
            it: a button read out as a status change is read out as text, and this
            one is worth reaching. */}
        <div className="full-page-loader__status" role="status">
          <p className="full-page-loader__label">{label}</p>

          {isSlow ? (
            <p className="full-page-loader__note">
              This is taking longer than usual. The connection may be slow, or the
              application may be waiting on something that will not arrive.
            </p>
          ) : null}
        </div>

        {isSlow ? (
          <Button
            icon="refresh"
            onClick={() => {
              window.location.reload()
            }}
            size="small"
            variant="secondary"
          >
            Reload
          </Button>
        ) : null}
      </div>
    </div>
  )
}
