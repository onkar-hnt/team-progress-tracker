import { z } from 'zod'

import type { CreateDeveloperRequest, Developer, UpdateDeveloperRequest } from '@models/index'
import { USER_ROLES } from '@models/user.model'

/**
 * Translation between `public.developers` rows and the domain `Developer`.
 *
 * Three columns here are easily confused, and the mapping is where the
 * distinction has to be kept straight:
 *
 * - `id` is the relational key, a uuid this application controls.
 * - `employee_id` is the payroll reference, which HR may renumber.
 * - `code` is the `DEV001` label people read aloud.
 *
 * And separately, `role` is a job title while `access_role` decides what the
 * person may see. Nothing about one implies the other.
 */

export const DEVELOPER_COLUMNS =
  'id, code, name, employee_id, role, location, active, email, access_role, primary_project_id, created_date, profile_id' as const

export const developerRowSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  employee_id: z.string().nullable(),
  role: z.string().nullable(),
  location: z.string().nullable(),
  active: z.boolean(),
  email: z.string().nullable(),
  access_role: z.enum(USER_ROLES).nullable(),
  primary_project_id: z.string().nullable(),
  created_date: z.string().nullable(),

  // Read so the admin screen can tell who already has a login. Never written
  // from here: the provisioning function owns it.
  profile_id: z.string().nullable(),
})

export type DeveloperRow = z.infer<typeof developerRowSchema>

/**
 * A nullable column becomes an absent property.
 *
 * The domain models "not recorded" by the property not being there, and the
 * optional fields on `Developer` cannot hold null. Emitting the key with a
 * null value would typecheck nowhere and read as a value everywhere.
 */
function optional<TKey extends string, TValue>(
  key: TKey,
  value: TValue | null,
): Record<TKey, TValue> | Record<string, never> {
  return value === null ? {} : ({ [key]: value } as Record<TKey, TValue>)
}

export function toDeveloper(row: DeveloperRow): Developer {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    active: row.active,
    ...optional('employeeId', row.employee_id),
    ...optional('role', row.role),
    ...optional('location', row.location),
    ...optional('email', row.email),
    ...optional('accessRole', row.access_role),
    ...optional('primaryProjectId', row.primary_project_id),
    ...optional('createdDate', row.created_date),
    ...optional('profileId', row.profile_id),
  }
}

export interface DeveloperInsert {
  name: string
  employee_id: string | null
  role: string | null
  location: string | null
  active: boolean
  email: string | null
  access_role: string | null
  primary_project_id: string | null
  created_date: string | null
}

/**
 * Builds the insert payload.
 *
 * `id` and `code` are absent deliberately: both come from column defaults,
 * `gen_random_uuid()` and `developer_code_seq`, so concurrent inserts cannot
 * produce the same code. A `code` on the request is ignored rather than
 * honoured, since accepting one would reopen that race.
 */
export function toDeveloperInsert(request: CreateDeveloperRequest): DeveloperInsert {
  return {
    name: request.name.trim(),
    employee_id: blankToNull(request.employeeId),
    role: blankToNull(request.role),
    location: blankToNull(request.location),
    active: request.active,
    email: blankToNull(request.email),
    access_role: request.accessRole ?? null,
    primary_project_id: request.primaryProjectId ?? null,
    created_date: request.createdDate ?? null,
  }
}

/**
 * Builds the update payload, carrying only what the caller actually set.
 *
 * A key the caller omitted must not appear, or PostgREST would serialise the
 * `undefined` as null and blank a column nobody touched. This matches how the
 * Excel provider merged a partial request over the existing record.
 *
 * Presence is tested with `in` rather than against `undefined`, so that the
 * two distinguishable things a caller can say stay distinguishable: omitting
 * `primaryProjectId` leaves the project alone, while passing it explicitly as
 * `undefined` clears it. Compared against `undefined` alone there would be no
 * way to unset a nullable column at all.
 */
export function toDeveloperUpdate(request: UpdateDeveloperRequest): Partial<DeveloperInsert> {
  const payload: Partial<DeveloperInsert> = {}

  if ('name' in request && request.name !== undefined) payload.name = request.name.trim()
  if ('employeeId' in request) payload.employee_id = blankToNull(request.employeeId)
  if ('role' in request) payload.role = blankToNull(request.role)
  if ('location' in request) payload.location = blankToNull(request.location)
  if ('active' in request && request.active !== undefined) payload.active = request.active
  if ('email' in request) payload.email = blankToNull(request.email)
  if ('accessRole' in request) payload.access_role = request.accessRole ?? null
  if ('primaryProjectId' in request) payload.primary_project_id = request.primaryProjectId ?? null
  if ('createdDate' in request) payload.created_date = request.createdDate ?? null

  return payload
}

/**
 * An empty string is stored as null, not as an empty string.
 *
 * The unique indexes on `email` and `employee_id` skip nulls but not blanks,
 * so two people saved with an empty email would collide on the second one.
 */
function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}
