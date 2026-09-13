import type { ReactNode } from 'react'

import { Button } from '@components/ui/button/Button'
import { Icon, type IconName } from '@components/ui/icons/Icon'

import './Feedback.scss'

type EmptyStateVariant = 'empty' | 'filtered'

interface EmptyStateProps {
  message: string
  title?: string
  icon?: IconName
  variant?: EmptyStateVariant
  action?: ReactNode
}

const DEFAULT_ICON: Readonly<Record<EmptyStateVariant, IconName>> = {
  empty: 'inbox',
  filtered: 'filter',
}

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

interface SkeletonProps {
  /** Number of placeholder rows to show. */
  rows?: number
  label?: string
}

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
