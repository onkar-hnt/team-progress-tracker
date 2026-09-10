import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { useAuth } from '@app/providers/auth-context'
import {
  HOURS_SPENT_OPTIONS,
  PROGRESS_MAX,
  PROGRESS_MIN,
  PROGRESS_OPTIONS,
  TASK_PRIORITY_OPTIONS,
  TASK_STATUS_OPTIONS,
} from '@constants/task.constants'
import type { DailyWorkEntry, TaskStatus } from '@models/index'
import { DataProviderError } from '@services/data-provider/index'
import { isAdmin } from '@services/auth/index'
import {
  useActiveDevelopers,
  useActiveProjects,
  useCreateDailyWorkEntry,
  useUpdateDailyWorkEntry,
} from '@hooks/use-work-tracker'
import { todayIsoDate } from '@utils/date.utils'

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

  /** Omitted when the form is not driving a date-filtered list. */
  onDateChange?: (date: string) => void

  /** When supplied the form edits that entry instead of creating a new one. */
  entry?: DailyWorkEntry

  /** Called after a successful edit, so a modal can close itself. */
  onSaved?: () => void
}

/**
 * Progress that matches a status, used to keep the two fields consistent.
 *
 * Returning `null` for in-progress and blocked leaves whatever the developer
 * chose alone, since any value is legitimate there.
 */
function progressForStatus(status: TaskStatus): string | null {
  if (status === 'completed') return String(PROGRESS_MAX)
  if (status === 'not-started') return String(PROGRESS_MIN)
  return null
}

export function DailyUpdateForm({ date, entry, onDateChange, onSaved }: DailyUpdateFormProps) {
  const { user } = useAuth()
  const developersQuery = useActiveDevelopers()
  const projectsQuery = useActiveProjects()
  const createEntry = useCreateDailyWorkEntry()
  const updateEntry = useUpdateDailyWorkEntry()

  const isEditing = entry !== undefined
  const [savedTitle, setSavedTitle] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // An admin logs on someone's behalf and must choose; a developer is fixed
  // to their own id, which is what stops cross-developer edits. Editing never
  // offers the choice, because reassigning an existing entry to a different
  // developer would rewrite history rather than correct it.
  const canChooseDeveloper = isAdmin(user) && !isEditing
  const ownDeveloperId = user?.developerId ?? ''

  const {
    control,
    formState: { errors, isSubmitting },
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

  // `useWatch` subscribes to a single field, rather than re-rendering on every
  // keystroke anywhere in the form the way `watch()` does.
  const watchedDate = useWatch({ control, name: 'date' })
  const isBlocked = useWatch({ control, name: 'isBlocked' }) === 'yes'

  // The page lists existing entries for whichever date is in the form.
  useEffect(() => {
    if (watchedDate !== date) onDateChange?.(watchedDate)
  }, [date, onDateChange, watchedDate])

  const statusField = register('status')
  const blockedField = register('isBlocked')

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null)
    setSavedTitle(null)

    try {
      const request = toCreateDailyWorkEntryRequest(values)

      if (entry === undefined) {
        const created = await createEntry.mutateAsync(request)
        setSavedTitle(created.taskTitle)

        // Keep the date and developer so several tasks can be logged in a row.
        reset(createEmptyFormValues({ date: values.date, developerId: values.developerId }))
        return
      }

      await updateEntry.mutateAsync({ id: entry.id, changes: request })
      onSaved?.()
    } catch (error) {
      setSubmitError(
        error instanceof DataProviderError
          ? error.message
          : 'The update could not be saved. Please try again.',
      )
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

  if (optionsError !== null) {
    return (
      <div className="daily-update-form__load-error" role="alert">
        <p>Developers and projects could not be loaded, so work cannot be logged right now.</p>
        <p className="daily-update-form__load-error-detail">{optionsError.message}</p>
      </div>
    )
  }

  return (
    <form className="daily-update-form" noValidate onSubmit={onSubmit}>
      <div className="daily-update-form__grid">
        <div className="daily-update-form__field">
          <label htmlFor="update-date">Date</label>
          <input
            id="update-date"
            max={todayIsoDate()}
            type="date"
            {...register('date')}
            aria-invalid={errors.date ? 'true' : undefined}
          />
          {errors.date ? <p className="daily-update-form__error">{errors.date.message}</p> : null}
        </div>

        <div className="daily-update-form__field">
          <label htmlFor="update-developer">Developer</label>
          {canChooseDeveloper ? (
            <select
              disabled={isLoadingOptions}
              id="update-developer"
              {...register('developerId')}
              aria-invalid={errors.developerId ? 'true' : undefined}
            >
              <option value="">Select a developer</option>
              {(developersQuery.data ?? []).map((developer) => (
                <option key={developer.id} value={developer.id}>
                  {developer.name}
                </option>
              ))}
            </select>
          ) : (
            <>
              {/* Shown as static text and submitted via a hidden field, so the
                  value cannot be swapped using the browser's dev tools UI. */}
              <p className="daily-update-form__static-value">{lockedDeveloperName}</p>
              <input type="hidden" {...register('developerId')} />
            </>
          )}
          {errors.developerId ? (
            <p className="daily-update-form__error">{errors.developerId.message}</p>
          ) : null}
        </div>

        <div className="daily-update-form__field">
          <label htmlFor="update-project">Project</label>
          <select
            disabled={isLoadingOptions}
            id="update-project"
            {...register('projectId')}
            aria-invalid={errors.projectId ? 'true' : undefined}
          >
            <option value="">Select a project</option>
            {(projectsQuery.data ?? []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
                {project.client === undefined ? '' : ` — ${project.client}`}
              </option>
            ))}
          </select>
          {errors.projectId ? (
            <p className="daily-update-form__error">{errors.projectId.message}</p>
          ) : null}
        </div>
      </div>

      <div className="daily-update-form__field">
        <label htmlFor="update-task-title">What did you work on?</label>
        <input
          autoComplete="off"
          id="update-task-title"
          placeholder="e.g. Connector configuration screen"
          type="text"
          {...register('taskTitle')}
          aria-invalid={errors.taskTitle ? 'true' : undefined}
        />
        {errors.taskTitle ? (
          <p className="daily-update-form__error">{errors.taskTitle.message}</p>
        ) : null}
      </div>

      <div className="daily-update-form__field">
        <label htmlFor="update-description">Details (optional)</label>
        <textarea
          id="update-description"
          placeholder="Anything worth knowing about this task"
          rows={3}
          {...register('description')}
          aria-invalid={errors.description ? 'true' : undefined}
        />
        {errors.description ? (
          <p className="daily-update-form__error">{errors.description.message}</p>
        ) : null}
      </div>

      <div className="daily-update-form__field">
        <label htmlFor="update-work-done">What you got done today (optional)</label>
        <textarea
          id="update-work-done"
          placeholder="The progress you made, as opposed to the task itself"
          rows={2}
          {...register('workDone')}
          aria-invalid={errors.workDone ? 'true' : undefined}
        />
        {errors.workDone ? (
          <p className="daily-update-form__error">{errors.workDone.message}</p>
        ) : null}
      </div>

      <div className="daily-update-form__field">
        <label htmlFor="update-planned-work">What you plan to do next (optional)</label>
        <textarea
          id="update-planned-work"
          rows={2}
          {...register('plannedWork')}
          aria-invalid={errors.plannedWork ? 'true' : undefined}
        />
        {errors.plannedWork ? (
          <p className="daily-update-form__error">{errors.plannedWork.message}</p>
        ) : null}
      </div>

      <div className="daily-update-form__grid">
        <div className="daily-update-form__field">
          <label htmlFor="update-status">Status</label>
          <select
            id="update-status"
            {...statusField}
            onChange={(event) => {
              void statusField.onChange(event)

              // Keep progress in step with status so the developer is never
              // shown a validation error they did not cause.
              const matching = progressForStatus(event.target.value as TaskStatus)
              if (matching !== null) setValue('progress', matching)
            }}
          >
            {TASK_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="daily-update-form__field">
          <label htmlFor="update-priority">Priority</label>
          <select id="update-priority" {...register('priority')}>
            {TASK_PRIORITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="daily-update-form__field">
          <label htmlFor="update-progress">Progress</label>
          <select
            id="update-progress"
            {...register('progress')}
            aria-invalid={errors.progress ? 'true' : undefined}
          >
            {PROGRESS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {errors.progress ? (
            <p className="daily-update-form__error">{errors.progress.message}</p>
          ) : null}
        </div>

        <div className="daily-update-form__field">
          <label htmlFor="update-hours">Hours spent</label>
          <select
            id="update-hours"
            {...register('hoursSpent')}
            aria-invalid={errors.hoursSpent ? 'true' : undefined}
          >
            <option value="">Not recorded</option>
            {HOURS_SPENT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {errors.hoursSpent ? (
            <p className="daily-update-form__error">{errors.hoursSpent.message}</p>
          ) : null}
        </div>

        <div className="daily-update-form__field">
          <label htmlFor="update-blocked">Blocked?</label>
          <select
            id="update-blocked"
            {...blockedField}
            onChange={(event) => {
              void blockedField.onChange(event)

              // Clear a stale explanation when the answer goes back to No.
              if (event.target.value === 'no') setValue('blockerDescription', '')
            }}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </div>
      </div>

      {isBlocked ? (
        <div className="daily-update-form__field">
          <label htmlFor="update-blocker">What is blocking you?</label>
          <textarea
            id="update-blocker"
            placeholder="What you need, and who you have asked"
            rows={2}
            {...register('blockerDescription')}
            aria-invalid={errors.blockerDescription ? 'true' : undefined}
          />
          {errors.blockerDescription ? (
            <p className="daily-update-form__error">{errors.blockerDescription.message}</p>
          ) : null}
        </div>
      ) : null}

      <div className="daily-update-form__field">
        <label htmlFor="update-remarks">Remarks (optional)</label>
        <textarea id="update-remarks" rows={2} {...register('remarks')} />
        {errors.remarks ? (
          <p className="daily-update-form__error">{errors.remarks.message}</p>
        ) : null}
      </div>

      <div aria-live="polite" role="status">
        {savedTitle === null ? null : (
          <p className="daily-update-form__success">Saved “{savedTitle}”.</p>
        )}
        {submitError === null ? null : (
          <p className="daily-update-form__alert">{submitError}</p>
        )}
      </div>

      <div className="daily-update-form__actions">
        <button className="daily-update-form__submit" disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Saving…' : isEditing ? 'Save changes' : 'Save update'}
        </button>
        {isEditing ? null : (
          <p className="daily-update-form__hint">
            Log one entry per task. You can add several for the same day.
          </p>
        )}
      </div>
    </form>
  )
}
