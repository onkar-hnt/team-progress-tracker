import { z } from 'zod'

import type {
  CreateMentorRequest,
  Mentor,
  MentorAssignment,
  UpdateMentorRequest,
} from '@models/index'

/**
 * Translation between `public.mentors` rows and the domain `Mentor`.
 *
 * Two separate shapes on purpose. Rows are `snake_case`, carry `null` where
 * the domain uses absence, and include columns the application has no use for
 * (`created_at`, `profile_id`). Mapping in one place is what keeps those
 * details out of the UI: no component should ever see `created_date`.
 */

/** The columns read for a mentor. Listed rather than `*`, so a schema change
 * that drops one fails here instead of arriving as a silent `undefined`. */
export const MENTOR_COLUMNS = 'id, code, name, email, active, created_date, profile_id' as const

/**
 * `date` columns arrive as `YYYY-MM-DD` strings and `boolean` as real
 * booleans, so there is no parsing to do — only validation, because the
 * client is not generated against the schema and the row is therefore
 * `unknown` at this boundary.
 */
export const mentorRowSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  email: z.string().min(1),
  active: z.boolean(),
  created_date: z.string().nullable(),
  profile_id: z.string().nullable(),
})

export type MentorRow = z.infer<typeof mentorRowSchema>

export function toMentor(row: MentorRow): Mentor {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    email: row.email,
    active: row.active,
    // Absent rather than null: the domain models "no date recorded" by not
    // having the property, and `createdDate?: string` cannot hold null.
    ...(row.created_date === null ? {} : { createdDate: row.created_date }),
    ...(row.profile_id === null ? {} : { profileId: row.profile_id }),
  }
}

/** What may be sent when creating a mentor. */
export interface MentorInsert {
  name: string
  email: string
  active: boolean
  created_date: string | null
}

/**
 * Builds the insert payload.
 *
 * Neither `id` nor `code` is included, and that is the point of moving codes
 * into the database: both are assigned by column defaults — `gen_random_uuid()`
 * and the `mentor_code_seq` sequence — so concurrent inserts cannot produce
 * the same code. A `code` arriving on the request is ignored rather than
 * honoured, because accepting one would reopen exactly that race.
 */
export function toMentorInsert(request: CreateMentorRequest): MentorInsert {
  return {
    name: request.name.trim(),
    email: request.email.trim(),
    active: request.active,
    created_date: request.createdDate ?? null,
  }
}

/**
 * Builds the update payload, carrying only what the caller actually set.
 *
 * `UpdateMentorRequest` is a partial, and the difference between "set this to
 * null" and "leave it alone" has to survive the mapping. Spreading the whole
 * request would send `undefined` for untouched fields, which PostgREST
 * serialises as JSON null and would blank a column the caller never mentioned.
 */
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
