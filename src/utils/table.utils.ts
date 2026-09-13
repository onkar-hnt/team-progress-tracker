/**
 * Finding a row in a list, and putting the list in an order.
 *
 * Both jobs are done in the browser, over rows that have already arrived, and
 * that is a deliberate choice rather than a stopgap. Every list here is the size
 * of a team; a round trip per keystroke and a query per column would be slower
 * than the work itself, and the Excel data source cannot sort or search
 * efficiently at all — so pushing either down to the data layer would mean one
 * path that was quick and two that were worse.
 *
 * The filters that *narrow* a query — a date range, a project, a status — are a
 * different thing and do go to the data layer, because they decide which rows are
 * fetched. These two only rearrange what is already here.
 */

/**
 * Whether any of a row's fields contain the search term.
 *
 * Case-insensitive substring matching across the fields the caller thinks are
 * worth searching, which is always the ones on screen: matching against a column
 * nobody can see produces a filtered list that appears to have lost rows for no
 * reason.
 *
 * An empty term matches everything, so a search box that has been cleared is the
 * same as no search box at all.
 *
 * Moved here from the Team Activity screen, which had it to itself until the
 * administration tables and the Logins screen needed the same thing.
 */
export function matchesSearch(
  fields: readonly (string | undefined)[],
  search: string,
): boolean {
  const term = search.trim().toLowerCase()

  if (term === '') return true

  return fields.some((field) => field !== undefined && field.toLowerCase().includes(term))
}

export type SortDirection = 'asc' | 'desc'

/** Which column a table is ordered by, and which way. */
export interface TableSort<TKey extends string> {
  key: TKey
  direction: SortDirection
}

/**
 * Compares two rows on one column.
 *
 * Always ascending, whatever the reader asked for: `sortRows` applies the
 * direction, so a comparator never has to think about it. Written per table,
 * because "before" means something different for a date, a status and a name.
 */
export type RowComparator<TRow, TKey extends string> = (
  left: TRow,
  right: TRow,
  key: TKey,
) => number

/**
 * A sorted copy, ordered by the chosen column and then by a fixed tie-break.
 *
 * The tie-break is what stops the order jittering. Sorting a roster by status
 * puts twenty people in one group, `Array.prototype.sort` is only stable within a
 * single call, and the array it is given is rebuilt on every fetch — so without a
 * second key the rows inside a group can appear in a different order after any
 * refresh, which reads as the table shuffling itself.
 *
 * Never in place. The array being sorted is React Query's cached data, and
 * reordering that is a write to a value the cache believes it owns.
 */
export function sortRows<TRow, TKey extends string>(
  rows: readonly TRow[],
  sort: TableSort<TKey>,
  compare: RowComparator<TRow, TKey>,
  tieBreak?: (left: TRow, right: TRow) => number,
): TRow[] {
  const factor = sort.direction === 'asc' ? 1 : -1

  return [...rows].sort((left, right) => {
    const primary = compare(left, right, sort.key) * factor

    if (primary !== 0) return primary

    return tieBreak?.(left, right) ?? 0
  })
}

/**
 * Two strings, in the reader's alphabet.
 *
 * `localeCompare` rather than `<`, which orders by code point and so sorts every
 * capital letter before every lower-case one — "Zoe" ahead of "adam". Absent
 * values sort last in ascending order, since a blank cell is not the first thing
 * anybody is looking for.
 */
export function compareText(left: string | undefined, right: string | undefined): number {
  if (left === right) return 0
  if (left === undefined || left === '') return 1
  if (right === undefined || right === '') return -1

  return left.localeCompare(right)
}

/**
 * A flag, with `true` first in ascending order.
 *
 * Which is the useful way round for every one of these: active people, enabled
 * logins and current assignments are what a list is opened to look at, and the
 * exceptions are what it is sorted to find.
 */
export function compareFlag(left: boolean, right: boolean): number {
  if (left === right) return 0

  return left ? -1 : 1
}
