import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { Button } from '@components/ui/button/Button'
import { CheckboxField, TextField } from '@components/ui/field/Field'
import { Modal } from '@components/ui/modal/Modal'
import type { Mentor } from '@models/index'

import { mentorFormSchema, toMentorFormValues } from '../schemas/mentor.schema'
import type { MentorFormValues } from '../schemas/mentor.schema'

interface MentorFormModalProps {
  isOpen: boolean

  /** Absent when adding. Seeds the fields when editing. */
  mentor?: Mentor

  onClose: () => void
  onSubmit: (values: MentorFormValues) => Promise<void>
  title: string
}

/** `Modal` mounts its body only while open, so the form re-seeds on each open. */
export function MentorFormModal({
  isOpen,
  mentor,
  onClose,
  onSubmit,
  title,
}: MentorFormModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <MentorForm mentor={mentor} onCancel={onClose} onSubmit={onSubmit} />
    </Modal>
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
    defaultValues: toMentorFormValues(mentor),
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
