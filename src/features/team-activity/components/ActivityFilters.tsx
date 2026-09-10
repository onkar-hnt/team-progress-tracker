import { TASK_PRIORITY_OPTIONS, TASK_STATUS_OPTIONS } from '@constants/task.constants'
import type { Developer, Project, TaskPriority, TaskStatus } from '@models/index'

import { PERIOD_PRESETS, PERIOD_PRESET_LABELS } from '../activity-filters'
import type { ActivityFilterState } from '../activity-filters'

import './ActivityFilters.scss'

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
        <label className="activity-filters__field">
          <span>Period</span>
          <select
            onChange={(event) =>
              update({ preset: event.target.value as ActivityFilterState['preset'] })
            }
            value={filters.preset}
          >
            {PERIOD_PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {PERIOD_PRESET_LABELS[preset]}
              </option>
            ))}
          </select>
        </label>

        {filters.preset === 'custom' ? (
          <>
            <label className="activity-filters__field">
              <span>From</span>
              <input
                max={filters.customRange.to}
                onChange={(event) =>
                  update({ customRange: { ...filters.customRange, from: event.target.value } })
                }
                type="date"
                value={filters.customRange.from}
              />
            </label>

            <label className="activity-filters__field">
              <span>To</span>
              <input
                min={filters.customRange.from}
                onChange={(event) =>
                  update({ customRange: { ...filters.customRange, to: event.target.value } })
                }
                type="date"
                value={filters.customRange.to}
              />
            </label>
          </>
        ) : null}

        <label className="activity-filters__field">
          <span>Developer</span>
          <select
            onChange={(event) => update({ developerId: event.target.value })}
            value={filters.developerId}
          >
            <option value="">All developers</option>
            {developers.map((developer) => (
              <option key={developer.id} value={developer.id}>
                {developer.name}
              </option>
            ))}
          </select>
        </label>

        <label className="activity-filters__field">
          <span>Project</span>
          <select
            onChange={(event) => update({ projectId: event.target.value })}
            value={filters.projectId}
          >
            <option value="">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>

        <label className="activity-filters__field">
          <span>Status</span>
          <select
            onChange={(event) => update({ status: event.target.value as TaskStatus | '' })}
            value={filters.status}
          >
            <option value="">Any status</option>
            {TASK_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="activity-filters__field">
          <span>Priority</span>
          <select
            onChange={(event) => update({ priority: event.target.value as TaskPriority | '' })}
            value={filters.priority}
          >
            <option value="">Any priority</option>
            {TASK_PRIORITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="activity-filters__field activity-filters__field--wide">
          <span>Search</span>
          <input
            onChange={(event) => update({ search: event.target.value })}
            placeholder="Task, description or remarks"
            type="search"
            value={filters.search}
          />
        </label>
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
