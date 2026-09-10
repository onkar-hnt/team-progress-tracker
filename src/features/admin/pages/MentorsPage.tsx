import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { EmptyState, ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { Modal } from '@components/ui/modal/Modal'
import { Panel } from '@components/ui/panel/Panel'
import { useMentorAssignments } from '@hooks/use-access-scope'
import {
  useCreateMentor,
  useDeleteMentor,
  useDevelopers,
  useMentors,
  useSetMentorAssignments,
  useUpdateMentor,
} from '@hooks/use-work-tracker'
import type { Mentor } from '@models/index'

import { AdminPageLayout } from '../components/AdminPageLayout'

const mentorFormSchema = z.object({
  name: z.string().trim().min(2, { message: 'Enter the mentor’s name' }),
  email: z.string().trim().email({ message: 'Enter a valid work email' }),
  active: z.boolean(),
})

type MentorFormValues = z.infer<typeof mentorFormSchema>

/**
 * Mentor records and their assigned developers.
 *
 * The assignment made here is what the whole access model rests on: it decides
 * which developers a mentor can see anywhere in the application, so it is
 * edited in one obvious place rather than buried in a developer's profile.
 */
export function MentorsPage() {
  const [editing, setEditing] = useState<Mentor | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [assigning, setAssigning] = useState<Mentor | null>(null)

  const mentorsQuery = useMentors()
  const developersQuery = useDevelopers()
  const assignmentsQuery = useMentorAssignments()

  const createMentor = useCreateMentor()
  const updateMentor = useUpdateMentor()
  const deleteMentor = useDeleteMentor()

  const assignmentsByMentor = useMemo(() => {
    const map = new Map<string, string[]>()

    for (const assignment of assignmentsQuery.data ?? []) {
      map.set(assignment.mentorId, [
        ...(map.get(assignment.mentorId) ?? []),
        assignment.developerId,
      ])
    }

    return map
  }, [assignmentsQuery.data])

  const developerName = (id: string) =>
    developersQuery.data?.find((developer) => developer.id === id)?.name ?? id

  const writeError = createMentor.error ?? updateMentor.error ?? deleteMentor.error

  return (
    <AdminPageLayout
      description="Mentors, and the developers each of them can see."
      onCreate={() => setIsCreating(true)}
      createLabel="Add mentor"
      title="Mentors"
    >
      {writeError === null ? null : <p className="form__alert">{writeError.message}</p>}

      <Panel description="Assignments control what each mentor can access." title="All mentors">
        {mentorsQuery.error !== null ? (
          <ErrorState
            message={`Mentors could not be loaded: ${mentorsQuery.error.message}`}
            onRetry={() => void mentorsQuery.refetch()}
          />
        ) : mentorsQuery.isPending ? (
          <Skeleton label="Loading mentors…" rows={4} />
        ) : mentorsQuery.data?.length === 0 ? (
          <EmptyState message="No mentors added yet." />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Status</th>
                  <th scope="col">Assigned developers</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>

              <tbody>
                {(mentorsQuery.data ?? []).map((mentor) => {
                  const assigned = assignmentsByMentor.get(mentor.id) ?? []

                  return (
                    <tr key={mentor.id}>
                      <td>{mentor.name}</td>
                      <td>{mentor.email}</td>
                      <td>{mentor.active ? 'Active' : 'Inactive'}</td>
                      <td>
                        {assigned.length === 0
                          ? 'None'
                          : assigned.map(developerName).join(', ')}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="button button--ghost button--small"
                            onClick={() => setAssigning(mentor)}
                            type="button"
                          >
                            Assign
                          </button>
                          <button
                            className="button button--ghost button--small"
                            onClick={() => setEditing(mentor)}
                            type="button"
                          >
                            Edit
                          </button>
                          <button
                            className="button button--danger button--small"
                            onClick={() => {
                              if (window.confirm(`Delete ${mentor.name}?`)) {
                                deleteMentor.mutate(mentor.id)
                              }
                            }}
                            type="button"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal isOpen={isCreating} onClose={() => setIsCreating(false)} title="Add mentor">
        <MentorForm
          onCancel={() => setIsCreating(false)}
          onSubmit={async (values) => {
            await createMentor.mutateAsync(values)
            setIsCreating(false)
          }}
        />
      </Modal>

      <Modal isOpen={editing !== null} onClose={() => setEditing(null)} title="Edit mentor">
        {editing === null ? null : (
          <MentorForm
            mentor={editing}
            onCancel={() => setEditing(null)}
            onSubmit={async (values) => {
              await updateMentor.mutateAsync({ id: editing.id, changes: values })
              setEditing(null)
            }}
          />
        )}
      </Modal>

      <Modal
        isOpen={assigning !== null}
        onClose={() => setAssigning(null)}
        title={assigning === null ? 'Assign developers' : `Developers for ${assigning.name}`}
      >
        {assigning === null ? null : (
          <AssignmentForm
            assignedIds={assignmentsByMentor.get(assigning.id) ?? []}
            developers={developersQuery.data ?? []}
            mentorId={assigning.id}
            onDone={() => setAssigning(null)}
          />
        )}
      </Modal>
    </AdminPageLayout>
  )
}

function MentorForm({
  mentor,
  onCancel,
  onSubmit,
}: {
  mentor?: Mentor
  onCancel: () => void
  onSubmit: (values: MentorFormValues) => Promise<void>
}) {
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<MentorFormValues>({
    resolver: zodResolver(mentorFormSchema),
    defaultValues: {
      name: mentor?.name ?? '',
      email: mentor?.email ?? '',
      active: mentor?.active ?? true,
    },
  })

  return (
    <form className="form" noValidate onSubmit={handleSubmit(onSubmit)}>
      <div className="form__field">
        <label htmlFor="mentor-name">Name</label>
        <input id="mentor-name" {...register('name')} aria-invalid={errors.name ? 'true' : undefined} />
        {errors.name ? <p className="form__error">{errors.name.message}</p> : null}
      </div>

      <div className="form__field">
        <label htmlFor="mentor-email">Work email</label>
        <input id="mentor-email" type="email" {...register('email')} aria-invalid={errors.email ? 'true' : undefined} />
        {errors.email ? <p className="form__error">{errors.email.message}</p> : null}
        <p className="form__hint">This is the address they sign in with.</p>
      </div>

      <div className="form__field">
        <label className="form__checkbox" htmlFor="mentor-active">
          <input id="mentor-active" type="checkbox" {...register('active')} />
          Active
        </label>
        <p className="form__hint">Inactive mentors keep their history but cannot sign in.</p>
      </div>

      <div className="form__actions">
        <button className="button button--secondary" onClick={onCancel} type="button">
          Cancel
        </button>
        <button className="button button--primary" disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Saving…' : 'Save mentor'}
        </button>
      </div>
    </form>
  )
}

/**
 * Assignments are edited as a whole set rather than one at a time.
 *
 * Submitting the complete list makes the result predictable: whatever is
 * ticked is what the mentor can see afterwards, with no partially applied
 * state if a single write fails.
 */
function AssignmentForm({
  assignedIds,
  developers,
  mentorId,
  onDone,
}: {
  assignedIds: readonly string[]
  developers: readonly { id: string; name: string; active: boolean }[]
  mentorId: string
  onDone: () => void
}) {
  const [selected, setSelected] = useState<string[]>([...assignedIds])
  const setAssignments = useSetMentorAssignments()

  const toggle = (id: string) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    )
  }

  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault()
        setAssignments.mutate({ mentorId, developerIds: selected }, { onSuccess: onDone })
      }}
    >
      <div className="form__field">
        <span>Developers</span>
        <div className="form__checklist">
          {developers.map((developer) => (
            <label className="form__checkbox" key={developer.id}>
              <input
                checked={selected.includes(developer.id)}
                onChange={() => toggle(developer.id)}
                type="checkbox"
              />
              {developer.name}
              {developer.active ? '' : ' (inactive)'}
            </label>
          ))}
        </div>
        <p className="form__hint">
          A mentor can see the tasks, progress and feedback of everybody ticked here, and nobody
          else.
        </p>
      </div>

      {setAssignments.error === null ? null : (
        <p className="form__alert">{setAssignments.error.message}</p>
      )}

      <div className="form__actions">
        <button className="button button--secondary" onClick={onDone} type="button">
          Cancel
        </button>
        <button
          className="button button--primary"
          disabled={setAssignments.isPending}
          type="submit"
        >
          {setAssignments.isPending ? 'Saving…' : 'Save assignments'}
        </button>
      </div>
    </form>
  )
}
