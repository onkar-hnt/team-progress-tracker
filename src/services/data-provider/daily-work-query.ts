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

/**
 * The matching entries, and at most `query.limit` of them.
 *
 * The limit is applied after an explicit newest-first sort, because the interface
 * promises the *newest* entries rather than the first ones a workbook happens to
 * hold. Without the sort, "the latest twenty" would be whichever twenty rows were
 * typed first, which is close to the opposite.
 *
 * One thing this cannot do is make the read smaller. A workbook is fetched and
 * parsed whole, and the fixtures are already in memory, so here the limit saves
 * rendering rather than transfer — the same answer, reached more cheaply only by
 * the provider that can push it down to a database. That is what the interface
 * asks for: the same result everywhere, and each backend as efficient as it can be.
 */
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
