import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { Button } from '@components/ui/button/Button'
import { Dropdown } from '@components/ui/dropdown/Dropdown'
import { CheckboxField, ChecklistField, Field, TextField } from '@components/ui/field/Field'
import { Modal } from '@components/ui/modal/Modal'
import { DeferredRichTextField } from '@components/ui/rich-text/DeferredRichTextField'
import { PROJECT_STATUS_OPTIONS } from '@constants/project.constants'
import type { Project } from '@models/index'

import { projectFormSchema, toProjectFormValues } from '../schemas/project.schema'
import type { ProjectFormValues } from '../schemas/project.schema'

interface ProjectFormModalProps {
  developers: readonly { id: string; name: string }[]
  isOpen: boolean

  /** A mentor editing their own project cannot take themselves off it. */
  lockedMentorId?: string | undefined

  mentors: readonly { id: string; name: string }[]
  onClose: () => void
  onSubmit: (values: ProjectFormValues) => Promise<void>

  /** Absent when adding. Seeds the fields when editing. */
  project?: Project

  title: string
}

/** `Modal` mounts its body only while open, so the form re-seeds on each open. */
export function ProjectFormModal({
  developers,
  isOpen,
  lockedMentorId,
  mentors,
  onClose,
  onSubmit,
  project,
  title,
}: ProjectFormModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <ProjectForm
        developers={developers}
        lockedMentorId={lockedMentorId}
        mentors={mentors}
        onCancel={onClose}
        onSubmit={onSubmit}
        project={project}
      />
    </Modal>
  )
}

function ProjectForm({
  developers,
  lockedMentorId,
  mentors,
  onCancel,
  onSubmit,
  project,
}: {
  developers: readonly { id: string; name: string }[]
  lockedMentorId?: string | undefined
  mentors: readonly { id: string; name: string }[]
  onCancel: () => void
  onSubmit: (values: ProjectFormValues) => Promise<void>
  project?: Project
}) {
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setValue,
  } = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: toProjectFormValues(project, lockedMentorId),
  })

  // useWatch, not watch: watch returns a function the React compiler cannot memoise.
  const assigned = useWatch({ control, name: 'assignedDeveloperIds' })
  const selectedMentors = useWatch({ control, name: 'mentorIds' }) ?? []

  const toggleDeveloper = (id: string) => {
    setValue(
      'assignedDeveloperIds',
      assigned.includes(id) ? assigned.filter((value) => value !== id) : [...assigned, id],
      { shouldDirty: true },
    )
  }

  const toggleMentor = (id: string) => {
    if (id === lockedMentorId) return

    setValue(
      'mentorIds',
      selectedMentors.includes(id)
        ? selectedMentors.filter((value) => value !== id)
        : [...selectedMentors, id],
      { shouldDirty: true },
    )
  }

  return (
    <form className="form" noValidate onSubmit={handleSubmit(onSubmit)}>
      <div className="form__grid">
        <TextField
          error={errors.name?.message}
          id="project-name"
          label="Project name"
          {...register('name')}
        />

        <TextField
          error={errors.client?.message}
          id="project-client"
          label="Client"
          {...register('client')}
        />

        <Field htmlFor="project-status" label="Status">
          <Controller
            control={control}
            name="status"
            render={({ field }) => (
              <Dropdown
                id="project-status"
                onBlur={field.onBlur}
                onChange={field.onChange}
                options={PROJECT_STATUS_OPTIONS}
                value={field.value}
              />
            )}
          />
        </Field>

        <ChecklistField
          disabledIds={lockedMentorId === undefined ? [] : [lockedMentorId]}
          hint="Each mentor sees this project's work only for the developers assigned to them."
          label="Responsible mentors"
          onToggle={toggleMentor}
          options={mentors}
          selected={selectedMentors}
        />

        <TextField id="project-start" label="Start date" type="date" {...register('startDate')} />

        <TextField
          error={errors.endDate?.message}
          id="project-end"
          label="End date"
          type="date"
          {...register('endDate')}
        />
      </div>

      <Controller
        control={control}
        name="description"
        render={({ field }) => (
          <DeferredRichTextField
            error={errors.description?.message}
            id="project-description"
            isWide
            label="Description"
            onBlur={field.onBlur}
            onChange={field.onChange}
            placeholder="What the project is, and anything the team should know about it"
            value={field.value ?? ''}
          />
        )}
      />

      <ChecklistField
        label="Assigned developers"
        onToggle={toggleDeveloper}
        options={developers}
        selected={assigned}
      />

      <CheckboxField
        hint="Inactive projects stay in reports but are hidden from pickers."
        id="project-active"
        label="Active"
        {...register('active')}
      />

      <div className="form__actions">
        <Button onClick={onCancel} variant="secondary">
          Cancel
        </Button>
        <Button isLoading={isSubmitting} type="submit" variant="primary">
          {isSubmitting ? 'Saving…' : 'Save project'}
        </Button>
      </div>
    </form>
  )
}
