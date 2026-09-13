import { useEffect, useState } from 'react'

import { Button } from '@components/ui/button/Button'
import { APP_EYEBROW, APP_NAME } from '@constants/app.constants'

import './FullPageLoader.scss'

const SLOW_AFTER_MS = 8000

function monogramFrom(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => word !== '')
    .slice(0, 3)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase()
}

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

        {/* role=status announces the slow note; reload button stays outside it. */}
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
