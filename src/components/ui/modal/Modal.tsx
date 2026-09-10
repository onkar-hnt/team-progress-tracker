import { useEffect, useRef } from 'react'
import type { PropsWithChildren } from 'react'

import './Modal.scss'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
}

/**
 * Built on the native `<dialog>` element.
 *
 * The browser then supplies focus trapping, restoring focus on close, the
 * Escape key and inert background content, all of which are easy to get
 * subtly wrong by hand.
 */
export function Modal({ children, isOpen, onClose, title }: PropsWithChildren<ModalProps>) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog === null) return

    if (isOpen && !dialog.open) dialog.showModal()
    else if (!isOpen && dialog.open) dialog.close()
  }, [isOpen])

  return (
    <dialog
      aria-labelledby="modal-title"
      className="modal"
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
          <h2 className="modal__title" id="modal-title">
            {title}
          </h2>
          <button aria-label="Close" className="modal__close" onClick={onClose} type="button">
            ×
          </button>
        </header>
        <div className="modal__body">{children}</div>
      </div>
    </dialog>
  )
}
