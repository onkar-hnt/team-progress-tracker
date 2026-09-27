import { useState } from 'react'

import { useConfirm } from '@app/providers/confirm-context'
import { useSnackbar } from '@app/providers/snackbar-context'
import { Button } from '@components/ui/button/Button'
import { ChecklistField } from '@components/ui/field/Field'
import { Modal } from '@components/ui/modal/Modal'
import { useSetMentorAssignments } from '@hooks/use-work-tracker'
import type { Mentor } from '@models/index'

interface MentorAssignmentsModalProps {
  assignedIds: readonly string[]
  developers: readonly { id: string; name: string; active: boolean }[]

  /** `null` when nobody is being assigned, which is what closes the dialog. */
  mentor: Mentor | null

  onClose: () => void
}

/** `Modal` mounts its body only while open, so the tick list re-seeds on each open. */
export function MentorAssignmentsModal({
  assignedIds,
  developers,
  mentor,
  onClose,
}: MentorAssignmentsModalProps) {
  return (
    <Modal
      isOpen={mentor !== null}
      onClose={onClose}
      title={mentor === null ? 'Assign developers' : `Developers for ${mentor.name}`}
    >
      {mentor === null ? null : (
        <AssignmentForm
          assignedIds={assignedIds}
          developers={developers}
          mentorId={mentor.id}
          mentorName={mentor.name}
          onDone={onClose}
        />
      )}
    </Modal>
  )
}

function AssignmentForm({
  assignedIds,
  developers,
  mentorId,
  mentorName,
  onDone,
}: {
  assignedIds: readonly string[]
  developers: readonly { id: string; name: string; active: boolean }[]
  mentorId: string
  mentorName: string
  onDone: () => void
}) {
  const confirm = useConfirm()
  const snackbar = useSnackbar()
  const [selected, setSelected] = useState<string[]>([...assignedIds])
  const setAssignments = useSetMentorAssignments()

  const toggle = (id: string) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    )
  }

  // Confirm when removing developers from a mentor's assignments.
  const save = async () => {
    const removed = developers.filter(
      (developer) => assignedIds.includes(developer.id) && !selected.includes(developer.id),
    )

    if (removed.length > 0) {
      const isConfirmed = await confirm({
        title: removed.length === 1 ? 'Remove this developer?' : 'Remove these developers?',
        message: `${mentorName} will no longer see the tasks, progress or feedback of ${removed
          .map((developer) => developer.name)
          .join(', ')}. Their records are not affected, and the assignment can be added back here.`,
        confirmLabel: 'Save assignments',
      })

      if (!isConfirmed) return
    }

    setAssignments.mutate(
      { mentorId, developerIds: selected },
      {
        onSuccess: () => {
          snackbar.success('The assigned developers were saved.')
          onDone()
        },
      },
    )
  }

  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <ChecklistField
        hint="A mentor can see the tasks, progress and feedback of everybody ticked here, and nobody else."
        label="Developers"
        onToggle={toggle}
        options={developers.map((developer) => ({
          id: developer.id,
          name: developer.active ? developer.name : `${developer.name} (inactive)`,
        }))}
        selected={selected}
      />

      <div className="form__actions">
        <Button onClick={onDone} variant="secondary">
          Cancel
        </Button>
        <Button isLoading={setAssignments.isPending} type="submit" variant="primary">
          {setAssignments.isPending ? 'Saving…' : 'Save assignments'}
        </Button>
      </div>
    </form>
  )
}
