import { z } from 'zod'

import type { CreateMentorCommentRequest, MentorComment } from '@models/index'
import { todayIsoDate } from '@utils/date.utils'

/**
 * Validation for the mentor feedback form.
 *
 * A developer, a task, a date and the comment itself are required. Progress,
 * blockers and recommendations are prompts rather than obligations: forcing
 * all of them would produce padding, and an empty field is more honest than
 * an invented one.
 *
 * The task is asked for and not insisted on. It was required for a while, on the
 * argument that feedback naming no work is hard to act on — "the error handling
 * needs attention" against a project running for months does not say which piece
 * of work is meant, and that argument is still right about *most* feedback.
 *
 * What it got wrong is that not all feedback is about a piece of work. "You have
 * been picking up the reviews nobody else wanted" is worth recording and belongs to
 * no task; so is a note after a conversation about how somebody's month has gone.
 * Requiring a task did not turn those into task feedback, it turned them into
 * feedback attached to whichever task happened to be open, which is worse than
 * having none — it puts the note on the wrong timeline. So the picker offers
 * "General" and the schema accepts it.
 *
 * There is no project field. A task carries its own project, so asking again
 * would let the two disagree; `toCreateCommentRequest` takes it from the
 * chosen task instead, and general feedback carries neither.
 */
export const feedbackFormSchema = z.object({
  developerId: z.string().min(1, { message: 'Choose a developer' }),
  taskId: z.string(),
  date: z.string().min(1, { message: 'Choose a date' }),
  comment: z
    .string()
    .trim()
    .min(3, { message: 'Write at least a sentence' })
    .max(2000, { message: 'Keep feedback under 2000 characters' }),
  progressUpdate: z.string().trim().max(1000).optional(),
  blockers: z.string().trim().max(1000).optional(),
  recommendations: z.string().trim().max(1000).optional(),
})

export type FeedbackFormValues = z.infer<typeof feedbackFormSchema>

export function emptyFeedbackValues(developerId = ''): FeedbackFormValues {
  return {
    developerId,
    taskId: '',
    date: todayIsoDate(),
    comment: '',
    progressUpdate: '',
    blockers: '',
    recommendations: '',
  }
}

export function toFeedbackValues(comment: MentorComment): FeedbackFormValues {
  return {
    developerId: comment.developerId,
    taskId: comment.taskId ?? '',
    date: comment.date,
    comment: comment.comment,
    progressUpdate: comment.progressUpdate ?? '',
    blockers: comment.blockers ?? '',
    recommendations: comment.recommendations ?? '',
  }
}

/**
 * Converts form values into a request.
 *
 * `projectId` is derived from the task rather than submitted, which is what
 * keeps the stored project and the stored task from contradicting each other.
 * It is passed in because only the caller has the task list to resolve it
 * from, and it is `undefined` when there is no task, or none with a project.
 *
 * Blank optional fields are omitted rather than written as empty strings, so
 * the record keeps genuinely empty values and a later read does not have to
 * distinguish "" from unset.
 */
export function toCreateCommentRequest(
  values: FeedbackFormValues,
  mentorId: string,
  projectId?: string,
): CreateMentorCommentRequest {
  return {
    developerId: values.developerId,
    mentorId,

    // Present as `undefined` rather than omitted, unlike the blank fields below.
    // The update mapper reads key presence: omitting this would leave an existing
    // task link in place, so changing a piece of feedback from a task to general
    // would silently not change it.
    taskId: values.taskId === '' ? undefined : values.taskId,

    // Whatever the task gave, which for general feedback is nothing. Sent the same
    // way and for the same reason: clearing the task has to clear the project with
    // it, or the note would keep a project it can no longer be traced to.
    projectId,
    date: values.date,
    comment: values.comment.trim(),
    ...omitBlank('progressUpdate', values.progressUpdate),
    ...omitBlank('blockers', values.blockers),
    ...omitBlank('recommendations', values.recommendations),
  }
}

function omitBlank<TKey extends string>(
  key: TKey,
  value: string | undefined,
): Partial<Record<TKey, string>> {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? {} : ({ [key]: trimmed } as Record<TKey, string>)
}
