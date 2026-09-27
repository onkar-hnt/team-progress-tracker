import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { useAuth } from '@app/providers/auth-context'
import { Button } from '@components/ui/button/Button'
import { Dropdown } from '@components/ui/dropdown/Dropdown'
import { CheckboxField, Field, TextField } from '@components/ui/field/Field'
import { Modal } from '@components/ui/modal/Modal'
import { USER_ROLES, USER_ROLE_LABELS } from '@models/user.model'
import type { Developer } from '@models/index'
import { isAdmin } from '@services/auth/index'
import { isSupabaseConfigured } from '@services/supabase/index'

import { employeeFormSchema, toEmployeeFormValues } from '../schemas/employee.schema'
import type { EmployeeFormValues } from '../schemas/employee.schema'

const ACCESS_ROLE_OPTIONS = USER_ROLES.map((role) => ({
  value: role,
  label: USER_ROLE_LABELS[role],
}))

// Provisioning requires Supabase Auth.
const CAN_PROVISION_LOGINS = isSupabaseConfigured()

interface EmployeeFormModalProps {
  /** Absent when adding. Seeds the fields when editing. */
  developer?: Developer

  isOpen: boolean
  onClose: () => void
  onSubmit: (values: EmployeeFormValues) => Promise<void>
  title: string
}

/** `Modal` mounts its body only while open, so the form re-seeds on each open. */
export function EmployeeFormModal({
  developer,
  isOpen,
  onClose,
  onSubmit,
  title,
}: EmployeeFormModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <EmployeeForm developer={developer} onCancel={onClose} onSubmit={onSubmit} />
    </Modal>
  )
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
    defaultValues: toEmployeeFormValues(developer),
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
