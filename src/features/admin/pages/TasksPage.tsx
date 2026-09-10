import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { Modal } from '@components/ui/modal/Modal'
import { Panel } from '@components/ui/panel/Panel'
import { TASK_PRIORITY_OPTIONS, TASK_STATUS_OPTIONS } from '@constants/task.constants'
import { TaskTable } from '@features/tasks/components/TaskTable'
import {
  useActiveDevelopers,
  useActiveProjects,
  useCreateTask,
  useDeleteTask,
  useMentors,
  useTasks,
  useUpdateTask,
} from '@hooks/use-work-tracker'
import { TASK_PRIORITIES, TASK_STATUSES } from '@models/daily-work.model'
import type { AssignedTask } from '@models/index'
import { todayIsoDate } from '@utils/date.utils'

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

/**
 * Task assignment for administrators.
 *
 * Tasks created here are what developers see on their own task list, and what
 * mentors see for the people assigned to them.
 */
export function TasksPage() {
  const [editing, setEditing] = useState<AssignedTask | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [developerFilter, setDeveloperFilter] = useState('')

  const query = useMemo(
    () => (developerFilter === '' ? undefined : { developerIds: [developerFilter] }),
    [developerFilter],
  )

  const tasksQuery = useTasks(query)
  const developersQuery = useActiveDevelopers()
  const projectsQuery = useActiveProjects()
  const mentorsQuery = useMentors()

  const createTask = useCreateTask()
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()

  const writeError = createTask.error ?? updateTask.error ?? deleteTask.error

  const developerPicker = (
    <label className="admin-page__filter">
      <span>Developer</span>
      <select onChange={(event) => setDeveloperFilter(event.target.value)} value={developerFilter}>
        <option value="">All developers</option>
        {(developersQuery.data ?? []).map((developer) => (
          <option key={developer.id} value={developer.id}>
            {developer.name}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <AdminPageLayout
      createLabel="Assign task"
      description="Work assigned to developers, with priority, status and due dates."
      onCreate={() => setIsCreating(true)}
      title="Tasks"
    >
      {writeError === null ? null : <p className="form__alert">{writeError.message}</p>}

      <Panel action={developerPicker} description="Overdue work is flagged." title="All tasks">
        {tasksQuery.error !== null ? (
          <ErrorState
            message={`Tasks could not be loaded: ${tasksQuery.error.message}`}
            onRetry={() => void tasksQuery.refetch()}
          />
        ) : tasksQuery.isPending ? (
          <Skeleton label="Loading tasks…" rows={5} />
        ) : (
          <TaskTable
            emptyMessage="No tasks match this filter."
            renderActions={(task) => (
              <div className="row-actions">
                <button
                  className="button button--ghost button--small"
                  onClick={() => setEditing(task)}
                  type="button"
                >
                  Edit
                </button>
                <button
                  className="button button--danger button--small"
                  onClick={() => {
                    if (window.confirm(`Delete "${task.name}"?`)) deleteTask.mutate(task.id)
                  }}
                  type="button"
                >
                  Delete
                </button>
              </div>
            )}
            tasks={tasksQuery.data ?? []}
          />
        )}
      </Panel>

      <Modal isOpen={isCreating} onClose={() => setIsCreating(false)} title="Assign task">
        <TaskForm
          developers={developersQuery.data ?? []}
          mentors={mentorsQuery.data ?? []}
          onCancel={() => setIsCreating(false)}
          onSubmit={async (values) => {
            await createTask.mutateAsync(toRequest(values))
            setIsCreating(false)
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
              await updateTask.mutateAsync({ id: editing.id, changes: toRequest(values) })
              setEditing(null)
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
      <div className="form__field form__field--wide">
        <label htmlFor="task-name">Task</label>
        <input
          id="task-name"
          placeholder="Build the invoice export"
          {...register('name')}
          aria-invalid={errors.name ? 'true' : undefined}
        />
        {errors.name ? <p className="form__error">{errors.name.message}</p> : null}
      </div>

      <div className="form__grid">
        <div className="form__field">
          <label htmlFor="task-developer">Developer</label>
          <select
            id="task-developer"
            {...register('developerId')}
            aria-invalid={errors.developerId ? 'true' : undefined}
          >
            <option value="">Select a developer</option>
            {developers.map((developer) => (
              <option key={developer.id} value={developer.id}>
                {developer.name}
              </option>
            ))}
          </select>
          {errors.developerId ? <p className="form__error">{errors.developerId.message}</p> : null}
        </div>

        <div className="form__field">
          <label htmlFor="task-project">Project</label>
          <select
            id="task-project"
            {...register('projectId')}
            aria-invalid={errors.projectId ? 'true' : undefined}
          >
            <option value="">Select a project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          {errors.projectId ? <p className="form__error">{errors.projectId.message}</p> : null}
        </div>

        <div className="form__field">
          <label htmlFor="task-mentor">Mentor</label>
          <select id="task-mentor" {...register('mentorId')}>
            <option value="">Unassigned</option>
            {mentors.map((mentor) => (
              <option key={mentor.id} value={mentor.id}>
                {mentor.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form__field">
          <label htmlFor="task-priority">Priority</label>
          <select id="task-priority" {...register('priority')}>
            {TASK_PRIORITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form__field">
          <label htmlFor="task-status">Status</label>
          <select id="task-status" {...register('status')}>
            {TASK_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form__field">
          <label htmlFor="task-created">Start date</label>
          <input id="task-created" type="date" {...register('createdDate')} />
        </div>

        <div className="form__field">
          <label htmlFor="task-due">Due date</label>
          <input
            id="task-due"
            type="date"
            {...register('dueDate')}
            aria-invalid={errors.dueDate ? 'true' : undefined}
          />
          {errors.dueDate ? <p className="form__error">{errors.dueDate.message}</p> : null}
        </div>
      </div>

      <div className="form__field form__field--wide">
        <label htmlFor="task-description">Description</label>
        <textarea id="task-description" {...register('description')} />
      </div>

      <div className="form__actions">
        <button className="button button--secondary" onClick={onCancel} type="button">
          Cancel
        </button>
        <button className="button button--primary" disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Saving…' : 'Save task'}
        </button>
      </div>
    </form>
  )
}
