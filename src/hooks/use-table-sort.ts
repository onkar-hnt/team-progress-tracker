import { useState } from 'react'

import type { TableSort } from '@utils/table.utils'

/**
 * Which column a table is sorted by, held for as long as the screen is open.
 *
 * Component state rather than the URL. A sort order is how somebody is reading a
 * list at this moment, not where they are — putting it in the address would mean
 * every column click became a history entry, and Back would walk through them one
 * at a time instead of leaving the screen.
 *
 * The hook exists so that the tables offering this do not each keep their own copy
 * of the toggle rule, which is fiddlier than it looks: pressing the current column
 * reverses it, pressing a different one starts that column in its own natural
 * direction.
 */

export interface TableSorting<TKey extends string> {
  sort: TableSort<TKey>

  /** Reverses the current column, or moves to a new one. */
  toggle: (key: TKey) => void
}

/**
 * @param initial The column a table opens on.
 * @param descendingFirst Columns whose natural first press is newest-or-largest
 *   first — dates, counts, hours. Names and statuses read better ascending, so
 *   they are left out. Without this every column started ascending, which put the
 *   oldest row at the top of a table sorted by date and made everybody's first
 *   action a second click on the same header.
 */
export function useTableSort<TKey extends string>(
  initial: TableSort<TKey>,
  descendingFirst: readonly TKey[] = [],
): TableSorting<TKey> {
  const [sort, setSort] = useState<TableSort<TKey>>(initial)

  // Not wrapped in `useCallback`: it is only ever handed to an `onClick`, so a
  // fresh function each render costs nothing and nothing downstream memoises on
  // its identity.
  const toggle = (key: TKey) => {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: descendingFirst.includes(key) ? 'desc' : 'asc' },
    )
  }

  return { sort, toggle }
}
