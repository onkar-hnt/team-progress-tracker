import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { useAuth } from '@app/providers/auth-context'
import { EmptyState, ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { Modal } from '@components/ui/modal/Modal'
import { Panel } from '@components/ui/panel/Panel'
import { useMentorAssignments } from '@hooks/use-access-scope'
import {
  useCreateMentor,
  useDeleteMentor,
  useRosterDevelopers,
  useRosterMentors,
  useProvisionMentorLogin,
  useSetMentorAssignments,
  useUpdateMentor,
} from '@hooks/use-work-tracker'
import { writeState } from '@hooks/write-state'
import type { Mentor } from '@models/index'
import { canManageMentorAssignments } from '@services/auth/index'
import { appConfig } from '@config/app.config'

import { AdminPageLayout } from '../components/AdminPageLayout'
import { ProvisioningNoticeView } from '../components/ProvisioningNotice'
import {
  describeProvisionFailure,
  describeProvisionOutcome,
} from '../components/provisioning-notice'
import type { ProvisioningNotice } from '../components/provisioning-notice'

const mentorFormSchema = z.object({
  name: z.string().trim().min(2, { message: 'Enter the mentor’s name' }),
  email: z.string().trim().email({ message: 'Enter a valid work email' }),
  active: z.boolean(),
})

type MentorFormValues = z.infer<typeof mentorFormSchema>

/**
 * Logins only mean something against Supabase.
 *
 * The offline providers have no auth accounts to create, so the action is
 * hidden rather than offered and then refused by the server.
 */
const CAN_PROVISION_LOGINS = appConfig.dataSource === 'supabase'

/**
 * Why this mentor cannot be given a login, or null when they can.
 *
 * Only one reason, and it is the same one the Employees screen gives:
 * signing in is governed by the account, not by this table, so creating one
 * for somebody marked inactive would hand out access the screen appears to be
 * withholding.
 */
function describeUnprovisionable(mentor: Mentor): string | null {
  if (!mentor.active) {
    return 'Inactive mentors are not given logins. Mark them active first.'
  }

  return null
}

/**
 * Mentor records and their assigned developers.
 *
 * The assignment made here is what the whole access model rests on: it decides
 * which developers a mentor can see anywhere in the application, so it is
 * edited in one obvious place rather than buried in a developer's profile.
 *
 * Which is why mentors maintain this screen but cannot use that one action.
 * A mentor able to edit assignments could hand themselves every developer's
 * work and feedback, so it stays with administrators and the action is hidden
 * rather than offered and then refused by the database.
 */
export function MentorsPage() {
  const { user } = useAuth()
  const [editing, setEditing] = useState<Mentor | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [assigning, setAssigning] = useState<Mentor | null>(null)
  const [notice, setNotice] = useState<ProvisioningNotice | null>(null)

  const mentorsQuery = useRosterMentors()
  const developersQuery = useRosterDevelopers()
  const assignmentsQuery = useMentorAssignments()

  const canAssign = canManageMentorAssignments(user)

  const createMentor = useCreateMentor()
  const updateMentor = useUpdateMentor()
  const deleteMentor = useDeleteMentor()
  const provisionLogin = useProvisionMentorLogin()

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

  const writes = writeState([createMentor, updateMentor, deleteMentor])

  /**
   * Asks the server for a login, and says plainly when it could not.
   *
   * Never throws. The mentor record is already saved by the time this runs,
   * so a failure here is a partial success to report rather than an error to
   * unwind — and the row action retries it without writing a second mentor.
   */
  const requestLogin = async (mentor: Mentor) => {
    if (!CAN_PROVISION_LOGINS) return

    setNotice(null)

    const refusal = describeUnprovisionable(mentor)

    if (refusal !== null) {
      setNotice({ tone: 'problem', message: `${mentor.name} was saved. ${refusal}` })
      return
    }

    try {
      const result = await provisionLogin.mutateAsync({
        mentorId: mentor.id,
        email: mentor.email,
      })

      setNotice({ tone: 'success', ...describeProvisionOutcome(result, mentor.name) })
    } catch (error) {
      setNotice({
        tone: 'problem',
        message: `${mentor.name} was saved, but their login could not be set up. ${describeProvisionFailure(error)} Use “Create login” on their row to try again.`,
      })
    }
  }

  return (
    <AdminPageLayout
      description="Mentors, and the developers each of them can see."
      onCreate={() => {
        writes.clear()
        setIsCreating(true)
      }}
      createLabel="Add mentor"
      title="Mentors"
    >
      {writes.error === null ? null : <p className="form__alert">{writes.error.message}</p>}

      <ProvisioningNoticeView notice={notice} />

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
                  {CAN_PROVISION_LOGINS ? <th scope="col">Login</th> : null}
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
                      {/* Linked means an account exists and is attached.
                          Whether the password has been changed is not
                          readable from here, and guessing at it would be
                          worse than saying nothing. */}
                      {CAN_PROVISION_LOGINS ? (
                        <td>
                          {mentor.profileId !== undefined
                            ? 'Linked'
                            : describeUnprovisionable(mentor) === null
                              ? 'Not set up'
                              : '—'}
                        </td>
                      ) : null}
                      <td>
                        <div className="row-actions">
                          {CAN_PROVISION_LOGINS &&
                          mentor.profileId === undefined &&
                          describeUnprovisionable(mentor) === null ? (
                            <button
                              className="button button--ghost button--small"
                              disabled={provisionLogin.isPending}
                              onClick={() => void requestLogin(mentor)}
                              type="button"
                            >
                              {provisionLogin.isPending ? 'Working…' : 'Create login'}
                            </button>
                          ) : null}
                          {canAssign ? (
                            <button
                              className="button button--ghost button--small"
                              onClick={() => {
                                writes.clear()
                                setAssigning(mentor)
                              }}
                              type="button"
                            >
                              Assign
                            </button>
                          ) : null}
                          <button
                            className="button button--ghost button--small"
                            onClick={() => {
                              writes.clear()
                              setEditing(mentor)
                            }}
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
            // The record first, then the login. If provisioning fails the
            // modal still closes, because the mentor genuinely was created
            // and leaving the form open would invite a duplicate.
            const created = await createMentor.mutateAsync(values)
            setIsCreating(false)
            await requestLogin(created)
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
        <p className="form__hint">
          Inactive mentors keep their history and are not given logins. Unticking this does not
          revoke a login somebody already has: signing in is governed by the account itself, so an
          existing login has to be disabled separately.
        </p>
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
