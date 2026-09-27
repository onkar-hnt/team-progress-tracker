/** ISO weekdays that count as working days; holidays not modelled yet. */
export const WORKING_WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5]
/**
 * How far back a missing update is still asked about.
 *
 * Two working weeks: long enough to cover a week away and the week it is
 * noticed in, short enough that the list stays something a person can finish.
 */
export const MISSING_UPDATE_LOOKBACK_DAYS = 14
