/**
 * Mentor feedback recorded against a developer.
 *
 * Comments are append-mostly history: each carries its own date so that a
 * developer's mentoring record can be read as a timeline.
 */
export interface MentorComment {
  id: string
  developerId: string
  mentorId: string

  /**
   * The task the feedback is about.
   *
   * Optional on the model but required by the form, because the two answer
   * different questions. Feedback recorded before it became task-scoped has
   * no task, and no value could be invented for those rows; everything
   * written since names one.
   */
  taskId?: string

  /**
   * The project the feedback belongs to.
   *
   * Derived from `taskId` rather than chosen, so the two cannot contradict
   * each other. Kept as its own field because it is what `MentorCommentQuery`
   * filters on and what the timeline displays.
   */
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
