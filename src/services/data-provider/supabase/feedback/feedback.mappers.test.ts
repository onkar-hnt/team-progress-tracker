import { describe, expect, it } from 'vitest'

import type { CreateMentorCommentRequest } from '@models/index'
import {
  feedbackRowSchema,
  toFeedbackInsert,
  toFeedbackUpdate,
  toMentorComment,
} from './feedback.mappers'
import type { FeedbackRow } from './feedback.mappers'

function row(partial: Partial<FeedbackRow> = {}): FeedbackRow {
  return {
    id: 'feedback-1',
    developer_id: 'asha',
    mentor_id: null,
    author_profile_id: null,
    author_role: 'mentor',
    project_id: null,
    task_id: null,
    feedback_date: '2026-09-21',
    comment: 'Looks good.',
    progress_update: null,
    blockers: null,
    recommendations: null,
    created_at: '2026-09-21T09:00:00.000Z',
    updated_at: '2026-09-21T09:00:00.000Z',
    ...partial,
  }
}

function createRequest(
  partial: Partial<CreateMentorCommentRequest> = {},
): CreateMentorCommentRequest {
  return { developerId: 'asha', date: '2026-09-21', comment: 'Looks good.', ...partial }
}

describe('feedbackRowSchema', () => {
  it('accepts a row as the database returns it', () => {
    expect(feedbackRowSchema.safeParse(row()).success).toBe(true)
  })

  it('accepts each capacity somebody can write in', () => {
    expect(feedbackRowSchema.safeParse(row({ author_role: 'admin' })).success).toBe(true)
    expect(feedbackRowSchema.safeParse(row({ author_role: 'developer' })).success).toBe(true)
  })

  it('rejects a capacity the application does not know', () => {
    expect(feedbackRowSchema.safeParse(row({ author_role: 'observer' as never })).success).toBe(
      false,
    )
  })

  /** Feedback with nothing written in it is not feedback. */
  it('rejects an entry with an empty comment', () => {
    expect(feedbackRowSchema.safeParse(row({ comment: '' })).success).toBe(false)
  })
})

describe('toMentorComment', () => {
  it('reads the columns across to their model names', () => {
    const entry = toMentorComment(
      row({
        author_profile_id: 'profile-ravi',
        blockers: 'Waiting on access',
        mentor_id: 'ravi',
        progress_update: 'Halfway',
        project_id: 'atlas',
        recommendations: 'Pair on it',
        task_id: 'task-1',
      }),
    )

    expect(entry).toMatchObject({
      id: 'feedback-1',
      developerId: 'asha',
      mentorId: 'ravi',
      authorProfileId: 'profile-ravi',
      authorRole: 'mentor',
      projectId: 'atlas',
      taskId: 'task-1',
      date: '2026-09-21',
      comment: 'Looks good.',
      progressUpdate: 'Halfway',
      blockers: 'Waiting on access',
      recommendations: 'Pair on it',
    })
  })

  it('names the date column as a plain date on the model', () => {
    expect(toMentorComment(row()).date).toBe('2026-09-21')
  })

  it('leaves a field out entirely rather than carrying a null across', () => {
    const entry = toMentorComment(row())

    expect('mentorId' in entry).toBe(false)
    expect('taskId' in entry).toBe(false)
    expect('projectId' in entry).toBe(false)
    expect('blockers' in entry).toBe(false)
  })

  /** A developer replying on their own trail is attributed to nobody. */
  it('has no mentor on a reply the developer wrote themselves', () => {
    const entry = toMentorComment(row({ author_role: 'developer' }))

    expect(entry.authorRole).toBe('developer')
    expect('mentorId' in entry).toBe(false)
  })
})

describe('toFeedbackInsert', () => {
  it('writes the request out to its column names', () => {
    expect(toFeedbackInsert(createRequest({ mentorId: 'ravi', taskId: 'task-1' }))).toStrictEqual({
      developer_id: 'asha',
      mentor_id: 'ravi',
      project_id: null,
      task_id: 'task-1',
      feedback_date: '2026-09-21',
      comment: 'Looks good.',
      progress_update: null,
      blockers: null,
      recommendations: null,
    })
  })

  /**
   * Authorship is stamped by the database from the session, so sending it
   * would be both redundant and untrustworthy.
   */
  it('sends nothing about who is writing', () => {
    const insert = toFeedbackInsert(createRequest())

    expect('author_profile_id' in insert).toBe(false)
    expect('author_role' in insert).toBe(false)
  })

  it('trims the comment before storing it', () => {
    expect(toFeedbackInsert(createRequest({ comment: '  Looks good.  ' })).comment).toBe(
      'Looks good.',
    )
  })

  it('stores an untouched optional field as nothing recorded', () => {
    const insert = toFeedbackInsert(createRequest({ blockers: '   ', progressUpdate: '' }))

    expect(insert.blockers).toBeNull()
    expect(insert.progress_update).toBeNull()
  })
})

describe('toFeedbackUpdate', () => {
  it('writes nothing for an empty change', () => {
    expect(toFeedbackUpdate({})).toStrictEqual({})
  })

  it('trims an edited comment', () => {
    expect(toFeedbackUpdate({ comment: '  Revised.  ' })).toStrictEqual({ comment: 'Revised.' })
  })

  it('clears a nullable field the caller mentioned but left empty', () => {
    expect(toFeedbackUpdate({ blockers: '' })).toStrictEqual({ blockers: null })
    expect(toFeedbackUpdate({ taskId: undefined })).toStrictEqual({ task_id: null })
  })

  it('does not blank the comment when it is mentioned but left empty', () => {
    expect(toFeedbackUpdate({ comment: undefined })).toStrictEqual({})
  })

  it('moves the entry when a new date or developer is given', () => {
    expect(toFeedbackUpdate({ date: '2026-09-22', developerId: 'ravi' })).toStrictEqual({
      feedback_date: '2026-09-22',
      developer_id: 'ravi',
    })
  })
})
