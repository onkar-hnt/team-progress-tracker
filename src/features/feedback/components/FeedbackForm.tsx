import { useEffect, useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { useActiveDevelopers, useTasks } from '@hooks/use-work-tracker'
import type { MentorComment } from '@models/index'
import type { AssignedTaskView } from '@services/work-tracker.service'
import { compareStatus } from '@utils/task.utils'

import {
  emptyFeedbackValues,
  feedbackFormSchema,
  toFeedbackValues,
} from '../schemas/feedback.schema'
import type { FeedbackFormValues } from '../schemas/feedback.schema'

import './FeedbackForm.scss'

interface FeedbackFormProps {
  /** Provided when editing; omitted when recording new feedback. */
  comment?: MentorComment

  /** Preselects a developer when opened from their page. */
  developerId?: string

  /**
   * `projectId` is resolved from the chosen task rather than submitted, so
   * the stored project can never contradict the stored task.
   */
  onSubmit: (values: FeedbackFormValues, projectId: string | undefined) => Promise<void>

  onCancel?: () => void

  /** Surfaced from the mutation, so the message appears next to the button. */
  error?: string | null
}

/**
 * Records mentor feedback against one of a developer's tasks.
 *
 * Both lists come from the same scoped hooks the rest of the app uses, so a
 * mentor can only ever select somebody assigned to them and only that
 * person's work — the restriction is in the data, not in a check here.
 */
export function FeedbackForm({
  comment,
  developerId,
  error,
  onCancel,
  onSubmit,
}: FeedbackFormProps) {
  const developersQuery = useActiveDevelopers()

  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setValue,
  } = useForm<FeedbackFormValues>({
    resolver: zodResolver(feedbackFormSchema),
    defaultValues:
      comment === undefined ? emptyFeedbackValues(developerId) : toFeedbackValues(comment),
  })

  // Reset when the form is reused for a different record, since react-hook-form
  // keeps its first default values otherwise.
  useEffect(() => {
    reset(comment === undefined ? emptyFeedbackValues(developerId) : toFeedbackValues(comment))
  }, [comment, developerId, reset])

  const selectedDeveloperId = useWatch({ control, name: 'developerId' })
  const selectedTaskId = useWatch({ control, name: 'taskId' })

  // An empty list is the honest query for "no developer chosen yet": the
  // repository answers it without a request, so the task picker stays empty
  // instead of briefly offering the whole team's work.
  const taskFilter = useMemo(
    () => ({ developerIds: selectedDeveloperId === '' ? [] : [selectedDeveloperId] }),
    [selectedDeveloperId],
  )
  const tasksQuery = useTasks(taskFilter)

  // Held steady across renders so the grouping below is memoised against
  // something that only changes when the data does.
  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data])
  const { completed, open } = useMemo(() => groupTasks(tasks), [tasks])

  const developerField = register('developerId')
  const isDeveloperLocked = developerId !== undefined || comment !== undefined

  const submit = handleSubmit(async (values) => {
    const task = tasks.find((candidate) => candidate.id === values.taskId)

    await onSubmit(values, task?.projectId)
    if (comment === undefined) reset(emptyFeedbackValues(developerId))
  })

  const selectedTask = tasks.find((candidate) => candidate.id === selectedTaskId)

  // Feedback needs a task, so a developer with none is a dead end worth
  // naming rather than an empty dropdown to puzzle over.
  const hasNoTasks =
    selectedDeveloperId !== '' &&
    !tasksQuery.isPending &&
    tasksQuery.error === null &&
    tasks.length === 0

  return (
    <form className="feedback-form form" noValidate onSubmit={submit}>
      <div className="form__grid">
        <div className="form__field">
          <label htmlFor="feedback-developer">Developer</label>
          <select
            disabled={isDeveloperLocked}
            id="feedback-developer"
            {...developerField}
            onChange={(event) => {
              void developerField.onChange(event)

              // The task list is about to change, and a task belonging to the
              // previous person would be refused by `feedback_guard_task`.
              setValue('taskId', '')
            }}
            aria-invalid={errors.developerId ? 'true' : undefined}
          >
            <option value="">Select a developer</option>
            {(developersQuery.data ?? []).map((developer) => (
              <option key={developer.id} value={developer.id}>
                {developer.name}
              </option>
            ))}
          </select>
          {errors.developerId ? (
            <p className="form__error">{errors.developerId.message}</p>
          ) : null}
        </div>

        <div className="form__field">
          <label htmlFor="feedback-date">Date</label>
          <input id="feedback-date" type="date" {...register('date')} />
          {errors.date ? <p className="form__error">{errors.date.message}</p> : null}
        </div>
      </div>

      <div className="form__field form__field--wide">
        <label htmlFor="feedback-task">Task</label>
        <select
          disabled={selectedDeveloperId === '' || tasksQuery.isPending || tasks.length === 0}
          id="feedback-task"
          {...register('taskId')}
          aria-invalid={errors.taskId ? 'true' : undefined}
        >
          <option value="">
            {selectedDeveloperId === '' ? 'Choose a developer first' : 'Select a task'}
          </option>

          {/* Grouped rather than flat, so finished work is still available
              without crowding out what is live. */}
          {open.length === 0 ? null : (
            <optgroup label="Open">
              {open.map((task) => (
                <option key={task.id} value={task.id}>
                  {describeTask(task)}
                </option>
              ))}
            </optgroup>
          )}

          {completed.length === 0 ? null : (
            <optgroup label="Completed">
              {completed.map((task) => (
                <option key={task.id} value={task.id}>
                  {describeTask(task)}
                </option>
              ))}
            </optgroup>
          )}
        </select>

        {errors.taskId ? <p className="form__error">{errors.taskId.message}</p> : null}

        {tasksQuery.error !== null ? (
          <p className="form__error">{`Tasks could not be loaded: ${tasksQuery.error.message}`}</p>
        ) : hasNoTasks ? (
          <p className="form__hint">
            This developer has no assigned tasks yet, so there is nothing to record feedback
            against. Assign work first.
          </p>
        ) : selectedTask === undefined ? (
          <p className="form__hint">Feedback is recorded against the work it is about.</p>
        ) : (
          // The project is shown rather than asked: the task already carries
          // one, and a second question could only disagree with it.
          <p className="form__hint">{`Project: ${selectedTask.projectName}`}</p>
        )}
      </div>

      <div className="form__field form__field--wide">
        <label htmlFor="feedback-comment">Feedback</label>
        <textarea
          id="feedback-comment"
          placeholder="What went well, what needs attention"
          rows={4}
          {...register('comment')}
          aria-invalid={errors.comment ? 'true' : undefined}
        />
        {errors.comment ? <p className="form__error">{errors.comment.message}</p> : null}
      </div>

      <div className="feedback-form__optional">
        <p className="feedback-form__optional-label">Optional detail</p>

        <div className="form__grid">
          <div className="form__field">
            <label htmlFor="feedback-progress">Progress update</label>
            <textarea id="feedback-progress" rows={3} {...register('progressUpdate')} />
          </div>

          <div className="form__field">
            <label htmlFor="feedback-blockers">Blockers</label>
            <textarea id="feedback-blockers" rows={3} {...register('blockers')} />
          </div>

          <div className="form__field">
            <label htmlFor="feedback-recommendations">Recommendations</label>
            <textarea id="feedback-recommendations" rows={3} {...register('recommendations')} />
          </div>
        </div>
      </div>

      {error === null || error === undefined ? null : <p className="form__alert">{error}</p>}

      <div className="form__actions">
        {onCancel === undefined ? null : (
          <button className="button button--secondary" onClick={onCancel} type="button">
            Cancel
          </button>
        )}
        <button className="button button--primary" disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Saving…' : comment === undefined ? 'Save feedback' : 'Update feedback'}
        </button>
      </div>
    </form>
  )
}

/** Name, project and status, so one option identifies the work unambiguously. */
function describeTask(task: AssignedTaskView): string {
  return `${task.name} · ${task.projectName}${task.isOverdue ? ' · overdue' : ''}`
}

/**
 * Splits the developer's tasks into live work and finished work.
 *
 * Within each group the existing `compareStatus` ordering applies, which walks
 * a task from untouched to finished, and the name breaks ties so the list is
 * stable between renders.
 */
function groupTasks(tasks: readonly AssignedTaskView[]): {
  completed: AssignedTaskView[]
  open: AssignedTaskView[]
} {
  const sorted = [...tasks].sort((left, right) => {
    const byStatus = compareStatus(left.status, right.status)
    return byStatus !== 0 ? byStatus : left.name.localeCompare(right.name)
  })

  return {
    completed: sorted.filter((task) => task.status === 'completed'),
    open: sorted.filter((task) => task.status !== 'completed'),
  }
}
