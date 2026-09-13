import type { DailyWorkEntry, DailyWorkQuery } from '@models/index'

/** Shared in-memory filter spec for Excel and Supabase providers. */
export function matchesDailyWorkQuery(entry: DailyWorkEntry, query: DailyWorkQuery): boolean {
  if (query.dateFrom !== undefined && entry.date < query.dateFrom) return false
  if (query.dateTo !== undefined && entry.date > query.dateTo) return false

  if (query.developerIds !== undefined && !query.developerIds.includes(entry.developerId)) {
    return false
  }

  if (query.projectIds !== undefined && !query.projectIds.includes(entry.projectId)) {
    return false
  }

  if (query.statuses !== undefined && !query.statuses.includes(entry.status)) return false
  if (query.priorities !== undefined && !query.priorities.includes(entry.priority)) return false
  if (query.isBlocked !== undefined && entry.isBlocked !== query.isBlocked) return false

  return true
}

/** Limit implies newest-first sort before slice. */
export function filterDailyWorkEntries(
  entries: readonly DailyWorkEntry[],
  query: DailyWorkQuery | undefined,
): DailyWorkEntry[] {
  if (query === undefined) return [...entries]

  const matching = entries.filter((entry) => matchesDailyWorkQuery(entry, query))
  if (query.limit === undefined) return matching

  return matching
    .sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id))
    .slice(0, query.limit)
}

/** Client-side id for Excel; UUID when crypto is available. */
export function createDailyWorkEntryId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `ENT-${crypto.randomUUID()}`
  }

  const random = Math.random().toString(36).slice(2, 10)
  return `ENT-${Date.now().toString(36)}-${random}`
}
