import type {
  AssignedTask,
  AssignedTaskQuery,
  MentorComment,
  MentorCommentQuery,
} from '@models/index'

/**
 * In-memory evaluation of the task and comment queries.
 *
 * Both providers share these so filter semantics are identical regardless of
 * where the rows came from, and so a future server-side implementation has an
 * unambiguous specification to match.
 *
 * Dates compare as plain strings, which is correct and timezone-proof for
 * zero-padded `yyyy-MM-dd` values.
 */

export function matchesTaskQuery(task: AssignedTask, query: AssignedTaskQuery): boolean {
  if (query.developerIds !== undefined && !query.developerIds.includes(task.developerId)) {
    return false
  }

  if (query.mentorIds !== undefined) {
    if (task.mentorId === undefined || !query.mentorIds.includes(task.mentorId)) return false
  }

  if (query.projectIds !== undefined && !query.projectIds.includes(task.projectId)) return false
  if (query.statuses !== undefined && !query.statuses.includes(task.status)) return false
  if (query.priorities !== undefined && !query.priorities.includes(task.priority)) return false

  if (query.dueOnOrBefore !== undefined) {
    // A task with no due date can never be overdue, so it is excluded from a
    // due-date-bounded query rather than treated as due immediately.
    if (task.dueDate === undefined || task.dueDate > query.dueOnOrBefore) return false
  }

  return true
}

export function filterTasks(
  tasks: readonly AssignedTask[],
  query: AssignedTaskQuery | undefined,
): AssignedTask[] {
  if (query === undefined) return [...tasks]
  return tasks.filter((task) => matchesTaskQuery(task, query))
}

export function matchesCommentQuery(
  comment: MentorComment,
  query: MentorCommentQuery,
): boolean {
  if (query.dateFrom !== undefined && comment.date < query.dateFrom) return false
  if (query.dateTo !== undefined && comment.date > query.dateTo) return false

  if (query.developerIds !== undefined && !query.developerIds.includes(comment.developerId)) {
    return false
  }

  if (query.mentorIds !== undefined && !query.mentorIds.includes(comment.mentorId)) return false

  if (query.projectIds !== undefined) {
    if (comment.projectId === undefined || !query.projectIds.includes(comment.projectId)) {
      return false
    }
  }

  return true
}

export function filterComments(
  comments: readonly MentorComment[],
  query: MentorCommentQuery | undefined,
): MentorComment[] {
  if (query === undefined) return [...comments]
  return comments.filter((comment) => matchesCommentQuery(comment, query))
}

/**
 * Generates an identifier for a new record.
 *
 * Ids are created client-side because neither Excel nor a static host can
 * hand out sequence numbers, and because the id must exist before the row is
 * written. `randomUUID` needs a secure context, so a non-cryptographic
 * fallback keeps plain-HTTP development working.
 */
export function createRecordId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }

  const random = Math.random().toString(36).slice(2, 10)
  return `${prefix}-${Date.now().toString(36)}-${random}`
}

/**
 * Generates a short sequential id such as `MEN004`.
 *
 * Used for records a person will read and type in the sheet, where a UUID
 * would be unusable. Sequence gaps are fine: only uniqueness matters.
 */
export function createSequentialId(prefix: string, existingIds: readonly string[]): string {
  const pattern = new RegExp(`^${prefix}(\\d+)$`, 'i')

  const highest = existingIds.reduce((max, id) => {
    const match = pattern.exec(id)
    if (match?.[1] === undefined) return max
    return Math.max(max, Number.parseInt(match[1], 10))
  }, 0)

  return `${prefix}${String(highest + 1).padStart(3, '0')}`
}
