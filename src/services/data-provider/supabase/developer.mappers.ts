import { z } from 'zod'

import type { CreateDeveloperRequest, Developer, UpdateDeveloperRequest } from '@models/index'
import { USER_ROLES } from '@models/user.model'

export const DEVELOPER_COLUMNS =
  'id, code, name, employee_id, role, location, active, email, access_role, primary_project_id, created_date, profile_id, deleted_at' as const

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

  profile_id: z.string().nullable(),

  deleted_at: z.string().nullable(),
})

export type DeveloperRow = z.infer<typeof developerRowSchema>

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
    ...optional('deletedAt', row.deleted_at),
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

function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}
