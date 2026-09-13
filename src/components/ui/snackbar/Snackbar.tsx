import { useEffect, useRef } from 'react'

import { Icon } from '@components/ui/icons/Icon'
import type { IconName } from '@components/ui/icons/Icon'

import './Snackbar.scss'

/**
 * The transient message shown in the corner after something happened.
 *
 * Presentational: this file decides how a message looks, where the column sits
 * and when each one leaves. What is worth saying, and when, is decided by
 * `SnackbarProvider` and by whoever called it.
 *
 * The tone vocabulary lives here rather than with the provider because it is a
 * visual vocabulary — a colour, an icon and how insistently it is announced —
 * and because that keeps every dependency pointing from `app` towards
 * `components` rather than back.
 */
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

/**
 * How each tone is announced.
 *
 * `alert` interrupts, `status` waits for a pause. A failure earns the
 * interruption: the reader has to know their action did not happen before they
 * carry on as though it did. A confirmation does not.
 */
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

/**
 * The column itself, in the top layer.
 *
 * `popover` rather than a high `z-index`, because a `z-index` cannot win against
 * a modal dialog. `<dialog>.showModal()` puts the dialog in the top layer, above
 * every stacking context on the page, dims the rest behind its backdrop and
 * marks it inert — so a snackbar reporting a failed save, which is exactly the
 * message most likely to arrive while a dialog is open, would appear greyed out
 * behind it and its dismiss button would not respond.
 *
 * Where the API is missing the attribute is inert and the stylesheet's own fixed
 * position still places the column correctly; only the dialog case degrades.
 */
export function SnackbarViewport({ items, onDismiss }: SnackbarViewportProps) {
  const viewportRef = useRef<HTMLOListElement>(null)

  // The newest id rather than the count: the column is capped, so a message
  // arriving when it is full leaves the length unchanged.
  const newestId = items.at(-1)?.id ?? null

  useEffect(() => {
    const viewport = viewportRef.current
    if (viewport === null) return
    if (typeof viewport.showPopover !== 'function') return

    if (newestId === null) {
      if (viewport.matches(':popover-open')) viewport.hidePopover()
      return
    }

    // Re-entered on every arrival rather than opened once at start-up. The top
    // layer is ordered by when each element joined it, so a column opened first
    // sits below any dialog opened afterwards. Leaving and rejoining puts it
    // back on top, at precisely the moment there is something to read.
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

/**
 * One message, which owns the clock that removes it.
 *
 * The timer lives here rather than in the provider so that it is tied to the
 * element's own lifetime: React clears it on unmount, which means a message
 * dismissed by hand cannot leave a pending timeout behind to remove whatever
 * has taken its place.
 */
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
