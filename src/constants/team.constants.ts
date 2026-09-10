/**
 * The mentor is not yet a workbook entity. Keeping the value here means the
 * UI has a single place to read it from until a proper user/role table exists.
 */
export const MENTOR = { name: 'Onkar Ingawale' } as const

/**
 * ISO weekday numbers (Monday = 1 ... Sunday = 7) that count as working days.
 *
 * Missing-update detection only applies to these days. Leave and public
 * holidays are out of scope for the MVP and will need their own source.
 */
export const WORKING_WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5]

/** Default look-back window, in days, for "recent activity" views. */
export const DEFAULT_DATE_RANGE_DAYS = 7
