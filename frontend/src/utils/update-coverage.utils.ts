import type { DeveloperUpdateCoverage, UpdateCoverage, UpdateDay } from '@models/index'

/**
 * Readers over the coverage the Reporting service returns.
 *
 * The calculation itself lives on the server — see UpdateCoverageCalculator —
 * because answering it needs the whole roster, not only the people who have
 * entries. What is left here is picking one row out of the answer.
 */

/** The gaps only, newest first, for a reader who is filling them in. */
export function findPendingDays(coverage: DeveloperUpdateCoverage | undefined): UpdateDay[] {
  return (coverage?.days ?? []).filter((day) => day.state === 'missing')
}

export function findCoverageFor(
  coverage: UpdateCoverage | undefined,
  developerId: string | undefined,
): DeveloperUpdateCoverage | undefined {
  if (coverage === undefined || developerId === undefined) return undefined
  return coverage.developers.find((row) => row.developerId === developerId)
}
