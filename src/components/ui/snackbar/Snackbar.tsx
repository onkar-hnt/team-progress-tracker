import { useEffect, useRef } from 'react'

import { Icon } from '@components/ui/icons/Icon'
import type { IconName } from '@components/ui/icons/Icon'

import './Snackbar.scss'

export type SnackbarTone = 'error' | 'info' | 'success' | 'warning'

export interface ActiveSnackbar {
  id: string
  tone: SnackbarTone
  message: string
  title?: string

  /** Milliseconds on screen. `0` stays until dismissed. */
  duration: number
}

const TONE_ICON: Readonly<Record<SnackbarTone, IconName>> = {
  success: 'check',
  error: 'alert',
  warning: 'warning',
  info: 'info',
}

// alert interrupts; status waits — failures need the interruption.
const TONE_ROLE: Readonly<Record<SnackbarTone, 'alert' | 'status'>> = {
  success: 'status',
  error: 'alert',
  warning: 'alert',
  info: 'status',
}

interface SnackbarViewportProps {
  items: readonly ActiveSnackbar[]
  onDismiss: (id: string) => void
}

export function SnackbarViewport({ items, onDismiss }: SnackbarViewportProps) {
  const viewportRef = useRef<HTMLOListElement>(null)

  const newestId = items.at(-1)?.id ?? null

  useEffect(() => {
    const viewport = viewportRef.current
    if (viewport === null) return
    if (typeof viewport.showPopover !== 'function') return

    if (newestId === null) {
      if (viewport.matches(':popover-open')) viewport.hidePopover()
      return
    }

    // Re-open on each message so the column stays above modal top layer.
    if (viewport.matches(':popover-open')) viewport.hidePopover()
    viewport.showPopover()
  }, [newestId])

  return (
    <ol className="snackbar-viewport" popover="manual" ref={viewportRef}>
      {items.map((item) => (
        <SnackbarRow item={item} key={item.id} onDismiss={onDismiss} />
      ))}
    </ol>
  )
}

function SnackbarRow({ item, onDismiss }: { item: ActiveSnackbar; onDismiss: (id: string) => void }) {
  useEffect(() => {
    if (item.duration === 0) return

    const timer = window.setTimeout(() => onDismiss(item.id), item.duration)
    return () => {
      window.clearTimeout(timer)
    }
  }, [item.duration, item.id, onDismiss])

  return (
    <li className={`snackbar snackbar--${item.tone}`} role={TONE_ROLE[item.tone]}>
      <span aria-hidden="true" className="snackbar__icon">
        <Icon name={TONE_ICON[item.tone]} size={18} />
      </span>

      <div className="snackbar__text">
        {item.title === undefined ? null : <p className="snackbar__title">{item.title}</p>}
        <p className="snackbar__message">{item.message}</p>
      </div>

      <button
        aria-label="Dismiss"
        className="snackbar__close"
        onClick={() => onDismiss(item.id)}
        type="button"
      >
        <Icon name="close" size={16} />
      </button>
    </li>
  )
}
