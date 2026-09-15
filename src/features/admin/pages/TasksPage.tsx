import { useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { useConfirm } from '@app/providers/confirm-context'
import { useSnackbar } from '@app/providers/snackbar-context'
import { Button } from '@components/ui/button/Button'
import { TableSearch } from '@components/ui/data-table/TableSearch'
import { Dropdown } from '@components/ui/dropdown/Dropdown'
import { Field, TextAreaField, TextField } from '@components/ui/field/Field'
import { ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { Modal } from '@components/ui/modal/Modal'
import { Panel } from '@components/ui/panel/Panel'
import { TASK_PRIORITY_OPTIONS, TASK_STATUS_OPTIONS } from '@constants/task.constants'
import { TaskTable } from '@features/tasks/components/TaskTable'
import {
  useActiveDevelopers,
  useActiveRosterProjects,
  useComments,
  useCreateTask,
  useDeleteTask,
  useRosterMentors,
  useTasks,
  useUpdateTask,
} from '@hooks/use-work-tracker'
import { TASK_PRIORITIES, TASK_STATUSES } from '@models/daily-work.model'
import type { AssignedTask } from '@models/index'
import { describeDeleteOutcome } from '@services/recycle-bin/recycle-bin.service'
import { todayIsoDate } from '@utils/date.utils'
import { matchesSearch } from '@utils/table.utils'
import { countCommentsByTask } from '@utils/task.utils'

import { AdminPageLayout } from '../components/AdminPageLayout'

const taskFormSchema = z
  .object({
    name: z.string().trim().min(3, { message: 'Describe the task in a few words' }),
    description: z.string().trim().max(1000).optional(),
    projectId: z.string().min(1, { message: 'Choose a project' }),
    developerId: z.string().min(1, { message: 'Choose a developer' }),
    mentorId: z.string(),
    priority: z.enum(TASK_PRIORITIES),
    status: z.enum(TASK_STATUSES),
    createdDate: z.string().min(1, { message: 'Choose a start date' }),
    dueDate: z.string(),
  })
  .refine((values) => values.dueDate === '' || values.dueDate >= values.createdDate, {
    message: 'The due date cannot be before the start date',
    path: ['dueDate'],
  })

type TaskFormValues = z.infer<typeof taskFormSchema>

export function TasksPage() {
  const confirm = useConfirm()
  const snackbar = useSnackbar()

  const [editing, setEditing] = useState<AssignedTask | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [developerFilter, setDeveloperFilter] = useState('')
  const [search, setSearch] = useState('')

  const query = useMemo(
    () => (developerFilter === '' ? undefined : { developerIds: [developerFilter] }),
    [developerFilter],
  )

  const tasksQuery = useTasks(query)
  const commentsQuery = useComments()

  const commentCounts = useMemo(
    () => countCommentsByTask(commentsQuery.data ?? []),
    [commentsQuery.data],
  )

  const visible = useMemo(
    () =>
      (tasksQuery.data ?? []).filter((task) =>
        matchesSearch([task.name, task.description, task.developerName, task.projectName], search),
      ),
    [search, tasksQuery.data],
  )
  // `tasks_insert` RLS limits mentors to their own developers.
  const developersQuery = useActiveDevelopers()
  const projectsQuery = useActiveRosterProjects()
  const mentorsQuery = useRosterMentors()

  const createTask = useCreateTask()
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()

  const requestDelete = async (task: AssignedTask) => {
    const isDeleted = await confirm({
      title: 'Delete this task?',
      message: `“${task.name}” will be removed from the developer's task list. ${describeDeleteOutcome()}`,
      confirmLabel: 'Delete task',
      isDestructive: true,
      action: () => deleteTask.mutateAsync(task.id),
    })

    if (isDeleted) snackbar.success(`“${task.name}” was deleted.`)
  }

  const developerPicker = (
    <label className="admin-page__filter">
      <span>Developer</span>
      <Dropdown
        ariaLabel="Developer"
        onChange={setDeveloperFilter}
        options={[
          { value: '', label: 'All developers' },
          ...(developersQuery.data ?? []).map((developer) => ({
            value: developer.id,
            label: developer.name,
          })),
        ]}
        value={developerFilter}
      />
    </label>
  )

  return (
    <AdminPageLayout
      createLabel="Assign task"
      description="Work assigned to developers, with priority, status and due dates."
      onCreate={() => {
        setIsCreating(true)
      }}
      title="Tasks"
    >
      <Panel
        action={developerPicker}
        description="Overdue work is flagged."
        fills={visible.length > 0}
        title="All tasks"
      >
        {tasksQuery.error !== null ? (
          <ErrorState
            message={`Tasks could not be loaded: ${tasksQuery.error.message}`}
            onRetry={() => void tasksQuery.refetch()}
          />
        ) : tasksQuery.isPending ? (
          <Skeleton label="Loading tasks…" rows={5} />
        ) : (
          <>
            <TableSearch
              hint="Task, description, developer or project"
              matchCount={visible.length}
              noun="tasks"
              onChange={setSearch}
              totalCount={(tasksQuery.data ?? []).length}
              value={search}
            />

            <TaskTable
              commentCounts={commentCounts}
              emptyMessage={
                search.trim() === ''
                  ? 'No tasks match this filter.'
                  : `No task matches “${search}”.`
              }
              renderActions={(task) => (
                <div className="row-actions">
                  <Button
                    onClick={() => {
                      setEditing(task)
                    }}
                    size="small"
                    variant="ghost"
                  >
                    Edit
                  </Button>
                  <Button onClick={() => void requestDelete(task)} size="small" variant="danger">
                    Delete
                  </Button>
                </div>
              )}
              tasks={visible}
            />
          </>
        )}
      </Panel>

      <Modal isOpen={isCreating} onClose={() => setIsCreating(false)} title="Assign task">
        <TaskForm
          developers={developersQuery.data ?? []}
          mentors={mentorsQuery.data ?? []}
          onCancel={() => setIsCreating(false)}
          onSubmit={async (values) => {
            const isSaved = await createTask
              .mutateAsync(toRequest(values))
              .then(() => true)
              .catch(() => false)

            if (!isSaved) return

            setIsCreating(false)
            snackbar.success(`“${values.name}” was assigned.`)
          }}
          projects={projectsQuery.data ?? []}
        />
      </Modal>

      <Modal isOpen={editing !== null} onClose={() => setEditing(null)} title="Edit task">
        {editing === null ? null : (
          <TaskForm
            developers={developersQuery.data ?? []}
            mentors={mentorsQuery.data ?? []}
            onCancel={() => setEditing(null)}
            onSubmit={async (values) => {
              const isSaved = await updateTask
                .mutateAsync({ id: editing.id, changes: toRequest(values) })
                .then(() => true)
                .catch(() => false)

              if (!isSaved) return

              setEditing(null)
              snackbar.success(`“${values.name}” was saved.`)
            }}
            projects={projectsQuery.data ?? []}
            task={editing}
          />
        )}
      </Modal>
    </AdminPageLayout>
  )
}

function toRequest(values: TaskFormValues) {
  return {
    name: values.name,
    projectId: values.projectId,
    developerId: values.developerId,
    priority: values.priority,
    status: values.status,
    createdDate: values.createdDate,
    ...(values.description === undefined || values.description === ''
      ? {}
      : { description: values.description }),
    ...(values.mentorId === '' ? {} : { mentorId: values.mentorId }),
    ...(values.dueDate === '' ? {} : { dueDate: values.dueDate }),
  }
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
    defaultValues: {
      name: task?.name ?? '',
      description: task?.description ?? '',
      projectId: task?.projectId ?? '',
      developerId: task?.developerId ?? '',
      mentorId: task?.mentorId ?? '',
      priority: task?.priority ?? 'medium',
      status: task?.status ?? 'not-started',
      createdDate: task?.createdDate ?? todayIsoDate(),
      dueDate: task?.dueDate ?? '',
    },
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
      </div>

      <TextAreaField
        id="task-description"
        isWide
        label="Description"
        {...register('description')}
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
