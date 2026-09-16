export interface Mentor {
  id: string
  name: string
  email: string
  active: boolean

  /** profileId is set by provisioning only, never by client writes. */
  profileId?: string

  /** code is assigned by the database sequence, not generated client-side. */
  code?: string

  createdDate?: string

  /** deletedAt is set by the server on soft-delete; lists exclude these rows. */
  deletedAt?: string
}

/** Create types omit deletedAt and profileId. */
export type CreateMentorRequest = Omit<Mentor, 'deletedAt' | 'id' | 'profileId'>

export type UpdateMentorRequest = Partial<CreateMentorRequest>

export interface MentorAssignment {
  mentorId: string
  developerId: string

  id?: string

  assignedDate?: string

  active?: boolean
}
