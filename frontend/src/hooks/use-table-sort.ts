import { useState } from 'react'

import type { TableSort } from '@utils/table.utils'

export interface TableSorting<TKey extends string> {
  sort: TableSort<TKey>

  toggle: (key: TKey) => void
}

export function useTableSort<TKey extends string>(
  initial: TableSort<TKey>,
  descendingFirst: readonly TKey[] = [],
): TableSorting<TKey> {
  const [sort, setSort] = useState<TableSort<TKey>>(initial)

  const toggle = (key: TKey) => {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: descendingFirst.includes(key) ? 'desc' : 'asc' },
    )
  }

  return { sort, toggle }
}
