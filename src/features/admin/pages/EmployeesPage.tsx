import { useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { useAuth } from '@app/providers/auth-context'
import { useConfirm } from '@app/providers/confirm-context'
import { useSnackbar } from '@app/providers/snackbar-context'
import { Button } from '@components/ui/button/Button'
import { SortableHeader } from '@components/ui/data-table/SortableHeader'
import { TableSearch } from '@components/ui/data-table/TableSearch'
import { Dropdown } from '@components/ui/dropdown/Dropdown'
import { CheckboxField, Field, TextField } from '@components/ui/field/Field'
import { ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { Modal } from '@components/ui/modal/Modal'
import { Panel } from '@components/ui/panel/Panel'
import {
  useCreateDeveloper,
  useDeleteDeveloper,
  useRosterDevelopers,
  useProvisionDeveloperLogin,
  useUpdateDeveloper,
} from '@hooks/use-work-tracker'
import { useTableSort } from '@hooks/use-table-sort'
import { USER_ROLES, USER_ROLE_LABELS } from '@models/user.model'
import type { Developer, UserRole } from '@models/index'
import { isAdmin } from '@services/auth/index'
import { describeDeleteOutcome } from '@services/recycle-bin/recycle-bin.service'
import { isSupabaseConfigured } from '@services/supabase/index'
import { compareFlag, compareText, matchesSearch, sortRows } from '@utils/table.utils'

import { AdminPageLayout } from '../components/AdminPageLayout'
import { ProvisioningNoticeView } from '../components/ProvisioningNotice'
import {
  describeProvisionFailure,
  describeProvisionOutcome,
} from '../components/provisioning-notice'
import type { ProvisioningNotice } from '../components/provisioning-notice'

const employeeFormSchema = z.object({
  name: z.string().trim().min(2, { message: 'Enter the employee’s name' }),
  email: z.string().trim().email({ message: 'Enter a valid work email' }),
  role: z.string().trim(),
  location: z.string().trim(),
  accessRole: z.enum(USER_ROLES),
  active: z.boolean(),
})

const ACCESS_ROLE_OPTIONS = USER_ROLES.map((role) => ({
  value: role,
  label: USER_ROLE_LABELS[role],
}))

type EmployeeFormValues = z.infer<typeof employeeFormSchema>

// Provisioning requires Supabase Auth.
const CAN_PROVISION_LOGINS = isSupabaseConfigured()

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
  const [notice, setNotice] = useState<ProvisioningNotice | null>(null)
  const [search, setSearch] = useState('')

  const { sort, toggle } = useTableSort<SortKey>({ key: 'name', direction: 'asc' })

  const developersQuery = useRosterDevelopers()
  const createDeveloper = useCreateDeveloper()
  const updateDeveloper = useUpdateDeveloper()
  const deleteDeveloper = useDeleteDeveloper()
  const provisionLogin = useProvisionDeveloperLogin()

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

  // Initial password is shown once; row actions confirm before provisioning.
  const requestLogin = async (developer: Developer, isNewRecord = false) => {
    if (!CAN_PROVISION_LOGINS) return

    setNotice(null)

    const refusal = describeUnprovisionable(developer)

    if (refusal !== null) {
      setNotice({ tone: 'problem', message: `${developer.name} was saved. ${refusal}` })
      return
    }

    if (!isNewRecord) {
      const isConfirmed = await confirm({
        title: 'Create a login?',
        message: `A sign-in account will be created for “${developer.name}”. The initial password is shown here once and cannot be retrieved afterwards, so pass it on before you leave this screen.`,
        confirmLabel: 'Create login',
      })

      if (!isConfirmed) return
    }

    try {
      const result = await provisionLogin.mutateAsync({
        developerId: developer.id,
        ...(developer.email === undefined ? {} : { email: developer.email }),
      })

      const reminder = isNewRecord
        ? ' Assign them to an active project before they can submit daily updates.'
        : ''

      const outcome = describeProvisionOutcome(result, developer.name)

      setNotice({ tone: 'success', ...outcome, message: `${outcome.message}${reminder}` })
    } catch (error) {
      setNotice({
        tone: 'problem',
        message: `${developer.name} was saved, but their login could not be set up. ${describeProvisionFailure(error)} Use “Create login” on their row to try again.`,
      })
    }
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

      <Modal isOpen={isCreating} onClose={() => setIsCreating(false)} title="Add employee">
        <EmployeeForm
          onCancel={() => setIsCreating(false)}
          onSubmit={async (values) => {
            const created = await createDeveloper.mutateAsync(toRequest(values)).catch(() => null)

            if (created === null) return

            setIsCreating(false)
            snackbar.success(`“${values.name}” was added.`)

            await requestLogin(created, true)
          }}
        />
      </Modal>

      <Modal isOpen={editing !== null} onClose={() => setEditing(null)} title="Edit employee">
        {editing === null ? null : (
          <EmployeeForm
            developer={editing}
            onCancel={() => setEditing(null)}
            onSubmit={async (values) => {
              const isSaved = await updateDeveloper
                .mutateAsync({ id: editing.id, changes: toRequest(values) })
                .then(() => true)
                .catch(() => false)

              if (!isSaved) return

              setEditing(null)
              snackbar.success(`“${values.name}” was saved.`)
            }}
          />
        )}
      </Modal>
    </AdminPageLayout>
  )
}

/** Blank optional fields are omitted so the column stays null rather than empty. */
function toRequest(values: EmployeeFormValues) {
  return {
    name: values.name,
    email: values.email,
    active: values.active,
    accessRole: values.accessRole,
    ...(values.role === '' ? {} : { role: values.role }),
    ...(values.location === '' ? {} : { location: values.location }),
  }
}

function EmployeeForm({
  developer,
  onCancel,
  onSubmit,
}: {
  developer?: Developer
  onCancel: () => void
  onSubmit: (values: EmployeeFormValues) => Promise<void>
}) {
  const { user } = useAuth()

  // Only admins may change access role; a DB trigger syncs profiles.role.
  const canSetAccessRole = isAdmin(user)

  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: {
      name: developer?.name ?? '',
      email: developer?.email ?? '',
      role: developer?.role ?? '',
      location: developer?.location ?? '',
      accessRole: developer?.accessRole ?? ('developer' as UserRole),
      active: developer?.active ?? true,
    },
  })

  return (
    <form className="form" noValidate onSubmit={handleSubmit(onSubmit)}>
      <div className="form__grid">
        <TextField
          error={errors.name?.message}
          id="employee-name"
          label="Name"
          {...register('name')}
        />

        <TextField
          error={errors.email?.message}
          id="employee-email"
          label="Work email"
          type="email"
          {...register('email')}
        />

        <TextField
          id="employee-role"
          label="Job title"
          placeholder="Frontend Developer"
          {...register('role')}
        />

        <TextField id="employee-location" label="Location" {...register('location')} />

        <Field
          hint={
            canSetAccessRole
              ? 'Developers see only their own records. Mentors see the developers assigned to them. Administrators see everything. Changing this changes what the person sees at their next request, not only what this table says.'
              : 'Developers see only their own records. Mentors see the developers assigned to them. Only an administrator can change this, because it now decides what the person actually sees.'
          }
          htmlFor="employee-access"
          label="Access role"
        >
          <Controller
            control={control}
            name="accessRole"
            render={({ field }) => (
              <Dropdown
                disabled={!canSetAccessRole}
                id="employee-access"
                onBlur={field.onBlur}
                onChange={field.onChange}
                options={ACCESS_ROLE_OPTIONS}
                value={field.value}
              />
            )}
          />
        </Field>
      </div>

      <CheckboxField
        hint={
          canSetAccessRole && CAN_PROVISION_LOGINS
            ? 'Inactive employees keep their history, are not given logins and are not expected to post daily updates. Unticking this does not by itself revoke a login they already have — signing in is governed by the account — so disable it on the Logins screen, which lists anybody left in that state.'
            : 'Inactive employees keep their history, are not given logins and are not expected to post daily updates. Unticking this does not revoke a login somebody already has: signing in is governed by the account itself, so an administrator has to disable it separately.'
        }
        id="employee-active"
        label="Active"
        {...register('active')}
      />

      <div className="form__actions">
        <Button onClick={onCancel} variant="secondary">
          Cancel
        </Button>
        <Button isLoading={isSubmitting} type="submit" variant="primary">
          {isSubmitting ? 'Saving…' : 'Save employee'}
        </Button>
      </div>
    </form>
  )
}
