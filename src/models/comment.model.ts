/** The capacity somebody wrote in, which decides how the trail labels them. */
export type CommentAuthorRole = 'admin' | 'developer' | 'mentor'

export interface MentorComment {
  id: string
  developerId: string

  /** The mentor the entry is attributed to; absent on a developer's own reply. */
  mentorId?: string

  /** Stamped by the database from the session; never sent by the client. */
  authorProfileId?: string
  authorRole?: CommentAuthorRole

  taskId?: string

  /** Derived from taskId for filtering and display. */
  projectId?: string

  date: string

  comment: string
  progressUpdate?: string
  blockers?: string
  recommendations?: string

  createdAt: string
  updatedAt: string
}

export type CreateMentorCommentRequest = Omit<
  MentorComment,
  'authorProfileId' | 'authorRole' | 'createdAt' | 'id' | 'updatedAt'
>

export type UpdateMentorCommentRequest = Partial<CreateMentorCommentRequest>

export interface MentorCommentQuery {
  developerIds?: readonly string[]
  mentorIds?: readonly string[]
  projectIds?: readonly string[]
  taskIds?: readonly string[]
  dateFrom?: string
  dateTo?: string

  /** Limit implies newest first by date, then id. */
  limit?: number
}
