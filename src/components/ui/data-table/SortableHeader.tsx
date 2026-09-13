import type { TableSort } from '@utils/table.utils'

interface SortableHeaderProps<TKey extends string> {
  columnKey: TKey
  label: string
  sort: TableSort<TKey>
  onSort: (key: TKey) => void

  /** Right-aligns the heading, for a column of numbers. */
  isNumeric?: boolean
}

export function SortableHeader<TKey extends string>({
  columnKey,
  isNumeric = false,
  label,
  onSort,
  sort,
}: SortableHeaderProps<TKey>) {
  const isSorted = sort.key === columnKey

  return (
    <th
      aria-sort={isSorted ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={isNumeric ? 'data-table__numeric' : undefined}
      scope="col"
    >
      <button
        className="data-table__sort"
        onClick={() => {
          onSort(columnKey)
        }}
        type="button"
      >
        {label}

        {isSorted ? (
          <span aria-hidden="true" className="data-table__sort-indicator">
            {sort.direction === 'asc' ? '▲' : '▼'}
          </span>
        ) : null}
      </button>
    </th>
  )
}
