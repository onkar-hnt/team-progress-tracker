import { z } from 'zod'

import type { CreateProjectRequest, Project, UpdateProjectRequest } from '@models/index'
import { PROJECT_STATUSES } from '@models/project.model'

export const PROJECT_COLUMNS =
  'id, code, name, client, description, status, active, start_date, end_date, mentor_id, deleted_at' as const

/** With the membership rows embedded, which is how a project is read. */
export const PROJECT_WITH_MEMBERS =
  `${PROJECT_COLUMNS}, project_developers(developer_id), project_mentors(mentor_id)` as const

export const projectRowSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  client: z.string().nullable(),
  description: z.string().nullable(),
  status: z.enum(PROJECT_STATUSES),
  active: z.boolean(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  mentor_id: z.string().nullable(),

  deleted_at: z.string().nullable(),

  // Absent when the caller selected the project without its members.
  project_developers: z.array(z.object({ developer_id: z.string() })).optional(),
  project_mentors: z.array(z.object({ mentor_id: z.string() })).optional(),
})

export type ProjectRow = z.infer<typeof projectRowSchema>

function optional<TKey extends string, TValue>(
  key: TKey,
  value: TValue | null,
): Record<TKey, TValue> | Record<string, never> {
  return value === null ? {} : ({ [key]: value } as Record<TKey, TValue>)
}

export function toProject(row: ProjectRow): Project {
  const mentorIdSet = new Set([
    ...(row.project_mentors ?? []).map((member) => member.mentor_id),
    ...(row.mentor_id === null ? [] : [row.mentor_id]),
  ])
  const mentorIds = [
    ...(row.mentor_id !== null && mentorIdSet.has(row.mentor_id) ? [row.mentor_id] : []),
    ...[...mentorIdSet]
      .filter((id) => id !== row.mentor_id)
      .sort((left, right) => left.localeCompare(right)),
  ]

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    active: row.active,
    status: row.status,
    mentorIds,
    assignedDeveloperIds: (row.project_developers ?? [])
      .map((member) => member.developer_id)
      .sort((left, right) => left.localeCompare(right)),
    ...optional('client', row.client),
    ...optional('description', row.description),
    ...optional('startDate', row.start_date),
    ...optional('endDate', row.end_date),
    ...optional('mentorId', row.mentor_id ?? mentorIds[0] ?? null),
    ...optional('deletedAt', row.deleted_at),
  }
}

export interface ProjectInsert {
  name: string
  client: string | null
  description: string | null
  status: string
  active: boolean
  start_date: string | null
  end_date: string | null
  mentor_id: string | null
}

export function toProjectInsert(request: CreateProjectRequest): ProjectInsert {
  return {
    name: request.name.trim(),
    client: blankToNull(request.client),
    description: blankToNull(request.description),
    status: request.status,
    active: request.active,
    start_date: blankToNull(request.startDate),
    end_date: blankToNull(request.endDate),
    mentor_id: primaryMentorId(request),
  }
}

function primaryMentorId(request: {
  mentorId?: string
  mentorIds?: readonly string[]
}): string | null {
  const fromSet = request.mentorIds?.[0]
  if (fromSet !== undefined && fromSet !== '') return fromSet
  return request.mentorId ?? null
}

export function toProjectUpdate(request: UpdateProjectRequest): Partial<ProjectInsert> {
  const payload: Partial<ProjectInsert> = {}

  if ('name' in request && request.name !== undefined) payload.name = request.name.trim()
  if ('client' in request) payload.client = blankToNull(request.client)
  if ('description' in request) payload.description = blankToNull(request.description)
  if ('status' in request && request.status !== undefined) payload.status = request.status
  if ('active' in request && request.active !== undefined) payload.active = request.active
  if ('startDate' in request) payload.start_date = blankToNull(request.startDate)
  if ('endDate' in request) payload.end_date = blankToNull(request.endDate)
  if (request.mentorIds !== undefined) {
    payload.mentor_id = request.mentorIds[0] ?? null
  } else if ('mentorId' in request) {
    payload.mentor_id = request.mentorId ?? null
  }

  return payload
}

/** An empty string means "not recorded", and is stored as null rather than ''. */
function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}
