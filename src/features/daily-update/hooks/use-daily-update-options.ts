import { useMemo } from 'react'

import type { Developer, DropdownOption } from '@models/index'
import { useActiveDevelopers, useActiveProjects, useTasks } from '@hooks/use-work-tracker'
import type { AssignedTaskView } from '@services/work-tracker.views'
import { describeTask, groupTasksByCompletion } from '@utils/task.utils'

interface DailyUpdateOptions {
  developerOptions: DropdownOption[]
  /** The roster behind the options, for naming a developer the form cannot change. */
  developers: readonly Developer[]
  isLoadingOptions: boolean
  isLoadingTasks: boolean
  /** A failure here stops the form being usable at all, unlike a task failure. */
  optionsError: Error | null
  projectOptions: DropdownOption[]
  /** Hidden when the developer has no tasks, so the form does not offer an empty picker. */
  showTaskPicker: boolean
  taskOptions: DropdownOption[]
  tasks: readonly AssignedTaskView[]
  tasksError: Error | null
}

/**
 * The lists the daily-update form chooses from.
 *
 * Tasks belong to whoever the update is being logged for, which an admin can
 * change mid-form, so they are read per developer rather than once.
 */
export function useDailyUpdateOptions(selectedDeveloperId: string): DailyUpdateOptions {
  const developersQuery = useActiveDevelopers()
  const projectsQuery = useActiveProjects()

  // Empty developerIds skips the tasks query until a developer is chosen.
  const taskFilter = useMemo(
    () => ({ developerIds: selectedDeveloperId === '' ? [] : [selectedDeveloperId] }),
    [selectedDeveloperId],
  )
  const tasksQuery = useTasks(taskFilter)
  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data])
  const { completed, open } = useMemo(() => groupTasksByCompletion(tasks), [tasks])

  const developerOptions = useMemo<DropdownOption[]>(
    () => [
      { value: '', label: 'Select a developer' },
      ...(developersQuery.data ?? []).map((developer) => ({
        value: developer.id,
        label: developer.name,
      })),
    ],
    [developersQuery.data],
  )

  const projectOptions = useMemo<DropdownOption[]>(
    () => [
      { value: '', label: 'Select a project' },
      ...(projectsQuery.data ?? []).map((project) => ({
        value: project.id,
        label: project.client === undefined ? project.name : `${project.name} — ${project.client}`,
      })),
    ],
    [projectsQuery.data],
  )

  const taskOptions = useMemo<DropdownOption[]>(
    () => [
      {
        value: '',
        label: tasksQuery.isPending ? 'Loading your tasks…' : 'New task from the title above',
      },
      ...open.map((task) => ({ value: task.id, label: describeTask(task), group: 'Open' })),
      ...completed.map((task) => ({
        value: task.id,
        label: describeTask(task),
        group: 'Completed',
      })),
    ],
    [completed, open, tasksQuery.isPending],
  )

  return {
    developerOptions,
    developers: developersQuery.data ?? [],
    isLoadingOptions: developersQuery.isPending || projectsQuery.isPending,
    isLoadingTasks: tasksQuery.isPending,
    optionsError: developersQuery.error ?? projectsQuery.error,
    projectOptions,
    showTaskPicker: tasks.length > 0 || tasksQuery.isPending,
    taskOptions,
    tasks,
    tasksError: tasksQuery.error,
  }
}
