import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { useAuth } from '@app/providers/auth-context'
import { useConfirm } from '@app/providers/confirm-context'
import { useSnackbar } from '@app/providers/snackbar-context'
import { ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { Modal } from '@components/ui/modal/Modal'
import { Panel } from '@components/ui/panel/Panel'
import { StatCard } from '@components/ui/stat-card/StatCard'
import { DailyUpdateForm } from '@features/daily-update/components/DailyUpdateForm'
import { useDailyWorkEntries, useDeleteDailyWorkEntry, useDevelopers, useProjects } from '@hooks/use-work-tracker'
import { describeDeleteOutcome } from '@services/recycle-bin/recycle-bin.service'
import type { DailyWorkEntryView } from '@services/work-tracker.service'
import { formatLongDate } from '@utils/date.utils'
import { calculateCompletionRate, summariseStatuses, sumHoursLogged } from '@utils/work-summary.utils'

import { ActivityFilters } from '../components/ActivityFilters'
import { ActivityTable } from '../components/ActivityTable'
import {
  filtersFromSearchParams,
  filtersToSearchParams,
  matchesSearch,
  resolvePeriod,
  toDailyWorkQuery,
} from '../activity-filters'
import type { ActivityFilterState } from '../activity-filters'

import './TeamActivityPage.scss'

export function TeamActivityPage() {
  const { user } = useAuth()
  const confirm = useConfirm()
  const snackbar = useSnackbar()
  const [editing, setEditing] = useState<DailyWorkEntryView | null>(null)

  // replace: true keeps browser back usable while search typing updates the URL.
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = useMemo(() => filtersFromSearchParams(searchParams), [searchParams])

  const setFilters = (next: ActivityFilterState) => {
    setSearchParams(filtersToSearchParams(next), { replace: true })
  }

  const period = resolvePeriod(filters)
  const query = useMemo(() => toDailyWorkQuery(filters), [filters])

  const entriesQuery = useDailyWorkEntries(query)
  const developersQuery = useDevelopers()
  const projectsQuery = useProjects()
  const deleteEntry = useDeleteDailyWorkEntry()

  const visibleEntries = useMemo(
    () =>
      (entriesQuery.data ?? []).filter((entry) =>
        matchesSearch(
          [entry.taskTitle, entry.description, entry.remarks, entry.blockerDescription],
          filters.search,
        ),
      ),
    [entriesQuery.data, filters.search],
  )

  const statuses = useMemo(() => summariseStatuses(visibleEntries), [visibleEntries])

  const error = entriesQuery.error ?? developersQuery.error ?? projectsQuery.error

  const requestDelete = async (entry: DailyWorkEntryView) => {
    const isDeleted = await confirm({
      title: 'Delete this update?',
      message: `The update logged for ${formatLongDate(entry.date)} will be removed from the activity list and from the totals. ${describeDeleteOutcome()}`,
      confirmLabel: 'Delete update',
      isDestructive: true,
      action: () => deleteEntry.mutateAsync(entry.id),
    })

    if (isDeleted) snackbar.success('The update was deleted.')
  }

  return (
    <div className="team-activity">
      <Panel
        description={`All task updates from ${formatLongDate(period.from)} to ${formatLongDate(period.to)}.`}
        isPageHeading
        title="Team activity"
      >
        <ActivityFilters
          developers={developersQuery.data ?? []}
          filters={filters}
          onChange={setFilters}
          projects={projectsQuery.data ?? []}
          resultCount={visibleEntries.length}
        />

        <div className="team-activity__stats stat-card-grid">
          <StatCard icon="calendar" label="Entries" tone="progress" value={statuses.total} />
          <StatCard icon="check" label="Completed" tone="positive" value={statuses.completed} />
          <StatCard icon="activity" label="In progress" value={statuses.inProgress} />
          <StatCard
            icon="alert"
            label="Needs attention"
            tone={statuses.needsAttention > 0 ? 'attention' : 'neutral'}
            value={statuses.needsAttention}
          />
          <StatCard
            icon="chart"
            label="Completion rate"
            value={`${String(calculateCompletionRate(visibleEntries))}%`}
          />
          <StatCard icon="chart" label="Hours logged" value={sumHoursLogged(visibleEntries)} />
        </div>
      </Panel>

      <Panel
        description="Sort any column. You can edit or delete your own entries."
        fills={visibleEntries.length > 0}
        title="Entries"
      >
        {error !== null ? (
          <ErrorState
            message={`The activity list could not be loaded: ${error.message}`}
            onRetry={() => void entriesQuery.refetch()}
          />
        ) : entriesQuery.isPending ? (
          <Skeleton label="Loading team activity…" rows={6} />
        ) : (
          <ActivityTable
            deletingId={deleteEntry.isPending ? (deleteEntry.variables ?? null) : null}
            entries={visibleEntries}
            onDelete={(entry) => void requestDelete(entry)}
            onEdit={setEditing}
            user={user}
          />
        )}
      </Panel>

      <Modal isOpen={editing !== null} onClose={() => setEditing(null)} title="Edit work entry">
        {editing === null ? null : (
          <DailyUpdateForm
            date={editing.date}
            entry={editing}
            onSaved={() => setEditing(null)}
          />
        )}
      </Modal>
    </div>
  )
}
