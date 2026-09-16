import { FilterField } from '@components/ui/field/Field'

import './TableSearch.scss'

interface TableSearchProps {
  value: string

  onChange: (value: string) => void

  /** Which fields are searched, said plainly: "name, email or job title". */
  hint: string

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
          type="search"
          value={value}
        />
      </FilterField>

      <p className="table-search__count" role="status">
        {isSearching
          ? `${String(matchCount)} of ${String(totalCount)} ${noun}`
          : `${String(totalCount)} ${noun}`}
      </p>
    </div>
  )
}
