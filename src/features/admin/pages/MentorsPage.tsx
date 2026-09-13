import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { useAuth } from '@app/providers/auth-context'
import { useConfirm } from '@app/providers/confirm-context'
import { useSnackbar } from '@app/providers/snackbar-context'
import { Button } from '@components/ui/button/Button'
import { SortableHeader } from '@components/ui/data-table/SortableHeader'
import { TableSearch } from '@components/ui/data-table/TableSearch'
import { CheckboxField, ChecklistField, TextField } from '@components/ui/field/Field'
import { EmptyState, ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { Modal } from '@components/ui/modal/Modal'
import { NameList } from '@components/ui/name-list/NameList'
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
import { useTableSort } from '@hooks/use-table-sort'
import type { Mentor } from '@models/index'
import { canManageMentorAssignments } from '@services/auth/index'
import { describeDeleteOutcome } from '@services/recycle-bin/recycle-bin.service'
import { compareFlag, compareText, matchesSearch, sortRows } from '@utils/table.utils'
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

type SortKey = 'assigned' | 'email' | 'login' | 'name' | 'status'

/**
 * One column at a time, ascending.
 *
 * `assigned` needs the assignment map, which is state rather than part of a
 * mentor — hence the extra argument, and hence this being a factory rather than a
 * plain function like the other tables have.
 */
function compareMentorsBy(assignmentCount: (mentor: Mentor) => number) {
  return (left: Mentor, right: Mentor, key: SortKey): number => {
    switch (key) {
      case 'name':
        return compareText(left.name, right.name)
      case 'email':
        return compareText(left.email, right.email)
      case 'status':
        return compareFlag(left.active, right.active)
      case 'assigned':
        return assignmentCount(left) - assignmentCount(right)
      case 'login':
        return compareFlag(left.profileId !== undefined, right.profileId !== undefined)
    }
  }
}

/**
 * Mentor records and their assigned developers.
 *
 * The assignment made here is what the whole access model rests on: it decides
 * which developers a mentor can see anywhere in the application, so it is
 * edited in one obvious place rather than buried in a developer's profile.
 *
 * Which is why Assign is offered per row rather than per person. An admin gets
 * it on every mentor; a mentor gets it on themselves alone, and on a colleague's
 * row it is absent rather than offered and then refused by the database.
 */
export function MentorsPage() {
  const { user } = useAuth()
  const confirm = useConfirm()
  const snackbar = useSnackbar()

  const [editing, setEditing] = useState<Mentor | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [assigning, setAssigning] = useState<Mentor | null>(null)
  const [notice, setNotice] = useState<ProvisioningNotice | null>(null)
  const [search, setSearch] = useState('')

  const { sort, toggle } = useTableSort<SortKey>({ key: 'name', direction: 'asc' }, ['assigned'])

  const mentorsQuery = useRosterMentors()
  const developersQuery = useRosterDevelopers()
  const assignmentsQuery = useMentorAssignments()

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

  // Searched by name and address only. The assigned developers are on screen but
  // deliberately not searchable here: somebody looking for "who mentors Priya"
  // wants the Employees screen, and matching a mentor row against a name that is
  // not the mentor's would read as the wrong row coming back.
  const visible = useMemo(() => {
    const rows = (mentorsQuery.data ?? []).filter((mentor) =>
      matchesSearch([mentor.name, mentor.email], search),
    )

    const compare = compareMentorsBy((mentor) => (assignmentsByMentor.get(mentor.id) ?? []).length)

    return sortRows(rows, sort, compare, (left, right) => compareText(left.name, right.name))
  }, [assignmentsByMentor, mentorsQuery.data, search, sort])

  /**
   * Asks first, then deletes, then says so.
   *
   * The confirmation resolves `true` only once the delete has actually landed,
   * so the success message cannot be shown for something that failed — and a
   * failure has already been reported by the mutation itself.
   */
  const requestDelete = async (mentor: Mentor) => {
    const isDeleted = await confirm({
      title: 'Delete this mentor?',
      // Feedback they have written is the exception that restricts the delete,
      // which the error message covers if it happens.
      //
      // Their assignments are not mentioned as lost, because under a soft delete
      // they are not: the rows stay while the mentor sits in the bin and come back
      // with them, and only destroying applies the cascade. What is true either way
      // is that the developers stop having a mentor, which is what this says.
      message: `“${mentor.name}” will be removed, and the developers assigned to them will be left without a mentor. ${describeDeleteOutcome()}`,
      confirmLabel: 'Delete mentor',
      isDestructive: true,
      action: () => deleteMentor.mutateAsync(mentor.id),
    })

    if (isDeleted) snackbar.success(`“${mentor.name}” was deleted.`)
  }

  /**
   * Asks the server for a login, and says plainly when it could not.
   *
   * Never throws. The mentor record is already saved by the time this runs,
   * so a failure here is a partial success to report rather than an error to
   * unwind — and the row action retries it without writing a second mentor.
   *
   * The row action asks before it starts, for the reason the Employees screen
   * does: this creates a real account and shows its initial password once, so a
   * press aimed at the wrong row costs a password reset in the Supabase
   * dashboard. `isNewRecord` skips the question for the add form, where the
   * intent has just been stated.
   */
  const requestLogin = async (mentor: Mentor, isNewRecord = false) => {
    if (!CAN_PROVISION_LOGINS) return

    setNotice(null)

    const refusal = describeUnprovisionable(mentor)

    if (refusal !== null) {
      setNotice({ tone: 'problem', message: `${mentor.name} was saved. ${refusal}` })
      return
    }

    if (!isNewRecord) {
      const isConfirmed = await confirm({
        title: 'Create a login?',
        message: `A sign-in account will be created for “${mentor.name}”. The initial password is shown here once and cannot be retrieved afterwards, so pass it on before you leave this screen.`,
        confirmLabel: 'Create login',
      })

      if (!isConfirmed) return
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
        setIsCreating(true)
      }}
      createLabel="Add mentor"
      title="Mentors"
    >
      <ProvisioningNoticeView notice={notice} />

      <Panel
        description="Assignments control what each mentor can access."
        fills={visible.length > 0}
        title="All mentors"
      >
        {mentorsQuery.error !== null ? (
          <ErrorState
            message={`Mentors could not be loaded: ${mentorsQuery.error.message}`}
            onRetry={() => void mentorsQuery.refetch()}
          />
        ) : mentorsQuery.isPending ? (
          <Skeleton label="Loading mentors…" rows={4} />
        ) : mentorsQuery.data?.length === 0 ? (
          <EmptyState
            icon="mentors"
            message="Add a mentor to start assigning employees to them."
            title="No mentors yet"
          />
        ) : (
          <>
            <TableSearch
              hint="Name or email"
              matchCount={visible.length}
              noun="mentors"
              onChange={setSearch}
              totalCount={(mentorsQuery.data ?? []).length}
              value={search}
            />

            {visible.length === 0 ? (
              <p className="admin-page__note">
                No mentor matches “{search}”. Clear the search to see the whole list.
              </p>
            ) : (
              <div className="data-table__scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <SortableHeader columnKey="name" label="Name" onSort={toggle} sort={sort} />
                      <SortableHeader columnKey="email" label="Email" onSort={toggle} sort={sort} />
                      <SortableHeader
                        columnKey="status"
                        label="Status"
                        onSort={toggle}
                        sort={sort}
                      />
                      <SortableHeader
                        columnKey="assigned"
                        label="Assigned developers"
                        onSort={toggle}
                        sort={sort}
                      />
                      {CAN_PROVISION_LOGINS ? (
                        <SortableHeader
                          columnKey="login"
                          label="Login"
                          onSort={toggle}
                          sort={sort}
                        />
                      ) : null}
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {visible.map((mentor) => {
                      const assigned = assignmentsByMentor.get(mentor.id) ?? []

                      return (
                        <tr key={mentor.id}>
                          <td className="data-table__nowrap">{mentor.name}</td>
                          <td className="data-table__nowrap">{mentor.email}</td>
                          <td>{mentor.active ? 'Active' : 'Inactive'}</td>
                          <td>
                            <NameList
                              names={assigned.map(developerName)}
                              title={`Developers assigned to ${mentor.name}`}
                            />
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
                                <Button
                                  disabled={provisionLogin.isPending}
                                  onClick={() => void requestLogin(mentor)}
                                  size="small"
                                  variant="ghost"
                                >
                                  {provisionLogin.isPending ? 'Working…' : 'Create login'}
                                </Button>
                              ) : null}
                              {canManageMentorAssignments(user, mentor.id) ? (
                                <Button
                                  onClick={() => {
                                    setAssigning(mentor)
                                  }}
                                  size="small"
                                  variant="ghost"
                                >
                                  Assign
                                </Button>
                              ) : null}
                              <Button
                                onClick={() => {
                                  setEditing(mentor)
                                }}
                                size="small"
                                variant="ghost"
                              >
                                Edit
                              </Button>
                              <Button
                                onClick={() => void requestDelete(mentor)}
                                size="small"
                                variant="danger"
                              >
                                Delete
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Panel>

      <Modal isOpen={isCreating} onClose={() => setIsCreating(false)} title="Add mentor">
        <MentorForm
          onCancel={() => setIsCreating(false)}
          onSubmit={async (values) => {
            const created = await createMentor.mutateAsync(values).catch(() => null)

            if (created === null) return

            // Closed and confirmed before provisioning is attempted, because the
            // mentor genuinely was created: leaving the form open would invite a
            // duplicate, and staying silent until the login attempt returns
            // would attribute its failure to the record.
            setIsCreating(false)
            snackbar.success(`“${values.name}” was added.`)

            await requestLogin(created, true)
          }}
        />
      </Modal>

      <Modal isOpen={editing !== null} onClose={() => setEditing(null)} title="Edit mentor">
        {editing === null ? null : (
          <MentorForm
            mentor={editing}
            onCancel={() => setEditing(null)}
            onSubmit={async (values) => {
              const isSaved = await updateMentor
                .mutateAsync({ id: editing.id, changes: values })
                .then(() => true)
                .catch(() => false)

              if (!isSaved) return

              setEditing(null)
              snackbar.success(`“${values.name}” was saved.`)
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
            mentorName={assigning.name}
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
      <TextField error={errors.name?.message} id="mentor-name" label="Name" {...register('name')} />

      <TextField
        error={errors.email?.message}
        hint="This is the address they sign in with."
        id="mentor-email"
        label="Work email"
        type="email"
        {...register('email')}
      />

      <CheckboxField
        hint="Inactive mentors keep their history and are not given logins. Unticking this does not revoke a login somebody already has: signing in is governed by the account itself, so an existing login has to be disabled separately."
        id="mentor-active"
        label="Active"
        {...register('active')}
      />

      <div className="form__actions">
        <Button onClick={onCancel} variant="secondary">
          Cancel
        </Button>
        <Button isLoading={isSubmitting} type="submit" variant="primary">
          {isSubmitting ? 'Saving…' : 'Save mentor'}
        </Button>
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

  /**
   * Asks only about what is being taken away.
   *
   * Ticking somebody on is additive and needs no ceremony. Unticking withdraws a
   * mentor's sight of that developer's tasks, progress and feedback, and it does
   * so through a control that looks like every other checkbox — the risk is
   * clearing one by accident and saving without noticing, since nothing on the
   * way out says what was dropped. So the question names them.
   */
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
