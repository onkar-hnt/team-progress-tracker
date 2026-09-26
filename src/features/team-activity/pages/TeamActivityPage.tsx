import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'

import { useAuth } from '@app/providers/auth-context'
import { useConfirm } from '@app/providers/confirm-context'
import { useSnackbar } from '@app/providers/snackbar-context'
import { EmptyState, ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { Modal } from '@components/ui/modal/Modal'
import { Panel } from '@components/ui/panel/Panel'
import { StatCard } from '@components/ui/stat-card/StatCard'
import { DailyUpdateForm } from '@features/daily-update/components/DailyUpdateForm'
import { useAccessScope } from '@hooks/use-access-scope'
import { useDailyWorkEntries, useDeleteDailyWorkEntry, useDevelopers, useProjects } from '@hooks/use-work-tracker'
import { describeDeleteOutcome } from '@services/recycle-bin/recycle-bin.service'
import type { DailyWorkEntryView } from '@services/work-tracker.service'
import { formatLongDate } from '@utils/date.utils'
import { matchesSearch } from '@utils/table.utils'
import { calculateCompletionRate, summariseStatuses, sumHoursLogged } from '@utils/work-summary.utils'

import { ActivityFilters } from '../components/ActivityFilters'
import { ActivityTable } from '../components/ActivityTable'
import {
  activityFiltersFromNavigation,
  resolvePeriod,
  toDailyWorkQuery,
  unreachableFilter,
} from '../activity-filters'
import type { ActivityFilterState } from '../activity-filters'

import './TeamActivityPage.scss'

export function TeamActivityPage() {
  const { user } = useAuth()
  const confirm = useConfirm()
  const snackbar = useSnackbar()
  const [editing, setEditing] = useState<DailyWorkEntryView | null>(null)
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [filters, setFilters] = useState<ActivityFilterState>(() =>
    activityFiltersFromNavigation(location.state, searchParams),
  )
  const strippedQuery = useRef(false)

  // A previous version wrote the filter into the hash. Drop it once; later
  // changes stay in component state and do not navigate.
  useEffect(() => {
    if (strippedQuery.current || searchParams.toString() === '') return
    strippedQuery.current = true
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams])

  const { scope } = useAccessScope()
  const period = resolvePeriod(filters)
  const query = useMemo(() => toDailyWorkQuery(filters), [filters])
  const unreachable = useMemo(() => unreachableFilter(scope, filters), [filters, scope])

  const entriesQuery = useDailyWorkEntries(query, {
    enabled: unreachable === null,
    staleTime: 0,
  })
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

  // isPending covers the wait before the first result. isLoading stays false
  // while that request has not started, which painted a finished 0.
  const isLoadingEntries = unreachable === null && entriesQuery.isPending && !entriesQuery.isError
  const statuses = useMemo(() => summariseStatuses(visibleEntries), [visibleEntries])

  const error = entriesQuery.error
  const pendingStat = isLoadingEntries ? '…' : error !== null ? '—' : null

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
          resultCount={isLoadingEntries || error !== null ? null : visibleEntries.length}
          resultLabel={error === null ? undefined : 'Could not load entries'}
        />

        {error !== null ? (
          <ErrorState
            message={`The activity list could not be loaded: ${error.message}`}
            onRetry={() => void entriesQuery.refetch()}
          />
        ) : null}

        <div className="team-activity__stats stat-card-grid">
          <StatCard
            icon="calendar"
            label="Entries"
            tone="progress"
            value={pendingStat ?? statuses.total}
          />
          <StatCard
            icon="check"
            label="Completed"
            tone="positive"
            value={pendingStat ?? statuses.completed}
          />
          <StatCard
            icon="activity"
            label="In progress"
            value={pendingStat ?? statuses.inProgress}
          />
          <StatCard
            icon="alert"
            label="Needs attention"
            tone={statuses.needsAttention > 0 ? 'attention' : 'neutral'}
            value={pendingStat ?? statuses.needsAttention}
          />
          <StatCard
            icon="chart"
            label="Completion rate"
            value={pendingStat ?? `${String(calculateCompletionRate(visibleEntries))}%`}
          />
          <StatCard
            icon="chart"
            label="Hours logged"
            value={pendingStat ?? sumHoursLogged(visibleEntries)}
          />
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
        ) : unreachable !== null ? (
          <EmptyState
            message={
              unreachable === 'project'
                ? 'You are not responsible for the selected project, so its updates are not yours to read. Pick a project you mentor, or clear the project filter.'
                : 'The selected developer is not assigned to you, so their updates are not yours to read. Pick an assigned developer, or clear the developer filter.'
            }
            title="Nothing here is visible to you"
            variant="filtered"
          />
        ) : isLoadingEntries ? (
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
