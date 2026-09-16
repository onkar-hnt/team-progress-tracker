import { useEffect, useId, useRef } from 'react'
import type { PropsWithChildren } from 'react'

import { Button } from '@components/ui/button/Button'

import './Modal.scss'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string

  size?: 'compact' | 'default'
}

export function Modal({
  children,
  isOpen,
  onClose,
  size = 'default',
  title,
}: PropsWithChildren<ModalProps>) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  // Per-instance id — shared ids break aria-labelledby across multiple dialogs.
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
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose()
      }}
      ref={dialogRef}
    >
      <div className="modal__panel">
        <header className="modal__header">
          <h2 className="modal__title" id={titleId}>
            {title}
          </h2>
          <Button icon="close" isIconOnly onClick={onClose} variant="secondary">
            Close
          </Button>
        </header>
        <div className="modal__body">{isOpen ? children : null}</div>
      </div>
    </dialog>
  )
}
