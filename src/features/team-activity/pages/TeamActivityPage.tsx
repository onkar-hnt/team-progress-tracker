import { useMemo, useState } from 'react'

import { useAuth } from '@app/providers/auth-context'
import { useConfirm } from '@app/providers/confirm-context'
import { useSnackbar } from '@app/providers/snackbar-context'
import { ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { Modal } from '@components/ui/modal/Modal'
import { Panel } from '@components/ui/panel/Panel'
import { StatCard } from '@components/ui/stat-card/StatCard'
import { DailyUpdateForm } from '@features/daily-update/components/DailyUpdateForm'
import { useDailyWorkEntries, useDeleteDailyWorkEntry, useDevelopers, useProjects } from '@hooks/use-work-tracker'
import type { DailyWorkEntryView } from '@services/work-tracker.service'
import { formatLongDate } from '@utils/date.utils'
import { calculateCompletionRate, summariseStatuses, sumHoursLogged } from '@utils/work-summary.utils'

import { ActivityFilters } from '../components/ActivityFilters'
import { ActivityTable } from '../components/ActivityTable'
import { createDefaultFilters, matchesSearch, resolvePeriod, toDailyWorkQuery } from '../activity-filters'

import './TeamActivityPage.scss'

export function TeamActivityPage() {
  const { user } = useAuth()
  const confirm = useConfirm()
  const snackbar = useSnackbar()
  const [filters, setFilters] = useState(createDefaultFilters)
  const [editing, setEditing] = useState<DailyWorkEntryView | null>(null)

  const period = resolvePeriod(filters)
  const query = useMemo(() => toDailyWorkQuery(filters), [filters])

  const entriesQuery = useDailyWorkEntries(query)
  const developersQuery = useDevelopers()
  const projectsQuery = useProjects()
  const deleteEntry = useDeleteDailyWorkEntry()

  // Free-text search is applied here rather than in the data layer, since the
  // provider filters on indexed columns only.
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

  /**
   * Asks before deleting, which it did not do before.
   *
   * A daily update is a first-hand record of somebody's work, written once and
   * not reconstructible — the strongest case in the application for a
   * confirmation step, and the only delete that had none.
   */
  const requestDelete = async (entry: DailyWorkEntryView) => {
    const isDeleted = await confirm({
      title: 'Delete this update?',
      message: `The update logged for ${formatLongDate(entry.date)} will be removed from the activity list and from the totals. This cannot be undone.`,
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

      <Panel description="Sort any column. You can edit or delete your own entries." title="Entries">
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
