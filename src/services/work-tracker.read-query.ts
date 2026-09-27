/**
 * Turning an access scope and a caller's filters into one provider query.
 *
 * All of it is pure. The rule throughout is that what a policy allows and what
 * was asked for are different questions, and neither is answered by leaving the
 * other side to it: an id the caller chose is always sent, so the request is
 * made and row visibility stays with the database, and the scope's own lists
 * apply only to the dimensions the caller left open.
 */

import type { AccessScope } from './auth/access/access-scope'
import { restrictDeveloperIds, restrictProjectIds } from './auth/access/access-scope'
import type { DailyWorkQuery } from '@models/index'

/** Omits the key when unrestricted; an explicit undefined would look like an empty filter. */
export function withDeveloperIds(developerIds: readonly string[] | undefined): {
  developerIds?: readonly string[]
} {
  return developerIds === undefined ? {} : { developerIds }
}

export function withProjectIds(projectIds: readonly string[] | undefined): {
  projectIds?: readonly string[]
} {
  return projectIds === undefined ? {} : { projectIds }
}

export function idsForRead(
  requested: readonly string[] | undefined,
  restricted: readonly string[] | undefined,
): readonly string[] | undefined {
  if (requested !== undefined && requested.length > 0) return [...requested]
  return restricted
}

/**
 * A pure mentor is asked only for the projects they are responsible for.
 * Someone who also has an employee row keeps an open project list so their own
 * work on other projects is not dropped before the in-memory filter.
 *
 * An explicit selection is sent as selected. Replacing it with an empty
 * intersection made `list_daily_updates` never run and the screen show no rows.
 */
export function projectIdsForRead(
  scope: AccessScope,
  requested: readonly string[] | undefined,
): readonly string[] | undefined {
  if (requested !== undefined && requested.length > 0) return requested
  if (scope.visibleProjectIds === null) return requested
  if (scope.developerId !== undefined) return requested
  return restrictProjectIds(scope, requested)
}

/** Builds the daily-work read passed to the provider. */
export function buildDailyWorkReadQuery(
  scope: AccessScope,
  query?: DailyWorkQuery,
): DailyWorkQuery {
  const developerIds = idsForRead(
    query?.developerIds,
    restrictDeveloperIds(scope, query?.developerIds),
  )
  const projectIds = idsForRead(query?.projectIds, projectIdsForRead(scope, query?.projectIds))

  return {
    ...query,
    ...withDeveloperIds(developerIds),
    ...withProjectIds(projectIds),
  }
}

/**
 * Repeats the requested developer filter in memory.
 *
 * The provider is asked for these ids as well. This is the second half of the
 * same pair as `filterByScope`: the request narrows the read, and this narrows
 * what came back, so neither is trusted alone.
 */
export function narrowToDevelopers<TRecord extends { developerId: string }>(
  ids: readonly string[] | undefined,
  records: readonly TRecord[],
): readonly TRecord[] {
  if (ids === undefined) return records
  return records.filter((record) => ids.includes(record.developerId))
}
