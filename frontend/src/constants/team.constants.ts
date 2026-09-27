/** ISO weekdays that count as working days; holidays not modelled yet. */
export const WORKING_WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5]

export const DEFAULT_DATE_RANGE_DAYS = 7

/**
 * How far back a missing update is still asked about.
 *
 * Two working weeks: long enough to cover a week away and the week it is
 * noticed in, short enough that the list stays something a person can finish.
 * Matches DomainRules.MissingUpdateLookbackDays, which the Reporting service
 * uses when the browser sends no range.
 */
export const MISSING_UPDATE_LOOKBACK_DAYS = 14
