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
 * The task is required because feedback that names no work is hard to act on
 * — "the error handling needs attention" against a project running for months
 * does not tell the developer reading it which piece of work is meant. The
 * model keeps `taskId` optional, because rows written before this existed
 * genuinely have none.
 *
 * There is no project field. A task carries its own project, so asking again
 * would let the two disagree; `toCreateCommentRequest` takes it from the
 * chosen task instead.
 */
export const feedbackFormSchema = z.object({
  developerId: z.string().min(1, { message: 'Choose a developer' }),
  taskId: z.string().min(1, { message: 'Choose the task this feedback is about' }),
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
 * from, and it is omitted when the task has no project to give.
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
    taskId: values.taskId,
    ...omitBlank('projectId', projectId),
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
