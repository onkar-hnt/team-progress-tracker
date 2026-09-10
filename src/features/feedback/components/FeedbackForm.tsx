import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { useActiveDevelopers, useProjects } from '@hooks/use-work-tracker'
import type { MentorComment } from '@models/index'

import {
  emptyFeedbackValues,
  feedbackFormSchema,
  toFeedbackValues,
} from '../schemas/feedback.schema'
import type { FeedbackFormValues } from '../schemas/feedback.schema'

interface FeedbackFormProps {
  /** Provided when editing; omitted when recording new feedback. */
  comment?: MentorComment

  /** Preselects a developer when opened from their page. */
  developerId?: string

  onSubmit: (values: FeedbackFormValues) => Promise<void>
  onCancel?: () => void

  /** Surfaced from the mutation, so the message appears next to the button. */
  error?: string | null
}

/**
 * Records mentor feedback against a developer.
 *
 * The developer list comes from the same scoped hook the rest of the app uses,
 * so a mentor can only ever select somebody assigned to them — the restriction
 * is in the data, not in a check on this form.
 */
export function FeedbackForm({
  comment,
  developerId,
  error,
  onCancel,
  onSubmit,
}: FeedbackFormProps) {
  const developersQuery = useActiveDevelopers()
  const projectsQuery = useProjects()

  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
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

  const submit = handleSubmit(async (values) => {
    await onSubmit(values)
    if (comment === undefined) reset(emptyFeedbackValues(developerId))
  })

  return (
    <form className="form" noValidate onSubmit={submit}>
      <div className="form__grid">
        <div className="form__field">
          <label htmlFor="feedback-developer">Developer</label>
          <select
            disabled={developerId !== undefined || comment !== undefined}
            id="feedback-developer"
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
          {errors.developerId ? (
            <p className="form__error">{errors.developerId.message}</p>
          ) : null}
        </div>

        <div className="form__field">
          <label htmlFor="feedback-project">Project</label>
          <select id="feedback-project" {...register('projectId')}>
            <option value="">General feedback</option>
            {(projectsQuery.data ?? []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <p className="form__hint">Leave as general when the feedback is not project-specific.</p>
        </div>

        <div className="form__field">
          <label htmlFor="feedback-date">Date</label>
          <input id="feedback-date" type="date" {...register('date')} />
          {errors.date ? <p className="form__error">{errors.date.message}</p> : null}
        </div>
      </div>

      <div className="form__field form__field--wide">
        <label htmlFor="feedback-comment">Feedback</label>
        <textarea
          id="feedback-comment"
          placeholder="What went well, what needs attention"
          {...register('comment')}
          aria-invalid={errors.comment ? 'true' : undefined}
        />
        {errors.comment ? <p className="form__error">{errors.comment.message}</p> : null}
      </div>

      <div className="form__grid">
        <div className="form__field">
          <label htmlFor="feedback-progress">Progress update</label>
          <textarea id="feedback-progress" {...register('progressUpdate')} />
        </div>

        <div className="form__field">
          <label htmlFor="feedback-blockers">Blockers</label>
          <textarea id="feedback-blockers" {...register('blockers')} />
        </div>

        <div className="form__field">
          <label htmlFor="feedback-recommendations">Recommendations</label>
          <textarea id="feedback-recommendations" {...register('recommendations')} />
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
