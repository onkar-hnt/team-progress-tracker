import { Dropdown } from '@components/ui/dropdown/Dropdown'
import { FilterField } from '@components/ui/field/Field'
import { TASK_PRIORITY_OPTIONS, TASK_STATUS_OPTIONS } from '@constants/task.constants'
import type { Developer, Project, TaskPriority, TaskStatus } from '@models/index'

import { PERIOD_PRESETS, PERIOD_PRESET_LABELS } from '../activity-filters'
import type { ActivityFilterState } from '../activity-filters'

import './ActivityFilters.scss'

const PRESET_OPTIONS = PERIOD_PRESETS.map((preset) => ({
  value: preset,
  label: PERIOD_PRESET_LABELS[preset],
}))

const STATUS_OPTIONS = [{ value: '', label: 'Any status' }, ...TASK_STATUS_OPTIONS]

const PRIORITY_OPTIONS = [{ value: '', label: 'Any priority' }, ...TASK_PRIORITY_OPTIONS]

interface ActivityFiltersProps {
  filters: ActivityFilterState
  onChange: (filters: ActivityFilterState) => void
  developers: readonly Developer[]
  projects: readonly Project[]
  /** Shown next to the reset control so the filtering is self-explanatory. */
  resultCount: number
}

export function ActivityFilters({
  developers,
  filters,
  onChange,
  projects,
  resultCount,
}: ActivityFiltersProps) {
  const update = (changes: Partial<ActivityFilterState>) => {
    onChange({ ...filters, ...changes })
  }

  return (
    <div className="activity-filters">
      <div className="activity-filters__grid">
        <FilterField label="Period">
          <Dropdown
            ariaLabel="Period"
            onChange={(next) => update({ preset: next as ActivityFilterState['preset'] })}
            options={PRESET_OPTIONS}
            value={filters.preset}
          />
        </FilterField>

        {filters.preset === 'custom' ? (
          <>
            <FilterField label="From">
              <input
                max={filters.customRange.to}
                onChange={(event) =>
                  update({ customRange: { ...filters.customRange, from: event.target.value } })
                }
                type="date"
                value={filters.customRange.from}
              />
            </FilterField>

            <FilterField label="To">
              <input
                min={filters.customRange.from}
                onChange={(event) =>
                  update({ customRange: { ...filters.customRange, to: event.target.value } })
                }
                type="date"
                value={filters.customRange.to}
              />
            </FilterField>
          </>
        ) : null}

        <FilterField label="Developer">
          <Dropdown
            ariaLabel="Developer"
            onChange={(next) => update({ developerId: next })}
            options={[
              { value: '', label: 'All developers' },
              ...developers.map((developer) => ({ value: developer.id, label: developer.name })),
            ]}
            value={filters.developerId}
          />
        </FilterField>

        <FilterField label="Project">
          <Dropdown
            ariaLabel="Project"
            onChange={(next) => update({ projectId: next })}
            options={[
              { value: '', label: 'All projects' },
              ...projects.map((project) => ({ value: project.id, label: project.name })),
            ]}
            value={filters.projectId}
          />
        </FilterField>

        <FilterField label="Status">
          <Dropdown
            ariaLabel="Status"
            onChange={(next) => update({ status: next as TaskStatus | '' })}
            options={STATUS_OPTIONS}
            value={filters.status}
          />
        </FilterField>

        <FilterField label="Priority">
          <Dropdown
            ariaLabel="Priority"
            onChange={(next) => update({ priority: next as TaskPriority | '' })}
            options={PRIORITY_OPTIONS}
            value={filters.priority}
          />
        </FilterField>

        <FilterField isWide label="Search">
          <input
            onChange={(event) => update({ search: event.target.value })}
            placeholder="Task, description or remarks"
            type="search"
            value={filters.search}
          />
        </FilterField>
      </div>

      <div className="activity-filters__footer">
        <label className="activity-filters__toggle">
          <input
            checked={filters.blockedOnly}
            onChange={(event) => update({ blockedOnly: event.target.checked })}
            type="checkbox"
          />
          <span>Blocked work only</span>
        </label>

        <p className="activity-filters__count" role="status">
          {resultCount} {resultCount === 1 ? 'entry' : 'entries'}
        </p>
      </div>
    </div>
  )
}
