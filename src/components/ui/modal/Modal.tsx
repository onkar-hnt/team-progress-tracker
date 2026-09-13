import { useEffect, useId, useRef } from 'react'
import type { PropsWithChildren } from 'react'

import { Button } from '@components/ui/button/Button'

import './Modal.scss'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string

  /**
   * `compact` narrows the dialog to the width of a paragraph.
   *
   * For a dialog holding a question rather than a form. The default width is set
   * for a two-column form grid, and a single sentence stretched across it reads
   * as a line to scan rather than one to read.
   */
  size?: 'compact' | 'default'
}

/**
 * Built on the native `<dialog>` element.
 *
 * The browser then supplies focus trapping, restoring focus on close, the
 * Escape key and inert background content, all of which are easy to get
 * subtly wrong by hand.
 *
 * The content is mounted only while open. A `<dialog>` keeps its subtree in
 * the DOM when closed, so a form left mounted holds whatever was last typed
 * into it and reappears carrying the previous record's values. Tying the
 * subtree to `isOpen` means every form here is built fresh from its own
 * defaults each time, which is what callers already assume when they pass a
 * record to edit.
 */
export function Modal({
  children,
  isOpen,
  onClose,
  size = 'default',
  title,
}: PropsWithChildren<ModalProps>) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  // Generated rather than fixed. A screen has several of these, and a shared id
  // meant `aria-labelledby` resolved to whichever heading came first in the
  // document — so an open dialog could be announced with another one's title.
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog === null) return

    if (isOpen && !dialog.open) dialog.showModal()
    else if (!isOpen && dialog.open) dialog.close()
  }, [isOpen])

  return (
    <dialog
      aria-labelledby={titleId}
      className={size === 'compact' ? 'modal modal--compact' : 'modal'}
      onCancel={(event) => {
        // Prevent the default close so React state stays the single source of
        // truth for whether the dialog is open.
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        // The backdrop is part of the dialog element, so a click landing on
        // the element itself rather than its content means the backdrop.
        if (event.target === dialogRef.current) onClose()
      }}
      ref={dialogRef}
    >
      <div className="modal__panel">
        <header className="modal__header">
          <h2 className="modal__title" id={titleId}>
            {title}
          </h2>
          {/* The shared button, not a bespoke one. This was a hand-styled
              2rem square with its own hover and focus rules, which is what
              `isIconOnly` and `secondary` already are — the same control, drawn
              twice, and only one of the two copies got the press animation. */}
          <Button icon="close" isIconOnly onClick={onClose} variant="secondary">
            Close
          </Button>
        </header>
        <div className="modal__body">{isOpen ? children : null}</div>
      </div>
    </dialog>
  )
}
