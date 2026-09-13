import type { CreateProjectRequest, Project, UpdateProjectRequest } from '@models/index'
import type { AppSupabaseClient } from '@services/supabase/index'

import { RecordNotFoundError } from '../data-provider.errors'
import {
  PROJECT_WITH_MEMBERS,
  projectRowSchema,
  toProject,
  toProjectInsert,
  toProjectUpdate,
} from './project.mappers'
import { assertDevelopersExist, assertMentorExists } from './references'
import { softDeleteRow } from './soft-delete'
import { mapPostgrestError, parseRows } from './supabase-errors'

export async function selectProjects(client: AppSupabaseClient): Promise<Project[]> {
  const { data, error } = await client.from('projects').select(PROJECT_WITH_MEMBERS).order('code')

  if (error !== null) throw mapPostgrestError(error, { table: 'Projects', operation: 'read' })

  return parseRows('Projects', projectRowSchema, data ?? [], toProject)
}

async function assertProjectReferences(
  client: AppSupabaseClient,
  references: { mentorId?: string | undefined; assignedDeveloperIds?: readonly string[] },
): Promise<void> {
  if (references.mentorId !== undefined) await assertMentorExists(client, references.mentorId)

  if (references.assignedDeveloperIds !== undefined) {
    await assertDevelopersExist(client, references.assignedDeveloperIds)
  }
}

export async function insertProject(
  client: AppSupabaseClient,
  request: CreateProjectRequest,
): Promise<Project> {
  await assertProjectReferences(client, request)

  const { data, error } = await client
    .from('projects')
    .insert(toProjectInsert(request))
    // `id` and `code` are assigned by the database, so the row is read back
    // rather than assumed.
    .select('id')
    .single()

  if (error !== null) throw mapPostgrestError(error, { table: 'Projects', operation: 'insert' })

  const id = (data as { id: string }).id

  if (request.assignedDeveloperIds.length > 0) {
    await setMembers(client, id, request.assignedDeveloperIds)
  }

  return requireProject(client, id)
}

export async function updateProjectRow(
  client: AppSupabaseClient,
  id: string,
  request: UpdateProjectRequest,
): Promise<Project> {
  await requireProject(client, id)

  await assertProjectReferences(client, request)

  const payload = toProjectUpdate(request)

  if (Object.keys(payload).length > 0) {
    const { data, error } = await client
      .from('projects')
      .update(payload)
      .eq('id', id)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle()

    if (error !== null) {
      throw mapPostgrestError(error, { table: 'Projects', operation: 'update', recordId: id })
    }

    if (data === null) throw new RecordNotFoundError('Projects', id)
  }

  if (request.assignedDeveloperIds !== undefined) {
    await setMembers(client, id, request.assignedDeveloperIds)
  }

  return requireProject(client, id)
}

export async function deleteProjectRow(client: AppSupabaseClient, id: string): Promise<void> {
  return softDeleteRow(client, 'projects', id)
}

/** Reads one project that is not in the bin, or reports that there is none. */
export async function requireProject(client: AppSupabaseClient, id: string): Promise<Project> {
  const { data, error } = await client
    .from('projects')
    .select(PROJECT_WITH_MEMBERS)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (error !== null) {
    throw mapPostgrestError(error, { table: 'Projects', operation: 'read', recordId: id })
  }

  if (data === null) throw new RecordNotFoundError('Projects', id)

  return parseRows('Projects', projectRowSchema, [data], toProject)[0]!
}

async function setMembers(
  client: AppSupabaseClient,
  projectId: string,
  developerIds: readonly string[],
): Promise<void> {
  const { error } = await client.rpc('set_project_members', {
    p_project_id: projectId,
    p_developer_ids: [...developerIds],
  })

  if (error !== null) {
    throw mapPostgrestError(error, { table: 'Projects', operation: 'update', recordId: projectId })
  }
}
