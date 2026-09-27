import { useMemo, useState } from 'react'

import { useConfirm } from '@app/providers/confirm-context'
import { useSnackbar } from '@app/providers/snackbar-context'
import { Button } from '@components/ui/button/Button'
import { TableSearch } from '@components/ui/data-table/TableSearch'
import { Dropdown } from '@components/ui/dropdown/Dropdown'
import { ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { Panel } from '@components/ui/panel/Panel'
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
import type { AssignedTask } from '@models/index'
import { describeDeleteOutcome } from '@services/recycle-bin/recycle-bin.service'
import { richTextToPlainText } from '@utils/rich-text.utils'
import { matchesSearch } from '@utils/table.utils'
import { countCommentsByTask } from '@utils/task.utils'

import { AdminPageLayout } from '../components/AdminPageLayout'
import { TaskFormModal } from '../components/TaskFormModal'
import { toTaskRequest } from '../schemas/task.schema'

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
        matchesSearch(
          [
            task.name,
            // Searched for as it reads, not as it is stored.
            task.description === undefined ? undefined : richTextToPlainText(task.description),
            task.developerName,
            task.projectName,
          ],
          search,
        ),
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

      <TaskFormModal
        developers={developersQuery.data ?? []}
        isOpen={isCreating}
        mentors={mentorsQuery.data ?? []}
        onClose={() => setIsCreating(false)}
        onSubmit={async (values) => {
          const isSaved = await createTask
            .mutateAsync(toTaskRequest(values))
            .then(() => true)
            .catch(() => false)

          if (!isSaved) return

          setIsCreating(false)
          snackbar.success(`“${values.name}” was assigned.`)
        }}
        projects={projectsQuery.data ?? []}
        title="Assign task"
      />

      <TaskFormModal
        developers={developersQuery.data ?? []}
        isOpen={editing !== null}
        mentors={mentorsQuery.data ?? []}
        onClose={() => setEditing(null)}
        onSubmit={async (values) => {
          if (editing === null) return

          const isSaved = await updateTask
            .mutateAsync({ id: editing.id, changes: toTaskRequest(values) })
            .then(() => true)
            .catch(() => false)

          if (!isSaved) return

          setEditing(null)
          snackbar.success(`“${values.name}” was saved.`)
        }}
        projects={projectsQuery.data ?? []}
        task={editing ?? undefined}
        title="Edit task"
      />
    </AdminPageLayout>
  )
}
