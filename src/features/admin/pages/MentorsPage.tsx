import { useMemo, useState } from 'react'

import { useAuth } from '@app/providers/auth-context'
import { useConfirm } from '@app/providers/confirm-context'
import { useSnackbar } from '@app/providers/snackbar-context'
import { Button } from '@components/ui/button/Button'
import { SortableHeader } from '@components/ui/data-table/SortableHeader'
import { TableSearch } from '@components/ui/data-table/TableSearch'
import { EmptyState, ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { NameList } from '@components/ui/name-list/NameList'
import { Panel } from '@components/ui/panel/Panel'
import { useMentorAssignments } from '@hooks/use-access-scope'
import {
  useCreateMentor,
  useDeleteMentor,
  useRosterDevelopers,
  useRosterMentors,
  useProvisionMentorLogin,
  useUpdateMentor,
} from '@hooks/use-work-tracker'
import { useTableSort } from '@hooks/use-table-sort'
import type { Mentor } from '@models/index'
import { canManageMentorAssignments } from '@services/auth/index'
import { describeDeleteOutcome } from '@services/recycle-bin/recycle-bin.service'
import { isSupabaseConfigured } from '@services/supabase/index'
import { compareFlag, compareText, matchesSearch, sortRows } from '@utils/table.utils'

import { AdminPageLayout } from '../components/AdminPageLayout'
import { MentorAssignmentsModal } from '../components/MentorAssignmentsModal'
import { MentorFormModal } from '../components/MentorFormModal'
import { ProvisioningNoticeView } from '../components/ProvisioningNotice'
import {
  describeProvisionFailure,
  describeProvisionOutcome,
} from '../components/provisioning-notice'
import type { ProvisioningNotice } from '../components/provisioning-notice'

// Provisioning requires Supabase Auth.
const CAN_PROVISION_LOGINS = isSupabaseConfigured()

function describeUnprovisionable(mentor: Mentor): string | null {
  if (!mentor.active) {
    return 'Inactive mentors are not given logins. Mark them active first.'
  }

  return null
}

type SortKey = 'assigned' | 'email' | 'login' | 'name' | 'status'

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

  const visible = useMemo(() => {
    const rows = (mentorsQuery.data ?? []).filter((mentor) =>
      matchesSearch([mentor.name, mentor.email], search),
    )

    const compare = compareMentorsBy((mentor) => (assignmentsByMentor.get(mentor.id) ?? []).length)

    return sortRows(rows, sort, compare, (left, right) => compareText(left.name, right.name))
  }, [assignmentsByMentor, mentorsQuery.data, search, sort])

  const requestDelete = async (mentor: Mentor) => {
    const isDeleted = await confirm({
      title: 'Delete this mentor?',
      message: `“${mentor.name}” will be removed, and the developers assigned to them will be left without a mentor. ${describeDeleteOutcome()}`,
      confirmLabel: 'Delete mentor',
      isDestructive: true,
      action: () => deleteMentor.mutateAsync(mentor.id),
    })

    if (isDeleted) snackbar.success(`“${mentor.name}” was deleted.`)
  }

  // Initial password is shown once; row actions confirm before provisioning.
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

      <MentorFormModal
        isOpen={isCreating}
        onClose={() => setIsCreating(false)}
        onSubmit={async (values) => {
          const created = await createMentor.mutateAsync(values).catch(() => null)

          if (created === null) return

          setIsCreating(false)
          snackbar.success(`“${values.name}” was added.`)

          await requestLogin(created, true)
        }}
        title="Add mentor"
      />

      <MentorFormModal
        isOpen={editing !== null}
        mentor={editing ?? undefined}
        onClose={() => setEditing(null)}
        onSubmit={async (values) => {
          if (editing === null) return

          const isSaved = await updateMentor
            .mutateAsync({ id: editing.id, changes: values })
            .then(() => true)
            .catch(() => false)

          if (!isSaved) return

          setEditing(null)
          snackbar.success(`“${values.name}” was saved.`)
        }}
        title="Edit mentor"
      />

      <MentorAssignmentsModal
        assignedIds={assigning === null ? [] : (assignmentsByMentor.get(assigning.id) ?? [])}
        developers={developersQuery.data ?? []}
        mentor={assigning}
        onClose={() => setAssigning(null)}
      />
    </AdminPageLayout>
  )
}

