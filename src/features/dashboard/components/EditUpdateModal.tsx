import { Modal } from '@components/ui/modal/Modal'
import { DailyUpdateForm } from '@features/daily-update/components/DailyUpdateForm'
import type { DailyWorkEntryView } from '@services/work-tracker.views'

/** `Modal` mounts its body only while open, so the form re-seeds on each open. */
export function EditUpdateModal({
  entry,
  onClose,
  onSaved,
}: {
  /** Null when nothing is being edited, which is also what closes the dialog. */
  entry: DailyWorkEntryView | null
  onClose: () => void
  onSaved: () => void
}) {
  return (
    <Modal isOpen={entry !== null} onClose={onClose} title="Edit update">
      {entry === null ? null : (
        <DailyUpdateForm date={entry.date} entry={entry} onSaved={onSaved} />
      )}
    </Modal>
  )
}
