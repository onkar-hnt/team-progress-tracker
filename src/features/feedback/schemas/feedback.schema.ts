import { z } from 'zod'

import type { CreateMentorCommentRequest, MentorComment } from '@models/index'
import { todayIsoDate } from '@utils/date.utils'

/**
 * Validation for the mentor feedback form.
 *
 * The comment itself is the only required field. Progress, blockers and
 * recommendations are prompts rather than obligations: forcing all four would
 * produce padding, and an empty field is more honest than an invented one.
 */
export const feedbackFormSchema = z.object({
  developerId: z.string().min(1, { message: 'Choose a developer' }),
  projectId: z.string(),
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
    projectId: '',
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
    projectId: comment.projectId ?? '',
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
 * Blank optional fields are omitted rather than written as empty strings, so
 * the workbook keeps genuinely empty cells and a later read does not have to
 * distinguish "" from unset.
 */
export function toCreateCommentRequest(
  values: FeedbackFormValues,
  mentorId: string,
): CreateMentorCommentRequest {
  return {
    developerId: values.developerId,
    mentorId,
    ...omitBlank('projectId', values.projectId),
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
