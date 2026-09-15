import { useMemo, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { useAuth } from '@app/providers/auth-context'
import { useSnackbar } from '@app/providers/snackbar-context'
import { Button } from '@components/ui/button/Button'
import { Dropdown } from '@components/ui/dropdown/Dropdown'
import { Field, TextField } from '@components/ui/field/Field'
import type { DropdownOption } from '@components/ui/dropdown/Dropdown'
import { PROGRESS_OPTIONS, TASK_STATUS_OPTIONS } from '@constants/task.constants'
import type { DailyWorkEntry, TaskStatus } from '@models/index'
import { isAdmin } from '@services/auth/index'
import {
  useActiveDevelopers,
  useActiveProjects,
  useCreateDailyWorkEntry,
  useTasks,
  useUpdateDailyWorkEntry,
} from '@hooks/use-work-tracker'
import { todayIsoDate } from '@utils/date.utils'
import { describeTask, groupTasksByCompletion, progressForStatus } from '@utils/task.utils'

import {
  createEmptyFormValues,
  dailyUpdateFormSchema,
  toCreateDailyWorkEntryRequest,
  toFormValues,
} from '../schemas/daily-update.schema'
import type { DailyUpdateFormValues } from '../schemas/daily-update.schema'

import './DailyUpdateForm.scss'

interface DailyUpdateFormProps {
  date: string
  entry?: DailyWorkEntry
  onSaved?: () => void
}

export function DailyUpdateForm({ date, entry, onSaved }: DailyUpdateFormProps) {
  const { user } = useAuth()
  const snackbar = useSnackbar()
  const developersQuery = useActiveDevelopers()
  const projectsQuery = useActiveProjects()
  const createEntry = useCreateDailyWorkEntry()
  const updateEntry = useUpdateDailyWorkEntry()

  const isEditing = entry !== undefined

  const canChooseDeveloper = isAdmin(user) && !isEditing
  const ownDeveloperId = user?.developerId ?? ''

  const [selectedDeveloperId, setSelectedDeveloperId] = useState(
    entry?.developerId ?? ownDeveloperId,
  )

  // Empty developerIds skips the tasks query until a developer is chosen.
  const taskFilter = useMemo(
    () => ({ developerIds: selectedDeveloperId === '' ? [] : [selectedDeveloperId] }),
    [selectedDeveloperId],
  )
  const tasksQuery = useTasks(taskFilter)
  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data])
  const { completed, open } = useMemo(() => groupTasksByCompletion(tasks), [tasks])

  const showTaskPicker = tasks.length > 0 || tasksQuery.isPending

  const {
    control,
    formState: { errors, isSubmitting },
    getValues,
    handleSubmit,
    register,
    reset,
    setValue,
  } = useForm<DailyUpdateFormValues>({
    resolver: zodResolver(dailyUpdateFormSchema({ requireEstimate: !isEditing })),
    defaultValues:
      entry === undefined
        ? createEmptyFormValues({ date, developerId: ownDeveloperId })
        : toFormValues(entry),
  })

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

  const selectedTaskId = useWatch({ control, name: 'taskId' })
  const selectedTask = tasks.find((candidate) => candidate.id === selectedTaskId)

  const hasTask = selectedTaskId !== ''

  const onSubmit = handleSubmit(async (values) => {
    try {
      const request = toCreateDailyWorkEntryRequest(values)

      if (entry === undefined) {
        const created = await createEntry.mutateAsync(request)
        snackbar.success(`Saved “${created.taskTitle}”.`)

        reset(createEmptyFormValues({ date: values.date, developerId: values.developerId }))
        return
      }

      await updateEntry.mutateAsync({ id: entry.id, changes: request })
      snackbar.success('The daily update was saved.')
      onSaved?.()
    } catch {
      // Keep typed content on failure; mutations already surface errors.
    }
  })

  const isLoadingOptions = developersQuery.isPending || projectsQuery.isPending
  const optionsError = developersQuery.error ?? projectsQuery.error

  const lockedDeveloperId = entry?.developerId ?? ownDeveloperId
  const lockedDeveloperName =
    (entry === undefined
      ? user?.name
      : developersQuery.data?.find((developer) => developer.id === lockedDeveloperId)?.name) ??
    'Unknown'

  const showsDeveloper = canChooseDeveloper || lockedDeveloperId !== ownDeveloperId

  if (optionsError !== null) {
    return (
      <div className="form__alert" role="alert">
        <p>Developers and projects could not be loaded, so work cannot be logged right now.</p>
        <p className="daily-update-form__load-error-detail">{optionsError.message}</p>
      </div>
    )
  }

  return (
    <form className="daily-update-form" noValidate onSubmit={onSubmit}>
      <div className="daily-update-form__grid">
        <TextField
          error={errors.date?.message}
          id="update-date"
          label="Date"
          max={todayIsoDate()}
          type="date"
          {...register('date')}
        />

        {canChooseDeveloper ? null : <input type="hidden" {...register('developerId')} />}

        {!showsDeveloper ? null : (
          <Field
            error={errors.developerId?.message}
            htmlFor="update-developer"
            label="Developer"
          >
            {canChooseDeveloper ? (
              <Controller
                control={control}
                name="developerId"
                render={({ field }) => (
                  <Dropdown
                    disabled={isLoadingOptions}
                    id="update-developer"
                    isInvalid={errors.developerId !== undefined}
                    onBlur={field.onBlur}
                    onChange={(next) => {
                      field.onChange(next)
                      setSelectedDeveloperId(next)
                      setValue('taskId', '')
                      setValue('projectId', '')
                    }}
                    options={developerOptions}
                    value={field.value}
                  />
                )}
              />
            ) : (
              <p className="daily-update-form__static-value">{lockedDeveloperName}</p>
            )}
          </Field>
        )}

        <Field error={errors.projectId?.message} htmlFor="update-project" label="Project">
          {hasTask ? (
            <>
              <p className="daily-update-form__static-value">
                {selectedTask?.projectName ?? 'Chosen with the task'}
              </p>
              <input type="hidden" {...register('projectId')} />
            </>
          ) : (
            <Controller
              control={control}
              name="projectId"
              render={({ field }) => (
                <Dropdown
                  disabled={isLoadingOptions}
                  id="update-project"
                  isInvalid={errors.projectId !== undefined}
                  onBlur={field.onBlur}
                  onChange={field.onChange}
                  options={projectOptions}
                  value={field.value}
                />
              )}
            />
          )}
        </Field>

        <TextField
          autoComplete="off"
          error={errors.taskTitle?.message}
          id="update-task-title"
          isWide
          label="What did you work on?"
          placeholder="e.g. Connector configuration screen"
          type="text"
          {...register('taskTitle')}
        />

        {!showTaskPicker ? null : (
          <Field
            error={errors.taskId?.message}
            hint={
              hasTask
                ? 'This task and this update share one status, so finishing here marks it done on My Tasks too.'
                : 'Pick the task this day belongs to. Left as it is, the title above becomes a task your mentor can comment on.'
            }
            htmlFor="update-task"
            isWide
            label="Related task (optional)"
          >
            <Controller
              control={control}
              name="taskId"
              render={({ field }) => (
                <Dropdown
                  disabled={tasksQuery.isPending}
                  id="update-task"
                  isInvalid={errors.taskId !== undefined}
                  onBlur={field.onBlur}
                  onChange={(next) => {
                    field.onChange(next)

                    const picked = tasks.find((candidate) => candidate.id === next)

                    setValue('projectId', picked?.projectId ?? '')

                    if (picked !== undefined && getValues('taskTitle').trim() === '') {
                      setValue('taskTitle', picked.name)
                    }

                    // The task's own estimate, so the figure is revised rather
                    // than guessed again on every day of the same work.
                    if (picked?.estimatedHours !== undefined) {
                      setValue('estimatedHours', String(picked.estimatedHours))
                    }
                  }}
                  options={taskOptions}
                  value={field.value}
                />
              )}
            />
          </Field>
        )}

        <Field htmlFor="update-status" label="Status">
          <Controller
            control={control}
            name="status"
            render={({ field }) => (
              <Dropdown
                id="update-status"
                onBlur={field.onBlur}
                onChange={(next) => {
                  field.onChange(next)

                  const matching = progressForStatus(next as TaskStatus)
                  if (matching !== null) setValue('progress', String(matching))
                }}
                options={TASK_STATUS_OPTIONS}
                value={field.value}
              />
            )}
          />
        </Field>

        <Field error={errors.progress?.message} htmlFor="update-progress" label="Progress">
          <Controller
            control={control}
            name="progress"
            render={({ field }) => (
              <Dropdown
                id="update-progress"
                isInvalid={errors.progress !== undefined}
                onBlur={field.onBlur}
                onChange={field.onChange}
                options={PROGRESS_OPTIONS}
                value={field.value}
              />
            )}
          />
        </Field>

        <TextField
          error={errors.estimatedHours?.message}
          hint={
            selectedTask?.estimatedHours === undefined
              ? 'The whole task, not just today.'
              : `Currently ${String(selectedTask.estimatedHours)} h. Change it to revise the estimate.`
          }
          id="update-estimated-hours"
          inputMode="decimal"
          label="Estimated hours"
          min="0"
          step="0.25"
          type="number"
          {...register('estimatedHours')}
        />
      </div>

      {showTaskPicker || tasksQuery.error === null ? null : (
        <p className="form__hint">
          Your tasks could not be loaded ({tasksQuery.error.message}), so this update cannot be
          linked to one.
        </p>
      )}

      <div className="daily-update-form__actions">
        <Button isLoading={isSubmitting} type="submit" variant="primary">
          {isSubmitting ? 'Saving…' : isEditing ? 'Save changes' : 'Save update'}
        </Button>
        {isEditing ? null : (
          <p className="form__hint">Log one entry per task. You can add several for the same day.</p>
        )}
      </div>
    </form>
  )
}
