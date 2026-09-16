/** Client-side search and sort over rows already in memory. */

export function matchesSearch(
  fields: readonly (string | undefined)[],
  search: string,
): boolean {
  const term = search.trim().toLowerCase()

  if (term === '') return true

  return fields.some((field) => field !== undefined && field.toLowerCase().includes(term))
}

export type SortDirection = 'asc' | 'desc'

export interface TableSort<TKey extends string> {
  key: TKey
  direction: SortDirection
}

/** Ascending comparator; sortRows applies direction. */
export type RowComparator<TRow, TKey extends string> = (
  left: TRow,
  right: TRow,
  key: TKey,
) => number

/** Sorted copy with tie-break to keep order stable across refetches. Never mutates the input. */
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

/** localeCompare with absent values last in ascending order. */
export function compareText(left: string | undefined, right: string | undefined): number {
  if (left === right) return 0
  if (left === undefined || left === '') return 1
  if (right === undefined || right === '') return -1

  return left.localeCompare(right)
}

/** true sorts before false in ascending order. */
export function compareFlag(left: boolean, right: boolean): number {
  if (left === right) return 0

  return left ? -1 : 1
}
