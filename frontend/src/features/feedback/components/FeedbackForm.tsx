import { useEffect, useMemo } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

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
  comment?: MentorComment
  developerId?: string
  onSubmit: (values: FeedbackFormValues, projectId: string | undefined) => Promise<void>
  onCancel?: () => void
}

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

  useEffect(() => {
    reset(comment === undefined ? emptyFeedbackValues(developerId) : toFeedbackValues(comment))
  }, [comment, developerId, reset])

  const selectedDeveloperId = useWatch({ control, name: 'developerId' })
  const selectedTaskId = useWatch({ control, name: 'taskId' })

  const taskFilter = useMemo(
    () => ({ developerIds: selectedDeveloperId === '' ? [] : [selectedDeveloperId] }),
    [selectedDeveloperId],
  )
  const tasksQuery = useTasks(taskFilter)

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
      return
    }

    if (comment === undefined) reset(emptyFeedbackValues(developerId))
  })

  const selectedTask = tasks.find((candidate) => candidate.id === selectedTaskId)

  const hasNoTasks =
    selectedDeveloperId !== '' &&
    !tasksQuery.isPending &&
    tasksQuery.error === null &&
    tasks.length === 0

  const taskLoadError =
    tasksQuery.error === null
      ? undefined
      : `Tasks could not be loaded: ${tasksQuery.error.message}`

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
