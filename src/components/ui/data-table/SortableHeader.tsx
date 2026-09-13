import type { TableSort } from '@utils/table.utils'

/**
 * A column heading that sorts the table.
 *
 * A real `<button>` inside a real `<th>`, which is what makes it reachable by
 * keyboard and announced as a control rather than as text that happens to
 * respond to clicks. `aria-sort` on the cell is how a screen reader says which
 * column the table is ordered by and in which direction — the arrow says it to
 * everybody else.
 *
 * Extracted from the Team Activity table, which had it to itself. Four
 * administration tables and the Logins screen now want the same thing, and five
 * copies of an `aria-sort` ternary is five chances to get one of them wrong.
 */

interface SortableHeaderProps<TKey extends string> {
  /** The column this heading is for. */
  columnKey: TKey

  label: string

  /** The table's current order, so the cell can describe itself. */
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

        {/* Only on the sorted column. An indicator on every heading — a faint
            pair of arrows, say — reads as decoration and stops answering the one
            question it is there for. */}
        {isSorted ? (
          <span aria-hidden="true" className="data-table__sort-indicator">
            {sort.direction === 'asc' ? '▲' : '▼'}
          </span>
        ) : null}
      </button>
    </th>
  )
}
