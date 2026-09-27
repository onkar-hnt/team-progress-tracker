import { useState } from 'react'

import { useSnackbar } from '@app/providers/snackbar-context'
import { Button } from '@components/ui/button/Button'
import { TextAreaField } from '@components/ui/field/Field'
import { Modal } from '@components/ui/modal/Modal'
import { useSendUpdateReminder } from '@features/notifications/hooks/use-notifications'
import type { ReminderTarget } from '@models/notification.model'
import { formatLongDate } from '@utils/date/date.utils'

import './ReminderDialog.scss'

/** Long enough for a sentence of context; the wording around it is fixed. */
const MESSAGE_MAX_LENGTH = 300

interface ReminderDialogProps {
  /** `null` when nobody is being reminded, which is what closes the dialog. */
  target: ReminderTarget | null

  onClose: () => void
}

/**
 * Asking one developer for their update.
 *
 * The message is optional and is added to wording the database writes, so a
 * reminder always reads as a reminder and is always attributed to whoever sent
 * it. What lands in the recipient's bell is a notification like any other: it
 * respects their preferences, and it leads to the daily update screen.
 */
export function ReminderDialog({ onClose, target }: ReminderDialogProps) {
  const snackbar = useSnackbar()
  const send = useSendUpdateReminder()
  const [message, setMessage] = useState('')

  const close = () => {
    setMessage('')
    onClose()
  }

  const submit = () => {
    if (target === null) return

    send.mutate(
      {
        developerId: target.developerId,
        ...(message.trim() === '' ? {} : { message }),
      },
      {
        onSuccess: () => {
          snackbar.success(`${target.developerName} has been reminded.`)
          close()
        },
      },
    )
  }

  return (
    <Modal
      isOpen={target !== null}
      onClose={() => {
        if (!send.isPending) close()
      }}
      size="compact"
      title="Ask for a daily update"
    >
      {target === null ? null : (
        <div className="reminder-dialog">
          <p className="reminder-dialog__lead">
            {target.developerName} will be notified that their daily update is waiting.
          </p>

          {target.missingDates.length === 0 ? null : (
            <p className="reminder-dialog__days">
              Days with nothing logged:{' '}
              {target.missingDates.slice(0, 5).map(formatLongDate).join(', ')}
              {target.missingDates.length > 5
                ? ` and ${String(target.missingDates.length - 5)} more`
                : ''}
              .
            </p>
          )}

          <TextAreaField
            hint="Optional. Added to the reminder in your own words."
            id="reminder-message"
            isWide
            label="Message"
            maxLength={MESSAGE_MAX_LENGTH}
            onChange={(event) => {
              setMessage(event.target.value)
            }}
            placeholder="e.g. Please add Monday and Tuesday before our catch-up"
            rows={3}
            value={message}
          />

          {/* form__actions is pinned by Modal to match other dialog footers. */}
          <div className="form__actions">
            <Button disabled={send.isPending} onClick={close} variant="secondary">
              Cancel
            </Button>

            <Button isLoading={send.isPending} onClick={submit} variant="primary">
              {send.isPending ? 'Sending…' : 'Send reminder'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
