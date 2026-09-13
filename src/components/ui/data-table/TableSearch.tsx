import { FilterField } from '@components/ui/field/Field'

import './TableSearch.scss'

/**
 * A search box above a table, with a count of what it left.
 *
 * The count is the part worth having. A search that matches nothing looks
 * identical to a list that failed to load, and a search that quietly excludes
 * half the roster looks like half the roster has gone — so the control says how
 * many rows it is hiding, in the same breath as hiding them.
 *
 * Filtering happens in the browser, over rows already fetched. See
 * `matchesSearch` for why that is a decision rather than a shortcut.
 */

interface TableSearchProps {
  value: string

  onChange: (value: string) => void

  /** Which fields are searched, said plainly: "name, email or job title". */
  hint: string

  /** How many rows the term left, and how many there were. */
  matchCount: number
  totalCount: number

  /** Plural noun for the rows, for the count line: "employees". */
  noun: string
}

export function TableSearch({
  hint,
  matchCount,
  noun,
  onChange,
  totalCount,
  value,
}: TableSearchProps) {
  const isSearching = value.trim() !== ''

  return (
    <div className="table-search">
      <FilterField isInline label="Search">
        <input
          onChange={(event) => {
            onChange(event.target.value)
          }}
          placeholder={hint}
          // `type="search"` rather than `text`, so the browser offers its own
          // clear control and Escape empties the field — both of which somebody
          // typing in a search box expects to be there.
          type="search"
          value={value}
        />
      </FilterField>

      {/* `role="status"` so the count is announced as it changes, which is the
          only way somebody not looking at the table learns that typing another
          letter left nothing. */}
      <p className="table-search__count" role="status">
        {isSearching
          ? `${String(matchCount)} of ${String(totalCount)} ${noun}`
          : `${String(totalCount)} ${noun}`}
      </p>
    </div>
  )
}
