import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { Modal } from '@components/ui/modal/Modal'
import { Panel } from '@components/ui/panel/Panel'
import {
  useCreateDeveloper,
  useDeleteDeveloper,
  useDevelopers,
  useUpdateDeveloper,
} from '@hooks/use-work-tracker'
import { USER_ROLES, USER_ROLE_LABELS } from '@models/user.model'
import type { Developer, UserRole } from '@models/index'

import { AdminPageLayout } from '../components/AdminPageLayout'

const employeeFormSchema = z.object({
  name: z.string().trim().min(2, { message: 'Enter the employee’s name' }),
  email: z.string().trim().email({ message: 'Enter a valid work email' }),
  role: z.string().trim(),
  location: z.string().trim(),
  accessRole: z.enum(USER_ROLES),
  active: z.boolean(),
})

type EmployeeFormValues = z.infer<typeof employeeFormSchema>

/**
 * The Employees sheet, which is also the list of who may sign in.
 *
 * Adding a row here is what grants access, and the access role on that row is
 * what the application reads to decide a person's permissions. There is no
 * separate user list to keep in step.
 */
export function EmployeesPage() {
  const [editing, setEditing] = useState<Developer | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const developersQuery = useDevelopers()
  const createDeveloper = useCreateDeveloper()
  const updateDeveloper = useUpdateDeveloper()
  const deleteDeveloper = useDeleteDeveloper()

  const writeError = createDeveloper.error ?? updateDeveloper.error ?? deleteDeveloper.error

  return (
    <AdminPageLayout
      createLabel="Add employee"
      description="Employees, their access level and whether they can sign in."
      onCreate={() => setIsCreating(true)}
      title="Employees"
    >
      {writeError === null ? null : <p className="form__alert">{writeError.message}</p>}

      <Panel
        description="Access role decides what each person can see across the application."
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
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Role</th>
                  <th scope="col">Location</th>
                  <th scope="col">Access</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>

              <tbody>
                {(developersQuery.data ?? []).map((developer) => (
                  <tr key={developer.id}>
                    <td>{developer.name}</td>
                    <td>{developer.email ?? '—'}</td>
                    <td>{developer.role ?? '—'}</td>
                    <td>{developer.location ?? '—'}</td>
                    <td>{USER_ROLE_LABELS[developer.accessRole ?? 'developer']}</td>
                    <td>{developer.active ? 'Active' : 'Inactive'}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="button button--ghost button--small"
                          onClick={() => setEditing(developer)}
                          type="button"
                        >
                          Edit
                        </button>
                        <button
                          className="button button--danger button--small"
                          onClick={() => {
                            if (window.confirm(`Delete ${developer.name}?`)) {
                              deleteDeveloper.mutate(developer.id)
                            }
                          }}
                          type="button"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal isOpen={isCreating} onClose={() => setIsCreating(false)} title="Add employee">
        <EmployeeForm
          onCancel={() => setIsCreating(false)}
          onSubmit={async (values) => {
            await createDeveloper.mutateAsync(toRequest(values))
            setIsCreating(false)
          }}
        />
      </Modal>

      <Modal isOpen={editing !== null} onClose={() => setEditing(null)} title="Edit employee">
        {editing === null ? null : (
          <EmployeeForm
            developer={editing}
            onCancel={() => setEditing(null)}
            onSubmit={async (values) => {
              await updateDeveloper.mutateAsync({ id: editing.id, changes: toRequest(values) })
              setEditing(null)
            }}
          />
        )}
      </Modal>
    </AdminPageLayout>
  )
}

/** Blank optional fields are omitted so the workbook keeps empty cells. */
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
  const {
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
        <div className="form__field">
          <label htmlFor="employee-name">Name</label>
          <input id="employee-name" {...register('name')} aria-invalid={errors.name ? 'true' : undefined} />
          {errors.name ? <p className="form__error">{errors.name.message}</p> : null}
        </div>

        <div className="form__field">
          <label htmlFor="employee-email">Work email</label>
          <input id="employee-email" type="email" {...register('email')} aria-invalid={errors.email ? 'true' : undefined} />
          {errors.email ? <p className="form__error">{errors.email.message}</p> : null}
        </div>

        <div className="form__field">
          <label htmlFor="employee-role">Job title</label>
          <input id="employee-role" placeholder="Frontend Developer" {...register('role')} />
        </div>

        <div className="form__field">
          <label htmlFor="employee-location">Location</label>
          <input id="employee-location" {...register('location')} />
        </div>

        <div className="form__field">
          <label htmlFor="employee-access">Access role</label>
          <select id="employee-access" {...register('accessRole')}>
            {USER_ROLES.map((role) => (
              <option key={role} value={role}>
                {USER_ROLE_LABELS[role]}
              </option>
            ))}
          </select>
          <p className="form__hint">
            Developers see only their own records. Mentors see the developers assigned to them.
            Administrators see everything.
          </p>
        </div>
      </div>

      <div className="form__field">
        <label className="form__checkbox" htmlFor="employee-active">
          <input id="employee-active" type="checkbox" {...register('active')} />
          Active
        </label>
        <p className="form__hint">
          Inactive employees keep their history but cannot sign in and are not expected to post
          daily updates.
        </p>
      </div>

      <div className="form__actions">
        <button className="button button--secondary" onClick={onCancel} type="button">
          Cancel
        </button>
        <button className="button button--primary" disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Saving…' : 'Save employee'}
        </button>
      </div>
    </form>
  )
}
