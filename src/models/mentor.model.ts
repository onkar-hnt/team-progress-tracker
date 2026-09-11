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

  /**
   * The Supabase Auth account this mentor signs in with, if they have one.
   *
   * Read-only here. It is set by the provisioning Edge Function and never by
   * the client, which is what stops a browser attaching a mentor record to
   * somebody else's login. Absent means no login has been created yet, which
   * is a legitimate state for a mentor recorded before they start.
   */
  profileId?: string

  /**
   * The human-readable reference, `MEN001` and up.
   *
   * Display and export data, never a key — `id` is the only thing to match
   * on. Kept because it is what a person writes in a message or reads back
   * over a call, which a UUID cannot be used for.
   *
   * Optional because only a backend that issues codes populates it, and
   * generating one here is exactly what must not happen: two browsers
   * counting rows independently will both decide the next mentor is MEN004.
   * The database assigns it from a sequence, which cannot collide.
   */
  code?: string

  /** ISO date the record was added. */
  createdDate?: string
}

/** `profileId` is excluded: the link is the server's to make, not a caller's. */
export type CreateMentorRequest = Omit<Mentor, 'id' | 'profileId'>

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

  /**
   * Row key.
   *
   * Optional because the pair of ids already identifies the assignment; it
   * exists so a row can be addressed directly, and so a reassignment can be
   * recorded and ended rather than silently overwritten.
   */
  id?: string

  /** ISO date the developer was assigned to this mentor. */
  assignedDate?: string

  /**
   * Whether the assignment is current.
   *
   * Defaults to `true` when the column is blank. An inactive row keeps the
   * history without granting the mentor any visibility.
   */
  active?: boolean
}
