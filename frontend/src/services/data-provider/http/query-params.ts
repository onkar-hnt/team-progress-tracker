import type {
  AssignedTaskQuery,
  DailyWorkQuery,
  MentorCommentQuery,
} from '@models/index'
import type { ApiQueryValue } from '@services/api/api-client'

function copyArrayParam(
  target: Record<string, ApiQueryValue>,
  key: string,
  values: readonly string[] | undefined,
): void {
  if (values !== undefined) target[key] = [...values]
}

export function taskListQuery(query?: AssignedTaskQuery): Record<string, ApiQueryValue> | undefined {
  if (query === undefined) return undefined

  const params: Record<string, ApiQueryValue> = {}

  copyArrayParam(params, 'developerIds', query.developerIds)
  copyArrayParam(params, 'mentorIds', query.mentorIds)
  copyArrayParam(params, 'projectIds', query.projectIds)
  copyArrayParam(params, 'statuses', query.statuses)
  copyArrayParam(params, 'priorities', query.priorities)

  if (query.dueOnOrBefore !== undefined) params.dueOnOrBefore = query.dueOnOrBefore
  if (query.limit !== undefined) params.limit = query.limit

  return params
}

export function dailyWorkListQuery(query?: DailyWorkQuery): Record<string, ApiQueryValue> | undefined {
  if (query === undefined) return undefined

  const params: Record<string, ApiQueryValue> = {}

  if (query.dateFrom !== undefined) params.dateFrom = query.dateFrom
  if (query.dateTo !== undefined) params.dateTo = query.dateTo
  copyArrayParam(params, 'developerIds', query.developerIds)
  copyArrayParam(params, 'projectIds', query.projectIds)
  copyArrayParam(params, 'statuses', query.statuses)
  copyArrayParam(params, 'priorities', query.priorities)
  if (query.isBlocked !== undefined) params.isBlocked = query.isBlocked
  if (query.limit !== undefined) params.limit = query.limit

  return params
}

export function commentListQuery(
  query?: MentorCommentQuery,
): Record<string, ApiQueryValue> | undefined {
  if (query === undefined) return undefined

  const params: Record<string, ApiQueryValue> = {}

  if (query.dateFrom !== undefined) params.dateFrom = query.dateFrom
  if (query.dateTo !== undefined) params.dateTo = query.dateTo
  copyArrayParam(params, 'developerIds', query.developerIds)
  copyArrayParam(params, 'mentorIds', query.mentorIds)
  copyArrayParam(params, 'projectIds', query.projectIds)
  copyArrayParam(params, 'taskIds', query.taskIds)
  if (query.limit !== undefined) params.limit = query.limit

  return params
}
