/**
 * A mentor who reviews a set of developers.
 *
 * `id` mirrors the `MentorId` column in `tblMentors` and is the only valid
 * relational key; mentor names and email addresses are display data.
 *
 * A mentor is a separate record from their employee row, because a mentor may
 * exist in the workbook without logging work themselves. Where the same person
 * is both, the two rows are linked by email.
 */
export interface Mentor {
  id: string
  name: string
  email: string
  active: boolean
}

export type CreateMentorRequest = Omit<Mentor, 'id'>

export type UpdateMentorRequest = Partial<CreateMentorRequest>

/**
 * One mentor-to-developer assignment.
 *
 * Held as its own table rather than as a column on either side, so a mentor
 * can have many developers and the mapping can be edited without rewriting
 * employee or mentor rows.
 */
export interface MentorAssignment {
  mentorId: string
  developerId: string
}
