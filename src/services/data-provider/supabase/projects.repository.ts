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
import { mapPostgrestError, parseRows } from './supabase-errors'

/**
 * `public.projects`, together with the membership rows in
 * `public.project_developers`.
 *
 * One repository for both, because the domain treats them as one record: a
 * `Project` carries `assignedDeveloperIds`, and there is no separate
 * `DataProvider` method for membership. Splitting them into two modules would
 * mean neither could return a complete project.
 *
 * Membership is read with an embedded select and written as a difference
 * against the current rows, which is what makes re-saving an unchanged set a
 * no-op rather than a delete and reinsert. The difference itself is applied by
 * `set_project_members`, in one transaction, so a failure between removing the
 * old members and adding the new ones can no longer leave a project with a
 * team that is neither.
 */

export async function selectProjects(client: AppSupabaseClient): Promise<Project[]> {
  const { data, error } = await client.from('projects').select(PROJECT_WITH_MEMBERS).order('code')

  if (error !== null) throw mapPostgrestError(error, { table: 'Projects', operation: 'read' })

  return parseRows('Projects', projectRowSchema, data ?? [], toProject)
}

/**
 * Checks the references a project makes before any of it is written.
 *
 * The foreign keys would catch each of these, but a project is written in
 * two statements, and a member id rejected after the row exists would leave a
 * project half-saved. Checking first means a bad request changes nothing.
 */
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

  // Skipped for an empty team, unlike on update. A project created without
  // members has nothing to remove and nothing to add, so the call would be a
  // round trip to do nothing — whereas an empty list on update is an
  // instruction to clear the team, and has to be sent.
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
  // Read before anything is written, so a mistyped id is reported as the
  // missing project it is rather than after a partial save. The membership
  // difference no longer needs the current list — `set_project_members` works
  // that out for itself — but this check does.
  await requireProject(client, id)

  await assertProjectReferences(client, request)

  const payload = toProjectUpdate(request)

  if (Object.keys(payload).length > 0) {
    const { data, error } = await client
      .from('projects')
      .update(payload)
      .eq('id', id)
      .select('id')
      .maybeSingle()

    if (error !== null) {
      throw mapPostgrestError(error, { table: 'Projects', operation: 'update', recordId: id })
    }

    if (data === null) throw new RecordNotFoundError('Projects', id)
  }

  // Membership is only touched when the caller mentioned it. An update that
  // changes a project's status must not empty its team as a side effect,
  // which is what reading an absent list as "assign nobody" would do.
  if (request.assignedDeveloperIds !== undefined) {
    await setMembers(client, id, request.assignedDeveloperIds)
  }

  return requireProject(client, id)
}

/**
 * Removes a project, with the schema deciding what that takes with it.
 *
 * The delete actions differ per table, and each was chosen deliberately:
 * `project_developers` cascades because the team list is the project's own
 * and means nothing without it; `developers.primary_project_id` and
 * `feedback.project_id` fall to null because those records outlive the
 * project; `tasks` and `daily_updates` restrict, because they are the work
 * history and deleting a project must not erase it.
 *
 * The restriction is therefore reported as `RecordInUseError` rather than
 * worked around — the same answer the Excel provider reached by counting
 * rows itself.
 */
export async function deleteProjectRow(client: AppSupabaseClient, id: string): Promise<void> {
  const { data, error } = await client.from('projects').delete().eq('id', id).select('id')

  if (error !== null) {
    throw mapPostgrestError(error, { table: 'Projects', operation: 'delete', recordId: id })
  }

  if ((data ?? []).length === 0) throw new RecordNotFoundError('Projects', id)
}

export async function requireProject(client: AppSupabaseClient, id: string): Promise<Project> {
  const { data, error } = await client
    .from('projects')
    .select(PROJECT_WITH_MEMBERS)
    .eq('id', id)
    .maybeSingle()

  if (error !== null) {
    throw mapPostgrestError(error, { table: 'Projects', operation: 'read', recordId: id })
  }

  if (data === null) throw new RecordNotFoundError('Projects', id)

  return parseRows('Projects', projectRowSchema, [data], toProject)[0]!
}

/**
 * Brings the membership rows in line with the requested set.
 *
 * Still a difference rather than a delete-and-reinsert, so that saving an
 * unchanged list writes nothing and `created_at` on a row that was already
 * there is not restamped by somebody opening the dialog and pressing save.
 * What changed is where the difference is worked out: `set_project_members`
 * does it in one transaction, where a duplicate id is a redundant instruction
 * rather than a conflict, and where a failure cannot leave the old members
 * removed and the new ones unadded.
 *
 * Reported as an update, because that is what it is from the caller's side
 * even when the statements underneath are a delete and an insert.
 */
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
