import type { DailyWorkEntry, DailyWorkQuery } from '@models/index'

/**
 * In-memory evaluation of a `DailyWorkQuery`.
 *
 * Both providers share this so that filter semantics are identical no matter
 * where the data came from. A future backend that can filter server-side
 * should still produce the same results as this function.
 *
 * Date comparison is plain string comparison, which is correct and
 * timezone-proof for zero-padded `yyyy-MM-dd` values.
 */
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

export function filterDailyWorkEntries(
  entries: readonly DailyWorkEntry[],
  query: DailyWorkQuery | undefined,
): DailyWorkEntry[] {
  if (query === undefined) return [...entries]
  return entries.filter((entry) => matchesDailyWorkQuery(entry, query))
}

/**
 * Generates an identifier for a new entry.
 *
 * Ids are created client-side because neither Excel nor a static host can
 * hand out sequence numbers, and because the id must exist before the row is
 * written. A UUID avoids collisions when several developers save at once;
 * `randomUUID` needs a secure context, so a non-cryptographic fallback keeps
 * plain-HTTP development working.
 */
export function createDailyWorkEntryId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `ENT-${crypto.randomUUID()}`
  }

  const random = Math.random().toString(36).slice(2, 10)
  return `ENT-${Date.now().toString(36)}-${random}`
}
