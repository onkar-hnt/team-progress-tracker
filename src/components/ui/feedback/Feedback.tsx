import type { ReactNode } from 'react'

import { Button } from '@components/ui/button/Button'
import { Icon, type IconName } from '@components/ui/icons/Icon'

import './Feedback.scss'

/**
 * Why there is nothing to show.
 *
 * `empty` means nothing has been created yet, and the reader's next move is to
 * create something. `filtered` means the data exists but the current filters
 * exclude it, and the next move is to widen them. Saying which one it is saves
 * the reader working it out, and they are the two cases people confuse.
 */
type EmptyStateVariant = 'empty' | 'filtered'

interface EmptyStateProps {
  /** The one line that explains the absence, and what would fill it. */
  message: string

  /** A short headline above the message, for a whole panel that is empty. */
  title?: string

  icon?: IconName
  variant?: EmptyStateVariant

  /** Whatever the reader should do next — usually a single `Button`. */
  action?: ReactNode
}

const DEFAULT_ICON: Readonly<Record<EmptyStateVariant, IconName>> = {
  empty: 'inbox',
  filtered: 'filter',
}

/** Explains that there is genuinely nothing to show, rather than a failure. */
export function EmptyState({ action, icon, message, title, variant = 'empty' }: EmptyStateProps) {
  return (
    <div className="feedback feedback--empty">
      <span aria-hidden="true" className="feedback__badge">
        <Icon name={icon ?? DEFAULT_ICON[variant]} size={20} />
      </span>
      {title === undefined ? null : <p className="feedback__title">{title}</p>}
      <p className="feedback__message">{message}</p>
      {action === undefined ? null : <div className="feedback__action">{action}</div>}
    </div>
  )
}

interface ErrorStateProps {
  message: string
  onRetry?: () => void
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="feedback feedback--error" role="alert">
      <span aria-hidden="true" className="feedback__badge feedback__badge--error">
        <Icon name="alert" size={20} />
      </span>
      <p className="feedback__message">{message}</p>
      {onRetry === undefined ? null : (
        <Button icon="refresh" onClick={onRetry} size="small" variant="danger">
          Try again
        </Button>
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
