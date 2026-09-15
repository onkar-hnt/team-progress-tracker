import { z } from 'zod'

import type { CreateMentorCommentRequest, MentorComment } from '@models/index'
import { todayIsoDate } from '@utils/date.utils'

/** Shared with the task comment trail so both write the same column the same way. */
export const commentTextSchema = z
  .string()
  .trim()
  .min(3, { message: 'Write at least a sentence' })
  .max(2000, { message: 'Keep this under 2000 characters' })

export const COMMENT_MAX_LENGTH = 2000

// Task is optional so general feedback can be recorded without attaching to one.
export const feedbackFormSchema = z.object({
  developerId: z.string().min(1, { message: 'Choose a developer' }),
  taskId: z.string(),
  date: z.string().min(1, { message: 'Choose a date' }),
  comment: commentTextSchema,
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

export function toCreateCommentRequest(
  values: FeedbackFormValues,
  mentorId: string,
  projectId?: string,
): CreateMentorCommentRequest {
  return {
    developerId: values.developerId,
    mentorId,

    // Must be present (even as undefined) so clearing the task link on update works.
    taskId: values.taskId === '' ? undefined : values.taskId,

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
