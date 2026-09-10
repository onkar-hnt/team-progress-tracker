/**
 * Mentor feedback recorded against a developer.
 *
 * Comments are append-mostly history: each carries its own date so that a
 * developer's mentoring record can be read as a timeline. A comment is tied
 * to a project where the feedback is project-specific, and left unset for
 * general feedback.
 */
export interface MentorComment {
  id: string
  developerId: string
  mentorId: string
  projectId?: string

  /** Calendar day as `yyyy-MM-dd`. */
  date: string

  comment: string
  progressUpdate?: string
  blockers?: string
  recommendations?: string

  /** Full ISO 8601 timestamp. */
  createdAt: string
  /** Full ISO 8601 timestamp. */
  updatedAt: string
}

export type CreateMentorCommentRequest = Omit<
  MentorComment,
  'createdAt' | 'id' | 'updatedAt'
>

export type UpdateMentorCommentRequest = Partial<CreateMentorCommentRequest>

export interface MentorCommentQuery {
  developerIds?: readonly string[]
  mentorIds?: readonly string[]
  projectIds?: readonly string[]
  dateFrom?: string
  dateTo?: string
}
