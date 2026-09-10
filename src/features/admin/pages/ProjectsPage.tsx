import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { Modal } from '@components/ui/modal/Modal'
import { Panel } from '@components/ui/panel/Panel'
import {
  useCreateProject,
  useDeleteProject,
  useDevelopers,
  useMentors,
  useProjects,
  useUpdateProject,
} from '@hooks/use-work-tracker'
import { PROJECT_STATUSES } from '@models/project.model'
import type { Project, ProjectStatus } from '@models/index'
import { formatShortDate } from '@utils/date.utils'

import { AdminPageLayout } from '../components/AdminPageLayout'

const PROJECT_STATUS_LABELS: Readonly<Record<ProjectStatus, string>> = {
  planned: 'Planned',
  active: 'Active',
  'on-hold': 'On hold',
  completed: 'Completed',
}

const projectFormSchema = z
  .object({
    name: z.string().trim().min(2, { message: 'Enter the project name' }),
    client: z.string().trim().min(1, { message: 'Enter the client' }),
    description: z.string().trim().max(500).optional(),
    status: z.enum(PROJECT_STATUSES),
    startDate: z.string(),
    endDate: z.string(),
    mentorId: z.string(),
    assignedDeveloperIds: z.array(z.string()),
    active: z.boolean(),
  })
  .refine(
    (values) =>
      values.startDate === '' || values.endDate === '' || values.startDate <= values.endDate,
    { message: 'The end date cannot be before the start date', path: ['endDate'] },
  )

type ProjectFormValues = z.infer<typeof projectFormSchema>

/**
 * Project records and who works on them.
 *
 * The assigned developers here are one of the things that decide which
 * projects a person sees elsewhere, alongside the tasks and work they have
 * actually logged.
 */
export function ProjectsPage() {
  const [editing, setEditing] = useState<Project | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const projectsQuery = useProjects()
  const developersQuery = useDevelopers()
  const mentorsQuery = useMentors()

  const createProject = useCreateProject()
  const updateProject = useUpdateProject()
  const deleteProject = useDeleteProject()

  const writeError = createProject.error ?? updateProject.error ?? deleteProject.error
  const developerName = (id: string) =>
    developersQuery.data?.find((developer) => developer.id === id)?.name ?? id

  return (
    <AdminPageLayout
      createLabel="Add project"
      description="Projects, their clients and the developers assigned to them."
      onCreate={() => setIsCreating(true)}
      title="Projects"
    >
      {writeError === null ? null : <p className="form__alert">{writeError.message}</p>}

      <Panel description="Assignments decide who sees each project." title="All projects">
        {projectsQuery.error !== null ? (
          <ErrorState
            message={`Projects could not be loaded: ${projectsQuery.error.message}`}
            onRetry={() => void projectsQuery.refetch()}
          />
        ) : projectsQuery.isPending ? (
          <Skeleton label="Loading projects…" rows={4} />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Project</th>
                  <th scope="col">Client</th>
                  <th scope="col">Status</th>
                  <th scope="col">Dates</th>
                  <th scope="col">Developers</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>

              <tbody>
                {(projectsQuery.data ?? []).map((project) => (
                  <tr key={project.id}>
                    <td>{project.name}</td>
                    <td>{project.client}</td>
                    <td>{PROJECT_STATUS_LABELS[project.status]}</td>
                    <td>
                      {project.startDate === undefined ? '—' : formatShortDate(project.startDate)}
                      {project.endDate === undefined ? '' : ` – ${formatShortDate(project.endDate)}`}
                    </td>
                    <td>
                      {project.assignedDeveloperIds.length === 0
                        ? 'None'
                        : project.assignedDeveloperIds.map(developerName).join(', ')}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="button button--ghost button--small"
                          onClick={() => setEditing(project)}
                          type="button"
                        >
                          Edit
                        </button>
                        <button
                          className="button button--danger button--small"
                          onClick={() => {
                            if (window.confirm(`Delete ${project.name}?`)) {
                              deleteProject.mutate(project.id)
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

      <Modal isOpen={isCreating} onClose={() => setIsCreating(false)} title="Add project">
        <ProjectForm
          developers={developersQuery.data ?? []}
          mentors={mentorsQuery.data ?? []}
          onCancel={() => setIsCreating(false)}
          onSubmit={async (values) => {
            await createProject.mutateAsync(toRequest(values))
            setIsCreating(false)
          }}
        />
      </Modal>

      <Modal isOpen={editing !== null} onClose={() => setEditing(null)} title="Edit project">
        {editing === null ? null : (
          <ProjectForm
            developers={developersQuery.data ?? []}
            mentors={mentorsQuery.data ?? []}
            onCancel={() => setEditing(null)}
            onSubmit={async (values) => {
              await updateProject.mutateAsync({ id: editing.id, changes: toRequest(values) })
              setEditing(null)
            }}
            project={editing}
          />
        )}
      </Modal>
    </AdminPageLayout>
  )
}

function toRequest(values: ProjectFormValues) {
  return {
    name: values.name,
    client: values.client,
    status: values.status,
    active: values.active,
    assignedDeveloperIds: values.assignedDeveloperIds,
    ...(values.description === undefined || values.description === ''
      ? {}
      : { description: values.description }),
    ...(values.startDate === '' ? {} : { startDate: values.startDate }),
    ...(values.endDate === '' ? {} : { endDate: values.endDate }),
    ...(values.mentorId === '' ? {} : { mentorId: values.mentorId }),
  }
}

function ProjectForm({
  developers,
  mentors,
  onCancel,
  onSubmit,
  project,
}: {
  developers: readonly { id: string; name: string }[]
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
    defaultValues: {
      name: project?.name ?? '',
      client: project?.client ?? '',
      description: project?.description ?? '',
      status: project?.status ?? 'planned',
      startDate: project?.startDate ?? '',
      endDate: project?.endDate ?? '',
      mentorId: project?.mentorId ?? '',
      assignedDeveloperIds: [...(project?.assignedDeveloperIds ?? [])],
      active: project?.active ?? true,
    },
  })

  // Held as an array field rather than individual checkbox inputs, so the
  // submitted value is the complete list in one piece. `useWatch` rather than
  // `watch` because the latter returns a function the React compiler cannot
  // memoise safely.
  const assigned = useWatch({ control, name: 'assignedDeveloperIds' })

  const toggleDeveloper = (id: string) => {
    setValue(
      'assignedDeveloperIds',
      assigned.includes(id) ? assigned.filter((value) => value !== id) : [...assigned, id],
      { shouldDirty: true },
    )
  }

  return (
    <form className="form" noValidate onSubmit={handleSubmit(onSubmit)}>
      <div className="form__grid">
        <div className="form__field">
          <label htmlFor="project-name">Project name</label>
          <input id="project-name" {...register('name')} aria-invalid={errors.name ? 'true' : undefined} />
          {errors.name ? <p className="form__error">{errors.name.message}</p> : null}
        </div>

        <div className="form__field">
          <label htmlFor="project-client">Client</label>
          <input id="project-client" {...register('client')} aria-invalid={errors.client ? 'true' : undefined} />
          {errors.client ? <p className="form__error">{errors.client.message}</p> : null}
        </div>

        <div className="form__field">
          <label htmlFor="project-status">Status</label>
          <select id="project-status" {...register('status')}>
            {PROJECT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {PROJECT_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>

        <div className="form__field">
          <label htmlFor="project-mentor">Mentor</label>
          <select id="project-mentor" {...register('mentorId')}>
            <option value="">Unassigned</option>
            {mentors.map((mentor) => (
              <option key={mentor.id} value={mentor.id}>
                {mentor.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form__field">
          <label htmlFor="project-start">Start date</label>
          <input id="project-start" type="date" {...register('startDate')} />
        </div>

        <div className="form__field">
          <label htmlFor="project-end">End date</label>
          <input
            id="project-end"
            type="date"
            {...register('endDate')}
            aria-invalid={errors.endDate ? 'true' : undefined}
          />
          {errors.endDate ? <p className="form__error">{errors.endDate.message}</p> : null}
        </div>
      </div>

      <div className="form__field form__field--wide">
        <label htmlFor="project-description">Description</label>
        <textarea id="project-description" {...register('description')} />
      </div>

      <div className="form__field">
        <span>Assigned developers</span>
        <div className="form__checklist">
          {developers.map((developer) => (
            <label className="form__checkbox" key={developer.id}>
              <input
                checked={assigned.includes(developer.id)}
                onChange={() => toggleDeveloper(developer.id)}
                type="checkbox"
              />
              {developer.name}
            </label>
          ))}
        </div>
      </div>

      <div className="form__field">
        <label className="form__checkbox" htmlFor="project-active">
          <input id="project-active" type="checkbox" {...register('active')} />
          Active
        </label>
        <p className="form__hint">Inactive projects stay in reports but are hidden from pickers.</p>
      </div>

      <div className="form__actions">
        <button className="button button--secondary" onClick={onCancel} type="button">
          Cancel
        </button>
        <button className="button button--primary" disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Saving…' : 'Save project'}
        </button>
      </div>
    </form>
  )
}
