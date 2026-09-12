import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { Button } from '@components/ui/button/Button'
import { Dropdown } from '@components/ui/dropdown/Dropdown'
import {
  CheckboxField,
  ChecklistField,
  Field,
  TextAreaField,
  TextField,
} from '@components/ui/field/Field'
import { ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { Modal } from '@components/ui/modal/Modal'
import { NameList } from '@components/ui/name-list/NameList'
import { Panel } from '@components/ui/panel/Panel'
import {
  useCreateProject,
  useDeleteProject,
  useRosterDevelopers,
  useRosterMentors,
  useRosterProjects,
  useUpdateProject,
} from '@hooks/use-work-tracker'
import { writeState } from '@hooks/write-state'
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

const PROJECT_STATUS_OPTIONS = PROJECT_STATUSES.map((status) => ({
  value: status,
  label: PROJECT_STATUS_LABELS[status],
}))

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

  const projectsQuery = useRosterProjects()
  const developersQuery = useRosterDevelopers()
  const mentorsQuery = useRosterMentors()

  const createProject = useCreateProject()
  const updateProject = useUpdateProject()
  const deleteProject = useDeleteProject()

  const writes = writeState([createProject, updateProject, deleteProject])
  const developerName = (id: string) =>
    developersQuery.data?.find((developer) => developer.id === id)?.name ?? id

  return (
    <AdminPageLayout
      createLabel="Add project"
      description="Projects, their clients and the developers assigned to them."
      onCreate={() => {
        writes.clear()
        setIsCreating(true)
      }}
      title="Projects"
    >
      {writes.error === null ? null : <p className="form__alert">{writes.error.message}</p>}

      <Panel description="Assignments decide who sees each project." title="All projects">
        {projectsQuery.error !== null ? (
          <ErrorState
            message={`Projects could not be loaded: ${projectsQuery.error.message}`}
            onRetry={() => void projectsQuery.refetch()}
          />
        ) : projectsQuery.isPending ? (
          <Skeleton label="Loading projects…" rows={4} />
        ) : (
          <div className="data-table__scroll">
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
                      <NameList
                        names={project.assignedDeveloperIds.map(developerName)}
                        title={`Developers on ${project.name}`}
                      />
                    </td>
                    <td>
                      <div className="row-actions">
                        <Button
                          onClick={() => {
                            writes.clear()
                            setEditing(project)
                          }}
                          size="small"
                          variant="ghost"
                        >
                          Edit
                        </Button>
                        <Button
                          onClick={() => {
                            if (window.confirm(`Delete ${project.name}?`)) {
                              deleteProject.mutate(project.id)
                            }
                          }}
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

        <Field htmlFor="project-mentor" label="Mentor">
          <Controller
            control={control}
            name="mentorId"
            render={({ field }) => (
              <Dropdown
                id="project-mentor"
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

        <TextField id="project-start" label="Start date" type="date" {...register('startDate')} />

        <TextField
          error={errors.endDate?.message}
          id="project-end"
          label="End date"
          type="date"
          {...register('endDate')}
        />
      </div>

      <TextAreaField
        id="project-description"
        isWide
        label="Description"
        {...register('description')}
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
        <Button disabled={isSubmitting} type="submit" variant="primary">
          {isSubmitting ? 'Saving…' : 'Save project'}
        </Button>
      </div>
    </form>
  )
}
