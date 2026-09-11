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
  useProvisionDeveloperLogin,
  useUpdateDeveloper,
} from '@hooks/use-work-tracker'
import { USER_ROLES, USER_ROLE_LABELS } from '@models/user.model'
import type { Developer, UserRole } from '@models/index'
import { appConfig } from '@config/app.config'
import { ProvisioningError } from '@services/provisioning/provision-developer'
import type { ProvisionDeveloperResult } from '@services/provisioning/provision-developer'

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

/** What to say after a provisioning attempt, and how loudly. */
interface Notice {
  tone: 'success' | 'problem'
  message: string

  /**
   * The sign-in details, shown once and never fetched again.
   *
   * They exist here only for as long as this notice is on screen: the
   * password is not written to the employee row, the profile, storage, or the
   * query cache, and no endpoint will return it a second time. An
   * administrator who navigates away before passing it on has to reset the
   * password from the Supabase dashboard, which is the correct trade — the
   * alternative is keeping a recoverable copy of a live password.
   */
  credentials?: { email: string; password: string }
}

/**
 * Logins only mean something against Supabase.
 *
 * The offline providers have no auth accounts to create, so the action is
 * hidden rather than offered and then refused by the server.
 */
const CAN_PROVISION_LOGINS = appConfig.dataSource === 'supabase'

/**
 * Why this row cannot be given a login, or null when it can.
 *
 * Provisioning creates developer accounts and nothing else. Offering it on a
 * mentor or an administrator would produce a developer profile for them,
 * which is worse than not offering it at all: the row would look provisioned
 * while granting the wrong access.
 *
 * An inactive employee is refused for a different reason. Nothing stops the
 * account working once it exists — sign-in is decided by the profile's
 * status, not by this table — so creating one for somebody marked inactive
 * would hand out access the screen appears to be withholding.
 */
function describeUnprovisionable(developer: Developer): string | null {
  if (!developer.active) {
    return 'Inactive employees are not given logins. Mark them active first.'
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

// Worded for both callers. This runs after creating an employee and after
// retrying on an existing row, so it may not say the person was created.
function describeOutcome(
  result: ProvisionDeveloperResult,
  name: string,
): Pick<Notice, 'credentials' | 'message'> {
  if (result.outcome === 'created') {
    return {
      message: `Login access created successfully for ${name}.`,
      ...(result.initialPassword === undefined
        ? {}
        : { credentials: { email: result.email, password: result.initialPassword } }),
    }
  }

  if (result.outcome === 'linked-existing') {
    return {
      message: `${name} was attached to the existing account for ${result.email}. They can sign in with the password they already have.`,
    }
  }

  return { message: `${name} already had a login, so nothing was changed.` }
}

/**
 * The Employees list, and where logins are handed out.
 *
 * Two separate things happen here and the distinction matters when one of
 * them fails. The employee record is an ordinary row this screen writes
 * through the usual path. The login is an auth account, which only the
 * server may create, so it goes out to the provisioning function. A record
 * without a login is a valid state — somebody recorded before they start —
 * and the list shows which of the two each person has.
 */
export function EmployeesPage() {
  const [editing, setEditing] = useState<Developer | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  const developersQuery = useDevelopers()
  const createDeveloper = useCreateDeveloper()
  const updateDeveloper = useUpdateDeveloper()
  const deleteDeveloper = useDeleteDeveloper()
  const provisionLogin = useProvisionDeveloperLogin()

  const writeError = createDeveloper.error ?? updateDeveloper.error ?? deleteDeveloper.error

  /**
   * Asks the server for a login, and says plainly when it could not.
   *
   * Never throws. The employee record is already saved by the time this
   * runs, so a failure here is a partial success to report rather than an
   * error to unwind — and the row action retries it without writing a
   * second employee.
   */
  const requestLogin = async (developer: Developer, isNewRecord = false) => {
    if (!CAN_PROVISION_LOGINS) return

    setNotice(null)

    const refusal = describeUnprovisionable(developer)

    if (refusal !== null) {
      setNotice({ tone: 'problem', message: `${developer.name} was saved. ${refusal}` })
      return
    }

    try {
      const result = await provisionLogin.mutateAsync({
        developerId: developer.id,
        ...(developer.email === undefined ? {} : { email: developer.email }),
      })

      // Said only on creation, where it is the next thing to do. Repeating it
      // on every retry would train people to ignore it.
      const reminder = isNewRecord
        ? ' Assign them to an active project before they can submit daily updates.'
        : ''

      const outcome = describeOutcome(result, developer.name)

      setNotice({ tone: 'success', ...outcome, message: `${outcome.message}${reminder}` })
    } catch (error) {
      const detail =
        error instanceof ProvisioningError || error instanceof Error
          ? error.message
          : 'The reason is unknown.'

      setNotice({
        tone: 'problem',
        message: `${developer.name} was saved, but their login could not be set up. ${detail} Use “Create login” on their row to try again.`,
      })
    }
  }

  return (
    <AdminPageLayout
      createLabel="Add employee"
      description="Employees, their access level and whether they can sign in."
      onCreate={() => setIsCreating(true)}
      title="Employees"
    >
      {writeError === null ? null : <p className="form__alert">{writeError.message}</p>}

      <div aria-live="polite" role="status">
        {notice === null ? null : (
          <>
            <p className={notice.tone === 'problem' ? 'form__alert' : 'form__hint'}>
              {notice.message}
            </p>
            {notice.credentials === undefined ? null : (
              <div className="credentials">
                <p className="credentials__line">
                  <span className="credentials__label">Email</span>
                  <code>{notice.credentials.email}</code>
                </p>
                <p className="credentials__line">
                  <span className="credentials__label">Temporary password</span>
                  <code>{notice.credentials.password}</code>
                </p>
                <p className="credentials__note">
                  Pass these on now — they are shown once and cannot be looked up again. The
                  employee must change this password at first login, and nothing else in the
                  application will open until they do.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      <Panel
        description="Access role decides what each person can see. A login has to be created separately, and a developer also needs an active project before they can post daily updates."
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
                  {CAN_PROVISION_LOGINS ? <th scope="col">Login</th> : null}
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
                    {/* Linked means an account exists and is attached. Whether
                        the invitation has actually been accepted is not
                        readable from here, and guessing at it would be worse
                        than saying nothing. */}
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
                          <button
                            className="button button--ghost button--small"
                            disabled={provisionLogin.isPending}
                            onClick={() => void requestLogin(developer)}
                            type="button"
                          >
                            {provisionLogin.isPending ? 'Working…' : 'Create login'}
                          </button>
                        ) : null}
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
            // The record first, then the login. If provisioning fails the
            // modal still closes, because the employee genuinely was created
            // and leaving the form open would invite a duplicate.
            const created = await createDeveloper.mutateAsync(toRequest(values))
            setIsCreating(false)
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
          Inactive employees keep their history, are not given logins and are not expected to post
          daily updates. Unticking this does not revoke a login somebody already has: signing in is
          governed by the account itself, so an existing login has to be disabled separately.
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
