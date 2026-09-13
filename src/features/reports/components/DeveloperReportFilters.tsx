import { Button } from '@components/ui/button/Button'
import { Dropdown } from '@components/ui/dropdown/Dropdown'
import type { DropdownOption } from '@components/ui/dropdown/Dropdown'
import { FilterField } from '@components/ui/field/Field'

import type { DeveloperReportFilters as Filters } from '../hooks/use-developer-report'

interface DeveloperReportFiltersProps {
  value: Filters
  onChange: (next: Filters) => void

  developerOptions: readonly DropdownOption[]
  projectOptions: readonly DropdownOption[]
  isLoadingOptions: boolean

  problem: string | null

  isStale: boolean

  isGenerating: boolean
  onGenerate: () => void
  onClear: () => void
}

export function DeveloperReportFilters({
  developerOptions,
  isGenerating,
  isLoadingOptions,
  isStale,
  onChange,
  onClear,
  onGenerate,
  problem,
  projectOptions,
  value,
}: DeveloperReportFiltersProps) {
  const set = <TKey extends keyof Filters>(key: TKey, next: Filters[TKey]) => {
    onChange({ ...value, [key]: next })
  }

  return (
    <form
      className="developer-report__filters"
      onSubmit={(event) => {
        event.preventDefault()
        if (problem === null) onGenerate()
      }}
    >
      <div className="developer-report__filter-grid">
        <FilterField label="Developer">
          <Dropdown
            ariaLabel="Developer"
            disabled={isLoadingOptions}
            onChange={(next) => set('developerId', next)}
            options={developerOptions}
            value={value.developerId}
          />
        </FilterField>

        <FilterField label="Project">
          <Dropdown
            ariaLabel="Project"
            disabled={isLoadingOptions}
            onChange={(next) => set('projectId', next)}
            options={projectOptions}
            value={value.projectId}
          />
        </FilterField>

        <FilterField label="From date">
          <input
            max={value.to === '' ? undefined : value.to}
            onChange={(event) => set('from', event.target.value)}
            type="date"
            value={value.from}
          />
        </FilterField>

        <FilterField label="To date">
          <input
            min={value.from === '' ? undefined : value.from}
            onChange={(event) => set('to', event.target.value)}
            type="date"
            value={value.to}
          />
        </FilterField>
      </div>

      <div className="developer-report__filter-actions">
        {problem === null ? (
          isStale ? (
            <p className="developer-report__hint" role="status">
              Filters have changed. Generate again to update the report.
            </p>
          ) : null
        ) : (
          <p className="developer-report__hint developer-report__hint--problem">{problem}</p>
        )}

        <Button onClick={onClear} type="button" variant="ghost">
          Clear filters
        </Button>

        <Button disabled={problem !== null || isGenerating} icon="chart" type="submit" variant="primary">
          {isGenerating ? 'Generating…' : 'Generate report'}
        </Button>
      </div>
    </form>
  )
}
