import { useMemo, useState } from 'react'

import { useConfirm } from '@app/providers/confirm-context'
import { useAuth } from '@app/providers/auth-context'
import { useSnackbar } from '@app/providers/snackbar-context'
import { Button } from '@components/ui/button/Button'
import { SortableHeader } from '@components/ui/data-table/SortableHeader'
import { TableSearch } from '@components/ui/data-table/TableSearch'
import { ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { NameList } from '@components/ui/name-list/NameList'
import { Panel } from '@components/ui/panel/Panel'
import { PROJECT_STATUS_LABELS } from '@constants/project.constants'
import {
  useCreateProject,
  useDeleteProject,
  useRosterDevelopers,
  useRosterMentors,
  useRosterProjects,
  useUpdateProject,
} from '@hooks/use-work-tracker'
import { useTableSort } from '@hooks/use-table-sort'
import { PROJECT_STATUSES } from '@models/project.model'
import type { Project } from '@models/index'
import { describeDeleteOutcome } from '@services/recycle-bin/recycle-bin.service'
import { formatShortDate } from '@utils/date.utils'
import { richTextToPlainText } from '@utils/rich-text.utils'
import { compareText, matchesSearch, sortRows } from '@utils/table.utils'

import { AdminPageLayout } from '../components/AdminPageLayout'
import { ProjectFormModal } from '../components/ProjectFormModal'
import { toProjectRequest } from '../schemas/project.schema'

type SortKey = 'client' | 'developers' | 'name' | 'start' | 'status'

function compareProjects(left: Project, right: Project, key: SortKey): number {
  switch (key) {
    case 'name':
      return compareText(left.name, right.name)
    case 'client':
      return compareText(left.client, right.client)
    case 'status':
      // Sort by lifecycle order, not alphabetically.
      return PROJECT_STATUSES.indexOf(left.status) - PROJECT_STATUSES.indexOf(right.status)
    case 'start':
      return compareText(left.startDate, right.startDate)
    case 'developers':
      return left.assignedDeveloperIds.length - right.assignedDeveloperIds.length
  }
}

export function ProjectsPage() {
  const confirm = useConfirm()
  const snackbar = useSnackbar()
  const { user } = useAuth()
  const lockedMentorId = user?.role === 'mentor' ? user.mentorId : undefined

  const [editing, setEditing] = useState<Project | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [search, setSearch] = useState('')

  const { sort, toggle } = useTableSort<SortKey>({ key: 'name', direction: 'asc' }, [
    'developers',
    'start',
  ])

  const projectsQuery = useRosterProjects()
  const developersQuery = useRosterDevelopers()
  const mentorsQuery = useRosterMentors()

  const createProject = useCreateProject()
  const updateProject = useUpdateProject()
  const deleteProject = useDeleteProject()

  const requestDelete = async (project: Project) => {
    const isDeleted = await confirm({
      title: 'Delete this project?',
      message: `“${project.name}” will be removed from the roster, and stop being offered when work is logged. Its team and its history are kept. ${describeDeleteOutcome()}`,
      confirmLabel: 'Delete project',
      isDestructive: true,
      action: () => deleteProject.mutateAsync(project.id),
    })

    if (isDeleted) snackbar.success(`“${project.name}” was deleted.`)
  }

  const developerName = (id: string) =>
    developersQuery.data?.find((developer) => developer.id === id)?.name ?? id

  const mentorName = (id: string) =>
    mentorsQuery.data?.find((mentor) => mentor.id === id)?.name ?? id

  const visible = useMemo(() => {
    const rows = (projectsQuery.data ?? []).filter((project) =>
      matchesSearch(
        [
          project.name,
          project.client,
          // Searched for as it reads, not as it is stored.
          project.description === undefined
            ? undefined
            : richTextToPlainText(project.description),
        ],
        search,
      ),
    )

    return sortRows(rows, sort, compareProjects, (left, right) =>
      compareText(left.name, right.name),
    )
  }, [projectsQuery.data, search, sort])

  return (
    <AdminPageLayout
      createLabel="Add project"
      description="Projects, the mentors responsible for them, and the developers assigned to them."
      onCreate={() => {
        setIsCreating(true)
      }}
      title="Projects"
    >
      <Panel
        description="Assignments decide who sees each project."
        fills={visible.length > 0}
        title="All projects"
      >
        {projectsQuery.error !== null ? (
          <ErrorState
            message={`Projects could not be loaded: ${projectsQuery.error.message}`}
            onRetry={() => void projectsQuery.refetch()}
          />
        ) : projectsQuery.isPending ? (
          <Skeleton label="Loading projects…" rows={4} />
        ) : (
          <>
            <TableSearch
              hint="Project, client or description"
              matchCount={visible.length}
              noun="projects"
              onChange={setSearch}
              totalCount={(projectsQuery.data ?? []).length}
              value={search}
            />

            {visible.length === 0 ? (
              <p className="admin-page__note">
                No project matches “{search}”. Clear the search to see the whole list.
              </p>
            ) : (
              <div className="data-table__scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <SortableHeader
                        columnKey="name"
                        label="Project"
                        onSort={toggle}
                        sort={sort}
                      />
                      <SortableHeader
                        columnKey="client"
                        label="Client"
                        onSort={toggle}
                        sort={sort}
                      />
                      <SortableHeader
                        columnKey="status"
                        label="Status"
                        onSort={toggle}
                        sort={sort}
                      />
                      <SortableHeader columnKey="start" label="Dates" onSort={toggle} sort={sort} />
                      <th scope="col">Mentors</th>
                      <SortableHeader
                        columnKey="developers"
                        label="Developers"
                        onSort={toggle}
                        sort={sort}
                      />
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {visible.map((project) => (
                      <tr key={project.id}>
                        <td>{project.name}</td>
                        <td>{project.client}</td>
                        <td>{PROJECT_STATUS_LABELS[project.status]}</td>
                        <td>
                          {project.startDate === undefined
                            ? '—'
                            : formatShortDate(project.startDate)}
                          {project.endDate === undefined
                            ? ''
                            : ` – ${formatShortDate(project.endDate)}`}
                        </td>
                        <td>
                          <NameList
                            names={project.mentorIds.map(mentorName)}
                            title={`Mentors responsible for ${project.name}`}
                          />
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
                                setEditing(project)
                              }}
                              size="small"
                              variant="ghost"
                            >
                              Edit
                            </Button>
                            <Button
                              onClick={() => void requestDelete(project)}
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
          </>
        )}
      </Panel>

      <ProjectFormModal
        developers={developersQuery.data ?? []}
        isOpen={isCreating}
        lockedMentorId={lockedMentorId}
        mentors={mentorsQuery.data ?? []}
        onClose={() => setIsCreating(false)}
        onSubmit={async (values) => {
          const isSaved = await createProject
            .mutateAsync(toProjectRequest(values))
            .then(() => true)
            .catch(() => false)

          if (!isSaved) return

          setIsCreating(false)
          snackbar.success(`“${values.name}” was added.`)
        }}
        title="Add project"
      />

      <ProjectFormModal
        developers={developersQuery.data ?? []}
        isOpen={editing !== null}
        lockedMentorId={lockedMentorId}
        mentors={mentorsQuery.data ?? []}
        onClose={() => setEditing(null)}
        onSubmit={async (values) => {
          if (editing === null) return

          const isSaved = await updateProject
            .mutateAsync({ id: editing.id, changes: toProjectRequest(values) })
            .then(() => true)
            .catch(() => false)

          if (!isSaved) return

          setEditing(null)
          snackbar.success(`“${values.name}” was saved.`)
        }}
        project={editing ?? undefined}
        title="Edit project"
      />
    </AdminPageLayout>
  )
}

