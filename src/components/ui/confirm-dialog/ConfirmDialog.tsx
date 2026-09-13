import { Button } from '@components/ui/button/Button'
import { Modal } from '@components/ui/modal/Modal'

import './ConfirmDialog.scss'

/**
 * What to ask, and what happens when the answer is yes.
 *
 * Defined here rather than with the provider that serves it, so that every
 * dependency runs from `app` towards `components`. The shape is the dialog's
 * props as much as it is the service's argument.
 *
 * Deliberately says nothing about tasks, projects or developers: the caller
 * supplies the words and the work, and this file supplies the dialog. That is
 * what lets one instance serve every destructive action in the application.
 */
export interface ConfirmRequest {
  /** The question, as a question: "Delete this task?" */
  title: string

  /** What confirming will do, and what it cannot undo. */
  message: string

  /**
   * The affirmative label. Names the act — "Delete", "Remove" — rather than
   * saying "OK", so the button still means something to somebody who has read
   * only it.
   */
  confirmLabel?: string

  cancelLabel?: string

  /**
   * Draws the affirmative control as destructive and starts focus on Cancel, so
   * that a stray Enter or Space dismisses rather than deletes.
   */
  isDestructive?: boolean

  /**
   * The work to do once confirmed.
   *
   * Given, the dialog stays open and shows the control as busy until this
   * settles, which is what stops a second press from deleting twice and stops
   * the list behind from being read before the write has landed.
   *
   * A rejection closes the dialog and answers `false`. It deliberately reports
   * nothing: every caller passes a mutation from `use-work-tracker`, which
   * announces its own failures through the snackbar, and a dialog adding a
   * second message would be the same failure said twice. The rejection is still
   * logged, so nothing is swallowed.
   *
   * Left out, the answer arrives as soon as the button is pressed and the caller
   * does the work itself.
   */
  action?: () => Promise<unknown>
}

interface ConfirmDialogProps {
  /** `null` when nothing is being asked, which is what closes the dialog. */
  request: ConfirmRequest | null

  isRunning: boolean
  onCancel: () => void
  onConfirm: () => void
}

/**
 * Built on `Modal`, so it inherits the focus trap, the Escape key, the inert
 * background and the entry animation rather than restating them.
 *
 * While the confirmed action runs, every way out is closed: Cancel is disabled,
 * and the close control, the backdrop and Escape all route through `onCancel`,
 * which the provider ignores. A write in flight has no cancel to offer, and a
 * dialog that vanished mid-delete would leave the reader unsure whether it
 * happened.
 */
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

          {/* `form__actions` rather than a class of its own: `Modal` pins that
              row to the bottom of the body, which is what makes this footer sit
              where every other dialog's footer sits. */}
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
