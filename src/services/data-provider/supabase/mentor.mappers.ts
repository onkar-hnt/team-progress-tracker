import { z } from 'zod'

import type {
  CreateMentorRequest,
  Mentor,
  MentorAssignment,
  UpdateMentorRequest,
} from '@models/index'

export const MENTOR_COLUMNS =
  'id, code, name, email, active, created_date, profile_id, deleted_at' as const

export const mentorRowSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  email: z.string().min(1),
  active: z.boolean(),
  created_date: z.string().nullable(),
  profile_id: z.string().nullable(),

  deleted_at: z.string().nullable(),
})

export type MentorRow = z.infer<typeof mentorRowSchema>

export function toMentor(row: MentorRow): Mentor {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    email: row.email,
    active: row.active,
    ...(row.created_date === null ? {} : { createdDate: row.created_date }),
    ...(row.profile_id === null ? {} : { profileId: row.profile_id }),
    ...(row.deleted_at === null ? {} : { deletedAt: row.deleted_at }),
  }
}

/** What may be sent when creating a mentor. */
export interface MentorInsert {
  name: string
  email: string
  active: boolean
  created_date: string | null
}

export function toMentorInsert(request: CreateMentorRequest): MentorInsert {
  return {
    name: request.name.trim(),
    email: request.email.trim(),
    active: request.active,
    created_date: request.createdDate ?? null,
  }
}

export function toMentorUpdate(request: UpdateMentorRequest): Partial<MentorInsert> {
  const payload: Partial<MentorInsert> = {}

  if (request.name !== undefined) payload.name = request.name.trim()
  if (request.email !== undefined) payload.email = request.email.trim()
  if (request.active !== undefined) payload.active = request.active
  if (request.createdDate !== undefined) payload.created_date = request.createdDate

  return payload
}

export const ASSIGNMENT_COLUMNS = 'id, mentor_id, developer_id, assigned_date, active' as const

export const mentorAssignmentRowSchema = z.object({
  id: z.string().min(1),
  mentor_id: z.string().min(1),
  developer_id: z.string().min(1),
  assigned_date: z.string().nullable(),
  active: z.boolean(),
})

export type MentorAssignmentRow = z.infer<typeof mentorAssignmentRowSchema>

export function toMentorAssignment(row: MentorAssignmentRow): MentorAssignment {
  return {
    id: row.id,
    mentorId: row.mentor_id,
    developerId: row.developer_id,
    active: row.active,
    ...(row.assigned_date === null ? {} : { assignedDate: row.assigned_date }),
  }
}
