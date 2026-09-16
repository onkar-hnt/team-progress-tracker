import { Button } from '@components/ui/button/Button'
import { Modal } from '@components/ui/modal/Modal'

import './ConfirmDialog.scss'

export interface ConfirmRequest {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string

  /** Destructive styling and initial focus on Cancel. */
  isDestructive?: boolean

  /** When given, dialog stays open until this settles; rejection closes silently. */
  action?: () => Promise<unknown>
}

interface ConfirmDialogProps {
  /** `null` when nothing is being asked, which is what closes the dialog. */
  request: ConfirmRequest | null

  isRunning: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmDialog({ isRunning, onCancel, onConfirm, request }: ConfirmDialogProps) {
  const isDestructive = request?.isDestructive === true

  return (
    <Modal
      isOpen={request !== null}
      onClose={() => {
        if (!isRunning) onCancel()
      }}
      size="compact"
      title={request?.title ?? ''}
    >
      {request === null ? null : (
        <div className="confirm">
          <p className="confirm__message">{request.message}</p>

          {/* form__actions is pinned by Modal to match other dialog footers. */}
          <div className="form__actions">
            <Button
              autoFocus={isDestructive}
              disabled={isRunning}
              onClick={onCancel}
              variant="secondary"
            >
              {request.cancelLabel ?? 'Cancel'}
            </Button>

            <Button
              autoFocus={!isDestructive}
              isLoading={isRunning}
              onClick={onConfirm}
              variant={isDestructive ? 'destructive' : 'primary'}
            >
              {request.confirmLabel ?? 'Confirm'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
