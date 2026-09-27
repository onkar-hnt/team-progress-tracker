import { Dropdown } from '@components/ui/dropdown/Dropdown'
import { TASK_STATUS_OPTIONS } from '@constants/task.constants'
import type { TaskStatus } from '@models/index'
import type { DailyWorkEntryView } from '@services/work-tracker.views'

/** Changes one entry's status from the list, without opening the edit form. */
export function EntryStatusSelect({
  entry,
  isSaving,
  onChange,
}: {
  entry: DailyWorkEntryView
  isSaving: boolean
  onChange: (status: TaskStatus) => void
}) {
  return (
    <div className="dashboard__entry-status">
      <Dropdown
        ariaLabel={`Status for ${entry.taskTitle}`}
        disabled={isSaving}
        isCompact
        onChange={(next) => {
          if (next !== entry.status) onChange(next as TaskStatus)
        }}
        options={TASK_STATUS_OPTIONS}
        value={entry.status}
      />

      {isSaving ? (
        <span className="dashboard__entry-saving" role="status">
          Saving…
        </span>
      ) : null}
    </div>
  )
}
