import { useMemo, useState } from 'react'

import { useConfirm } from '@app/providers/confirm-context'
import { useSnackbar } from '@app/providers/snackbar-context'
import { Button } from '@components/ui/button/Button'
import { SortableHeader } from '@components/ui/data-table/SortableHeader'
import { TableSearch } from '@components/ui/data-table/TableSearch'
import { ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { Panel } from '@components/ui/panel/Panel'
import {
  useCreateDeveloper,
  useDeleteDeveloper,
  useRosterDevelopers,
  useProvisionDeveloperLogin,
  useUpdateDeveloper,
} from '@hooks/use-work-tracker'
import { useTableSort } from '@hooks/use-table-sort'
import { USER_ROLE_LABELS } from '@models/user.model'
import type { Developer } from '@models/index'
import { describeDeleteOutcome } from '@services/recycle-bin/recycle-bin.service'
import { compareFlag, compareText, matchesSearch, sortRows } from '@utils/table.utils'

import { AdminPageLayout } from '../components/AdminPageLayout'
import { EmployeeFormModal } from '../components/EmployeeFormModal'
import { ProvisioningNoticeView } from '../components/ProvisioningNotice'
import { CAN_PROVISION_LOGINS, useLoginProvisioning } from '../hooks/use-login-provisioning'
import { toEmployeeRequest } from '../schemas/employee.schema'

function describeUnprovisionable(developer: Developer): string | null {
  if (!developer.active) {
    return 'Inactive employees are not given logins. Mark them active first.'
  }

  // Mentor logins must be created on the Mentors screen to get the mentor role.
  if ((developer.accessRole ?? 'developer') === 'mentor') {
    return 'Mentor logins are created on the Mentors screen, against their mentor record.'
  }

  if ((developer.accessRole ?? 'developer') !== 'developer') {
    const label = USER_ROLE_LABELS[developer.accessRole ?? 'developer']
    return `Logins are only issued automatically for developers. A ${label} account has to be set up separately.`
  }

  return null
}

function isProvisionable(developer: Developer): boolean {
  return describeUnprovisionable(developer) === null
}

type SortKey = 'access' | 'email' | 'location' | 'login' | 'name' | 'role' | 'status'

function compareEmployees(left: Developer, right: Developer, key: SortKey): number {
  switch (key) {
    case 'name':
      return compareText(left.name, right.name)
    case 'email':
      return compareText(left.email, right.email)
    case 'role':
      return compareText(left.role, right.role)
    case 'location':
      return compareText(left.location, right.location)
    case 'access':
      // Sort by display label, not the stored role value.
      return compareText(
        USER_ROLE_LABELS[left.accessRole ?? 'developer'],
        USER_ROLE_LABELS[right.accessRole ?? 'developer'],
      )
    case 'status':
      return compareFlag(left.active, right.active)
    case 'login':
      return compareFlag(left.profileId !== undefined, right.profileId !== undefined)
  }
}

export function EmployeesPage() {
  const confirm = useConfirm()
  const snackbar = useSnackbar()

  const [editing, setEditing] = useState<Developer | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [search, setSearch] = useState('')

  const { sort, toggle } = useTableSort<SortKey>({ key: 'name', direction: 'asc' })

  const developersQuery = useRosterDevelopers()
  const createDeveloper = useCreateDeveloper()
  const updateDeveloper = useUpdateDeveloper()
  const deleteDeveloper = useDeleteDeveloper()
  const provisionLogin = useProvisionDeveloperLogin()

  const { notice, requestLogin } = useLoginProvisioning<Developer>({
    describeRefusal: describeUnprovisionable,
    nameOf: (developer) => developer.name,
    newRecordReminder:
      ' Assign them to an active project before they can submit daily updates.',
    provision: (developer) =>
      provisionLogin.mutateAsync({
        developerId: developer.id,
        ...(developer.email === undefined ? {} : { email: developer.email }),
      }),
  })

  const visible = useMemo(() => {
    const rows = (developersQuery.data ?? []).filter((developer) =>
      matchesSearch([developer.name, developer.email, developer.role, developer.location], search),
    )

    return sortRows(rows, sort, compareEmployees, (left, right) =>
      compareText(left.name, right.name),
    )
  }, [developersQuery.data, search, sort])

  const requestDelete = async (developer: Developer) => {
    const isDeleted = await confirm({
      title: 'Delete this employee?',
      // DB refuses delete when the developer has related history.
      message: `“${developer.name}” will be removed from the employee list. This is only possible while they have no tasks, updates or feedback recorded. ${describeDeleteOutcome()}`,
      confirmLabel: 'Delete employee',
      isDestructive: true,
      action: () => deleteDeveloper.mutateAsync(developer.id),
    })

    if (isDeleted) snackbar.success(`“${developer.name}” was deleted.`)
  }

  return (
    <AdminPageLayout
      createLabel="Add employee"
      description="Employees, their access level and whether they can sign in."
      onCreate={() => {
        setIsCreating(true)
      }}
      title="Employees"
    >
      <ProvisioningNoticeView notice={notice} />

      <Panel
        description="Access role decides what each person can see. A login has to be created separately, and a developer also needs an active project before they can post daily updates."
        fills={visible.length > 0}
        title="All employees"
      >
        {developersQuery.error !== null ? (
          <ErrorState
            message={`Employees could not be loaded: ${developersQuery.error.message}`}
            onRetry={() => void developersQuery.refetch()}
          />
        ) : developersQuery.isPending ? (
          <Skeleton label="Loading employees…" rows={5} />
        ) : (
          <>
            <TableSearch
              hint="Name, email, job title or location"
              matchCount={visible.length}
              noun="employees"
              onChange={setSearch}
              totalCount={(developersQuery.data ?? []).length}
              value={search}
            />

            {visible.length === 0 ? (
              <p className="admin-page__note">
                Nobody matches “{search}”. Clear the search to see the whole list.
              </p>
            ) : (
              <div className="data-table__scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <SortableHeader columnKey="name" label="Name" onSort={toggle} sort={sort} />
                      <SortableHeader columnKey="email" label="Email" onSort={toggle} sort={sort} />
                      <SortableHeader columnKey="role" label="Role" onSort={toggle} sort={sort} />
                      <SortableHeader
                        columnKey="location"
                        label="Location"
                        onSort={toggle}
                        sort={sort}
                      />
                      <SortableHeader
                        columnKey="access"
                        label="Access"
                        onSort={toggle}
                        sort={sort}
                      />
                      <SortableHeader
                        columnKey="status"
                        label="Status"
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
                    {visible.map((developer) => (
                      <tr key={developer.id}>
                        <td className="data-table__nowrap">{developer.name}</td>
                        <td className="data-table__nowrap">{developer.email ?? '—'}</td>
                        <td>{developer.role ?? '—'}</td>
                        <td>{developer.location ?? '—'}</td>
                        <td>{USER_ROLE_LABELS[developer.accessRole ?? 'developer']}</td>
                        <td>{developer.active ? 'Active' : 'Inactive'}</td>
                        {CAN_PROVISION_LOGINS ? (
                          <td>
                            {developer.profileId !== undefined
                              ? 'Linked'
                              : isProvisionable(developer)
                                ? 'Not set up'
                                : '—'}
                          </td>
                        ) : null}
                        <td>
                          <div className="row-actions">
                            {CAN_PROVISION_LOGINS &&
                            developer.profileId === undefined &&
                            isProvisionable(developer) ? (
                              <Button
                                disabled={provisionLogin.isPending}
                                onClick={() => void requestLogin(developer)}
                                size="small"
                                variant="ghost"
                              >
                                {provisionLogin.isPending ? 'Working…' : 'Create login'}
                              </Button>
                            ) : null}
                            <Button
                              onClick={() => {
                                setEditing(developer)
                              }}
                              size="small"
                              variant="ghost"
                            >
                              Edit
                            </Button>
                            <Button
                              onClick={() => void requestDelete(developer)}
                              size="small"
                              variant="danger"
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Panel>

      <EmployeeFormModal
        isOpen={isCreating}
        onClose={() => setIsCreating(false)}
        onSubmit={async (values) => {
          const created = await createDeveloper
            .mutateAsync(toEmployeeRequest(values))
            .catch(() => null)

          if (created === null) return

          setIsCreating(false)
          snackbar.success(`“${values.name}” was added.`)

          await requestLogin(created, true)
        }}
        title="Add employee"
      />

      <EmployeeFormModal
        developer={editing ?? undefined}
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        onSubmit={async (values) => {
          if (editing === null) return

          const isSaved = await updateDeveloper
            .mutateAsync({ id: editing.id, changes: toEmployeeRequest(values) })
            .then(() => true)
            .catch(() => false)

          if (!isSaved) return

          setEditing(null)
          snackbar.success(`“${values.name}” was saved.`)
        }}
        title="Edit employee"
      />
    </AdminPageLayout>
  )
}

