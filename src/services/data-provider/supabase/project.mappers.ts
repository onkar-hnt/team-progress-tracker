import { z } from 'zod'

import type { CreateProjectRequest, Project, UpdateProjectRequest } from '@models/index'
import { PROJECT_STATUSES } from '@models/project.model'

/**
 * Translation between `public.projects` rows and the domain `Project`.
 *
 * `active` and `status` stay separate here as they do everywhere else:
 * `status` is where the project stands in its life cycle, `active` controls
 * whether it is still offered in pickers. A completed project usually remains
 * active for a while so late entries can still be logged against it.
 *
 * The assigned developers are not a column. In the workbook they were one
 * delimited cell; here they are rows in `project_developers`, read back
 * through an embedded select and passed in separately.
 */

export const PROJECT_COLUMNS =
  'id, code, name, client, description, status, active, start_date, end_date, mentor_id' as const

/** With the membership rows embedded, which is how a project is read. */
export const PROJECT_WITH_MEMBERS = `${PROJECT_COLUMNS}, project_developers(developer_id)` as const

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
  // Absent when the caller selected the project without its members.
  project_developers: z.array(z.object({ developer_id: z.string() })).optional(),
})

export type ProjectRow = z.infer<typeof projectRowSchema>

function optional<TKey extends string, TValue>(
  key: TKey,
  value: TValue | null,
): Record<TKey, TValue> | Record<string, never> {
  return value === null ? {} : ({ [key]: value } as Record<TKey, TValue>)
}

export function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    active: row.active,
    status: row.status,
    // Sorted so that two reads of the same project produce the same array.
    // The order carries no meaning, and an unstable one would make the list
    // look changed to anything comparing it.
    assignedDeveloperIds: (row.project_developers ?? [])
      .map((member) => member.developer_id)
      .sort((left, right) => left.localeCompare(right)),
    ...optional('client', row.client),
    ...optional('description', row.description),
    ...optional('startDate', row.start_date),
    ...optional('endDate', row.end_date),
    ...optional('mentorId', row.mentor_id),
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

/**
 * Builds the insert payload.
 *
 * `id` and `code` are omitted so the column defaults assign them, and a
 * `code` on the request is ignored rather than honoured — accepting one would
 * reopen the collision the `project_code_seq` sequence exists to prevent.
 * `assignedDeveloperIds` is absent too: those are rows in another table.
 */
export function toProjectInsert(request: CreateProjectRequest): ProjectInsert {
  return {
    name: request.name.trim(),
    client: blankToNull(request.client),
    description: blankToNull(request.description),
    status: request.status,
    active: request.active,
    start_date: blankToNull(request.startDate),
    end_date: blankToNull(request.endDate),
    mentor_id: request.mentorId ?? null,
  }
}

/**
 * Builds the update payload from the keys the caller actually supplied.
 *
 * Presence is tested with `in` rather than against `undefined`, which lets a
 * caller say two different things: omitting `mentorId` leaves the accountable
 * mentor alone, while passing it explicitly as `undefined` clears it. Against
 * `undefined` alone those two are indistinguishable, and there would be no
 * way to unset a nullable column at all.
 */
export function toProjectUpdate(request: UpdateProjectRequest): Partial<ProjectInsert> {
  const payload: Partial<ProjectInsert> = {}

  if ('name' in request && request.name !== undefined) payload.name = request.name.trim()
  if ('client' in request) payload.client = blankToNull(request.client)
  if ('description' in request) payload.description = blankToNull(request.description)
  if ('status' in request && request.status !== undefined) payload.status = request.status
  if ('active' in request && request.active !== undefined) payload.active = request.active
  if ('startDate' in request) payload.start_date = blankToNull(request.startDate)
  if ('endDate' in request) payload.end_date = blankToNull(request.endDate)
  if ('mentorId' in request) payload.mentor_id = request.mentorId ?? null

  return payload
}

/** An empty string means "not recorded", and is stored as null rather than ''. */
function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}
