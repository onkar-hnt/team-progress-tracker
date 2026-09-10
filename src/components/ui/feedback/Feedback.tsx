import './Feedback.scss'

interface EmptyStateProps {
  message: string
}

/** Explains that there is genuinely nothing to show, rather than a failure. */
export function EmptyState({ message }: EmptyStateProps) {
  return <p className="feedback feedback--empty">{message}</p>
}

interface ErrorStateProps {
  message: string
  onRetry?: () => void
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="feedback feedback--error" role="alert">
      <p className="feedback__message">{message}</p>
      {onRetry === undefined ? null : (
        <button className="feedback__retry" onClick={onRetry} type="button">
          Try again
        </button>
      )}
    </div>
  )
}

/**
 * Fills the viewport while the application decides what to show.
 *
 * Used by route guards, where rendering the destination early would either
 * flash an empty state or briefly reveal a screen the person may not open.
 */
export function FullPageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="feedback feedback--full-page">
      <span className="feedback__spinner" aria-hidden="true" />
      <p className="feedback__message" role="status">
        {label}
      </p>
    </div>
  )
}

interface SkeletonProps {
  /** Number of placeholder rows to show. */
  rows?: number
  label?: string
}

/**
 * Placeholder shown while data loads.
 *
 * The visual bars are hidden from assistive technology and a single polite
 * status message is announced instead, so a screen reader hears "Loading"
 * once rather than a run of meaningless elements.
 */
export function Skeleton({ label = 'Loading…', rows = 3 }: SkeletonProps) {
  return (
    <div className="feedback__skeleton">
      <span className="sr-only" role="status">
        {label}
      </span>
      {Array.from({ length: rows }, (_unused, index) => (
        <span aria-hidden="true" className="feedback__skeleton-row" key={index} />
      ))}
    </div>
  )
}
