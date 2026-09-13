import { useMemo, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { useAuth } from '@app/providers/auth-context'
import { useSnackbar } from '@app/providers/snackbar-context'
import { AttachmentPanel } from '@components/attachments/AttachmentPanel'
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
  /** The day the form opens on. The field itself stays editable. */
  date: string

  /** When supplied the form edits that entry instead of creating a new one. */
  entry?: DailyWorkEntry

  /** Called after a successful edit, so a modal can close itself. */
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

  // An admin logs on someone's behalf and must choose; a developer is fixed
  // to their own id, which is what stops cross-developer edits. Editing never
  // offers the choice, because reassigning an existing entry to a different
  // developer would rewrite history rather than correct it.
  const canChooseDeveloper = isAdmin(user) && !isEditing
  const ownDeveloperId = user?.developerId ?? ''

  // Tracked outside the form because the task list is filtered by it, and an
  // admin logging on someone else's behalf changes it mid-form.
  const [selectedDeveloperId, setSelectedDeveloperId] = useState(
    entry?.developerId ?? ownDeveloperId,
  )

  // An empty list is the honest query for "nobody chosen yet": the repository
  // answers it without a request rather than briefly offering the whole
  // team's work to an admin who has not picked a developer.
  const taskFilter = useMemo(
    () => ({ developerIds: selectedDeveloperId === '' ? [] : [selectedDeveloperId] }),
    [selectedDeveloperId],
  )
  const tasksQuery = useTasks(taskFilter)
  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data])
  const { completed, open } = useMemo(() => groupTasksByCompletion(tasks), [tasks])

  // The picker is an addition to the description, not a replacement for it, so
  // it is simply absent when there is nothing to choose. Shown while the list
  // is still loading because most developers have work assigned, and appearing
  // a moment late would shift the fields under whoever is already typing.
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
    resolver: zodResolver(dailyUpdateFormSchema),
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

  // Grouped the way the native `<optgroup>` was, so open work is offered ahead
  // of work already finished.
  const taskOptions = useMemo<DropdownOption[]>(
    () => [
      { value: '', label: tasksQuery.isPending ? 'Loading your tasks…' : 'Not linked to a task' },
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

  // A chosen task settles the project, so the project is shown rather than
  // asked. The description is not derived the same way: it is the developer's
  // own account of the day, and a task name is not that.
  const hasTask = selectedTaskId !== ''

  const onSubmit = handleSubmit(async (values) => {
    try {
      const request = toCreateDailyWorkEntryRequest(values)

      if (entry === undefined) {
        const created = await createEntry.mutateAsync(request)
        snackbar.success(`Saved “${created.taskTitle}”.`)

        // Keep the date and developer so several tasks can be logged in a row.
        reset(createEmptyFormValues({ date: values.date, developerId: values.developerId }))
        return
      }

      await updateEntry.mutateAsync({ id: entry.id, changes: request })
      snackbar.success('The daily update was saved.')
      onSaved?.()
    } catch {
      // Already reported: both mutations announce their own failures. Caught so
      // that the form keeps what was typed — the reader has a paragraph of work
      // in it — and so react-hook-form does not re-throw into the console.
    }
  })

  const isLoadingOptions = developersQuery.isPending || projectsQuery.isPending
  const optionsError = developersQuery.error ?? projectsQuery.error

  // When the field is locked, name whoever the entry belongs to rather than
  // whoever happens to be signed in.
  const lockedDeveloperId = entry?.developerId ?? ownDeveloperId
  const lockedDeveloperName =
    (entry === undefined
      ? user?.name
      : developersQuery.data?.find((developer) => developer.id === lockedDeveloperId)?.name) ??
    'Unknown'

  // Telling somebody their own name is not information, and a field that can
  // only ever say one thing is one more thing to read past on the way to the
  // question that matters. So it is shown when it identifies somebody else —
  // an admin logging or correcting work on a developer's behalf — and left out
  // when it would only repeat who is signed in. The value is submitted either
  // way; what changes is whether it is on screen.
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

        {/* Rendered whether or not the field below it is, so the value is still
            submitted when the question is never asked. A hidden input takes no
            column in the grid. */}
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

                      // The task list is about to change, and a task belonging
                      // to the previous person is refused by the database
                      // guard. The description is left alone: it is what the
                      // admin came to log, and correcting who it belongs to
                      // should not retype it.
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
              {/* Shown rather than asked: the task already carries a project,
                  and a second question could only disagree with it. */}
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
                : 'Link a task and the two share one status. Leave it unlinked for work no task covers.'
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

                    // The task carries a project, and a second answer could
                    // only disagree with it. Cleared along with the task so the
                    // field comes back rather than keeping a value nobody
                    // chose.
                    setValue('projectId', picked?.projectId ?? '')

                    // Offered as a starting point, never as a correction:
                    // somebody who has already described their day keeps what
                    // they wrote.
                    if (picked !== undefined && getValues('taskTitle').trim() === '') {
                      setValue('taskTitle', picked.name)
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

                  // Keep progress in step with status so the developer is
                  // never shown a validation error they did not cause.
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
      </div>

      {/* Outside the grid: it explains why a field is missing, so it belongs
          under the fields rather than in a column of its own. */}
      {showTaskPicker || tasksQuery.error === null ? null : (
        <p className="form__hint">
          Your tasks could not be loaded ({tasksQuery.error.message}), so this update cannot be
          linked to one.
        </p>
      )}

      {/* Offered only when editing, because a file needs a record to hang from and a
          new entry has no id yet. That is also the shape of the day: the update is
          written, and the screenshot of the failing build is added to it after. */}
      {isEditing ? (
        <AttachmentPanel
          hint="A screenshot, a log, or whatever shows what happened."
          owner="daily_updates"
          recordId={entry?.id ?? null}
        />
      ) : null}

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
