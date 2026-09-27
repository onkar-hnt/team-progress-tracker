import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { Button } from '@components/ui/button/Button'
import { Dropdown } from '@components/ui/dropdown/Dropdown'
import { Field, TextField } from '@components/ui/field/Field'
import { Modal } from '@components/ui/modal/Modal'
import { DeferredRichTextField } from '@components/ui/rich-text/DeferredRichTextField'
import { TASK_PRIORITY_OPTIONS, TASK_STATUS_OPTIONS } from '@constants/task.constants'
import type { AssignedTask } from '@models/index'

import { taskFormSchema, toTaskFormValues } from '../schemas/task.schema'
import type { TaskFormValues } from '../schemas/task.schema'

interface TaskFormModalProps {
  developers: readonly { id: string; name: string }[]
  isOpen: boolean
  mentors: readonly { id: string; name: string }[]
  onClose: () => void
  onSubmit: (values: TaskFormValues) => Promise<void>
  projects: readonly { id: string; name: string }[]

  /** Absent when assigning. Seeds the fields when editing. */
  task?: AssignedTask

  title: string
}

/** `Modal` mounts its body only while open, so the form re-seeds on each open. */
export function TaskFormModal({
  developers,
  isOpen,
  mentors,
  onClose,
  onSubmit,
  projects,
  task,
  title,
}: TaskFormModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <TaskForm
        developers={developers}
        mentors={mentors}
        onCancel={onClose}
        onSubmit={onSubmit}
        projects={projects}
        task={task}
      />
    </Modal>
  )
}

function TaskForm({
  developers,
  mentors,
  onCancel,
  onSubmit,
  projects,
  task,
}: {
  developers: readonly { id: string; name: string }[]
  mentors: readonly { id: string; name: string }[]
  onCancel: () => void
  onSubmit: (values: TaskFormValues) => Promise<void>
  projects: readonly { id: string; name: string }[]
  task?: AssignedTask
}) {
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: toTaskFormValues(task),
  })

  return (
    <form className="form" noValidate onSubmit={handleSubmit(onSubmit)}>
      <TextField
        error={errors.name?.message}
        id="task-name"
        isWide
        label="Task"
        placeholder="Build the invoice export"
        {...register('name')}
      />

      <div className="form__grid">
        <Field error={errors.developerId?.message} htmlFor="task-developer" label="Developer">
          <Controller
            control={control}
            name="developerId"
            render={({ field }) => (
              <Dropdown
                id="task-developer"
                isInvalid={errors.developerId !== undefined}
                onBlur={field.onBlur}
                onChange={field.onChange}
                options={[
                  { value: '', label: 'Select a developer' },
                  ...developers.map((developer) => ({
                    value: developer.id,
                    label: developer.name,
                  })),
                ]}
                value={field.value}
              />
            )}
          />
        </Field>

        <Field error={errors.projectId?.message} htmlFor="task-project" label="Project">
          <Controller
            control={control}
            name="projectId"
            render={({ field }) => (
              <Dropdown
                id="task-project"
                isInvalid={errors.projectId !== undefined}
                onBlur={field.onBlur}
                onChange={field.onChange}
                options={[
                  { value: '', label: 'Select a project' },
                  ...projects.map((project) => ({ value: project.id, label: project.name })),
                ]}
                value={field.value}
              />
            )}
          />
        </Field>

        <Field htmlFor="task-mentor" label="Mentor">
          <Controller
            control={control}
            name="mentorId"
            render={({ field }) => (
              <Dropdown
                id="task-mentor"
                onBlur={field.onBlur}
                onChange={field.onChange}
                options={[
                  { value: '', label: 'Unassigned' },
                  ...mentors.map((mentor) => ({ value: mentor.id, label: mentor.name })),
                ]}
                value={field.value}
              />
            )}
          />
        </Field>

        <Field htmlFor="task-priority" label="Priority">
          <Controller
            control={control}
            name="priority"
            render={({ field }) => (
              <Dropdown
                id="task-priority"
                onBlur={field.onBlur}
                onChange={field.onChange}
                options={TASK_PRIORITY_OPTIONS}
                value={field.value}
              />
            )}
          />
        </Field>

        <Field htmlFor="task-status" label="Status">
          <Controller
            control={control}
            name="status"
            render={({ field }) => (
              <Dropdown
                id="task-status"
                onBlur={field.onBlur}
                onChange={field.onChange}
                options={TASK_STATUS_OPTIONS}
                value={field.value}
              />
            )}
          />
        </Field>

        <TextField id="task-created" label="Start date" type="date" {...register('createdDate')} />

        <TextField
          error={errors.dueDate?.message}
          id="task-due"
          label="Due date"
          type="date"
          {...register('dueDate')}
        />

        <TextField
          error={errors.estimatedHours?.message}
          hint="Hours the whole task should take. The developer can revise it."
          id="task-estimated-hours"
          inputMode="decimal"
          label="Estimated hours"
          min="0"
          step="0.25"
          type="number"
          {...register('estimatedHours')}
        />
      </div>

      <Controller
        control={control}
        name="description"
        render={({ field }) => (
          <DeferredRichTextField
            error={errors.description?.message}
            id="task-description"
            isWide
            label="Description"
            onBlur={field.onBlur}
            onChange={field.onChange}
            placeholder="What the task covers, and anything the developer needs to know"
            value={field.value ?? ''}
          />
        )}
      />

      <div className="form__actions">
        <Button onClick={onCancel} variant="secondary">
          Cancel
        </Button>
        <Button isLoading={isSubmitting} type="submit" variant="primary">
          {isSubmitting ? 'Saving…' : 'Save task'}
        </Button>
      </div>
    </form>
  )
}
