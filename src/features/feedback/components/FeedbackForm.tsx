import { useEffect, useMemo } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { AttachmentPanel } from '@components/attachments/AttachmentPanel'
import { Button } from '@components/ui/button/Button'
import { Dropdown } from '@components/ui/dropdown/Dropdown'
import { Field, TextAreaField, TextField } from '@components/ui/field/Field'
import { useActiveDevelopers, useTasks } from '@hooks/use-work-tracker'
import type { MentorComment } from '@models/index'
import { describeTask, groupTasksByCompletion } from '@utils/task.utils'

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
}

/**
 * Records mentor feedback, about a task or about the person's work in general.
 *
 * Both lists come from the same scoped hooks the rest of the app uses, so a
 * mentor can only ever select somebody assigned to them and only that
 * person's work — the restriction is in the data, not in a check here.
 */
export function FeedbackForm({ comment, developerId, onCancel, onSubmit }: FeedbackFormProps) {
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
  const { completed, open } = useMemo(() => groupTasksByCompletion(tasks), [tasks])

  const isDeveloperLocked = developerId !== undefined || comment !== undefined

  const developerOptions = useMemo(
    () => [
      { value: '', label: 'Select a developer' },
      ...(developersQuery.data ?? []).map((developer) => ({
        value: developer.id,
        label: developer.name,
      })),
    ],
    [developersQuery.data],
  )

  // Grouped rather than flat, so finished work is still available without
  // crowding out what is live.
  //
  // The first option is the general one, and it is worded as a choice rather than as
  // an empty value: "Select a task" reads as a prompt somebody has not answered yet,
  // and would leave a mentor writing a note about the month wondering which task to
  // pretend it was about.
  const taskOptions = useMemo(
    () => [
      {
        value: '',
        label:
          selectedDeveloperId === ''
            ? 'Choose a developer first'
            : 'General — not about one task',
      },
      ...open.map((task) => ({ value: task.id, label: describeTask(task), group: 'Open' })),
      ...completed.map((task) => ({
        value: task.id,
        label: describeTask(task),
        group: 'Completed',
      })),
    ],
    [completed, open, selectedDeveloperId],
  )

  const submit = handleSubmit(async (values) => {
    const task = tasks.find((candidate) => candidate.id === values.taskId)

    try {
      await onSubmit(values, task?.projectId)
    } catch {
      // Emptied only once the save has landed. A failure leaves the paragraph
      // that was written in place to be tried again — clearing it would lose
      // the one thing here that cannot be reconstructed from the record.
      //
      // Caught rather than propagated so that react-hook-form, which re-throws
      // whatever its handler throws, does not put an unhandled rejection in the
      // console. The message has already been shown by the mutation.
      return
    }

    if (comment === undefined) reset(emptyFeedbackValues(developerId))
  })

  const selectedTask = tasks.find((candidate) => candidate.id === selectedTaskId)

  // A developer with no assigned work is no longer a dead end — general feedback can
  // still be recorded — but it is worth saying why the list is empty, so that an
  // empty dropdown is not read as one that failed to load.
  const hasNoTasks =
    selectedDeveloperId !== '' &&
    !tasksQuery.isPending &&
    tasksQuery.error === null &&
    tasks.length === 0

  const taskLoadError =
    tasksQuery.error === null
      ? undefined
      : `Tasks could not be loaded: ${tasksQuery.error.message}`

  // What sits under the task picker: why there is nothing to pick, what the
  // field is for, or — once a task is chosen — the project it already carries,
  // shown rather than asked because a second question could only disagree.
  const taskHint =
    taskLoadError !== undefined
      ? undefined
      : hasNoTasks
        ? 'This developer has no assigned tasks, so this can only be general feedback.'
        : selectedTask === undefined
          ? 'Name the work this is about, or leave it general.'
          : `Project: ${selectedTask.projectName}`

  return (
    <form className="feedback-form form" noValidate onSubmit={submit}>
      <div className="form__grid">
        <Field
          error={errors.developerId?.message}
          htmlFor="feedback-developer"
          label="Developer"
        >
          <Controller
            control={control}
            name="developerId"
            render={({ field }) => (
              <Dropdown
                disabled={isDeveloperLocked}
                id="feedback-developer"
                isInvalid={errors.developerId !== undefined}
                onBlur={field.onBlur}
                onChange={(next) => {
                  field.onChange(next)

                  // The task list is about to change, and a task belonging to
                  // the previous person would be refused by
                  // `feedback_guard_task`.
                  setValue('taskId', '')
                }}
                options={developerOptions}
                value={field.value}
              />
            )}
          />
        </Field>

        <TextField
          error={errors.date?.message}
          id="feedback-date"
          label="Date"
          type="date"
          {...register('date')}
        />
      </div>

      <Field
        error={errors.taskId?.message ?? taskLoadError}
        hint={taskHint}
        htmlFor="feedback-task"
        isWide
        label="Task"
      >
        <Controller
          control={control}
          name="taskId"
          render={({ field }) => (
            <Dropdown
              // Disabled only while there is nothing to answer with. An empty task
              // list is now an answer — general — rather than a reason to lock the
              // field.
              disabled={selectedDeveloperId === '' || tasksQuery.isPending}
              id="feedback-task"
              isInvalid={errors.taskId !== undefined}
              onBlur={field.onBlur}
              onChange={field.onChange}
              options={taskOptions}
              value={field.value}
            />
          )}
        />
      </Field>

      <TextAreaField
        error={errors.comment?.message}
        id="feedback-comment"
        isWide
        label="Feedback"
        placeholder="What went well, what needs attention"
        rows={4}
        {...register('comment')}
      />

      <div className="feedback-form__optional">
        <p className="feedback-form__optional-label">Optional detail</p>

        <div className="form__grid">
          <TextAreaField
            id="feedback-progress"
            label="Progress update"
            rows={3}
            {...register('progressUpdate')}
          />

          <TextAreaField
            id="feedback-blockers"
            label="Blockers"
            rows={3}
            {...register('blockers')}
          />

          <TextAreaField
            id="feedback-recommendations"
            label="Recommendations"
            rows={3}
            {...register('recommendations')}
          />
        </div>
      </div>

      {/* Editing only, for the same reason as the daily update: a file needs a record
          to hang from. Feedback with a document attached is usually a review rather
          than a remark, and a review is written and then revisited. */}
      {comment === undefined ? null : (
        <AttachmentPanel
          hint="A review document, or the work being commented on."
          owner="feedback"
          recordId={comment.id}
        />
      )}

      <div className="form__actions">
        {onCancel === undefined ? null : (
          <Button onClick={onCancel} variant="secondary">
            Cancel
          </Button>
        )}
        <Button isLoading={isSubmitting} type="submit" variant="primary">
          {isSubmitting ? 'Saving…' : comment === undefined ? 'Save feedback' : 'Update feedback'}
        </Button>
      </div>
    </form>
  )
}
