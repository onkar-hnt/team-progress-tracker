export interface MentorComment {
  id: string
  developerId: string
  mentorId: string

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
  'createdAt' | 'id' | 'updatedAt'
>

export type UpdateMentorCommentRequest = Partial<CreateMentorCommentRequest>

export interface MentorCommentQuery {
  developerIds?: readonly string[]
  mentorIds?: readonly string[]
  projectIds?: readonly string[]
  dateFrom?: string
  dateTo?: string

  /** Limit implies newest first by date, then id. */
  limit?: number
}
