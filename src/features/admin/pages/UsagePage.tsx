import { useState } from 'react'

import { Button } from '@components/ui/button/Button'
import { SortableHeader } from '@components/ui/data-table/SortableHeader'
import { ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { PagePlaceholder } from '@components/ui/page-placeholder/PagePlaceholder'
import { Panel } from '@components/ui/panel/Panel'
import { StatCard } from '@components/ui/stat-card/StatCard'
import type { StatCardTone } from '@components/ui/stat-card/StatCard'
import { useResourceUsage } from '@hooks/use-resource-usage'
import { useTableSort } from '@hooks/use-table-sort'
import {
  FREE_PLAN,
  isUsageAvailable,
  usageDashboardUrl,
  usedPercent,
} from '@services/usage/usage.service'
import type { ResourceUsage, TableUsage } from '@services/usage/usage.service'
import { formatBytes } from '@utils/bytes.utils'
import { daysSince, formatRelativeTime, formatTimestamp } from '@utils/date.utils'
import { compareText } from '@utils/table.utils'

import './UsagePage.scss'

type SortKey = 'indexes' | 'name' | 'rows' | 'total'

// Warning thresholds for free-plan usage meters.
function toneFor(percent: number): StatCardTone {
  if (percent >= 80) return 'attention'
  if (percent >= 50) return 'progress'

  return 'positive'
}

function formatShare(percent: number): string {
  if (percent > 0 && percent < 1) return '<1%'

  return `${String(Math.round(percent))}%`
}

function compareTables(left: TableUsage, right: TableUsage, key: SortKey): number {
  switch (key) {
    case 'name':
      return compareText(left.name, right.name)
    case 'rows':
      return left.rows - right.rows
    case 'indexes':
      return left.indexBytes - right.indexBytes
    case 'total':
      return left.totalBytes - right.totalBytes
  }
}

function PlanPanel({ usage }: { usage: ResourceUsage }) {
  const databasePercent = usedPercent(usage.databaseBytes, FREE_PLAN.databaseBytes)
  const storagePercent = usedPercent(usage.storageBytes, FREE_PLAN.storageBytes)

  const files = usage.storageObjects === 1 ? 'file' : 'files'
  const logins = usage.accounts === 1 ? 'login' : 'logins'

  const daysIdle = usage.lastWriteAt === undefined ? null : daysSince(usage.lastWriteAt)

  // Warn two days before the free-plan inactivity pause.
  const isGoingQuiet = daysIdle !== null && daysIdle >= FREE_PLAN.inactivityPauseDays - 2

  return (
    <Panel
      description={`Measured ${formatRelativeTime(usage.measuredAt)}.`}
      title="Against the free plan"
    >
      <div className="stat-card-grid">
        <StatCard
          detail={`${formatShare(databasePercent)} of ${formatBytes(FREE_PLAN.databaseBytes)}`}
          icon="database"
          label="Database"
          progress={databasePercent}
          tone={toneFor(databasePercent)}
          value={formatBytes(usage.databaseBytes)}
        />

        <StatCard
          detail={`${formatShare(storagePercent)} of ${formatBytes(FREE_PLAN.storageBytes)}, in ${String(usage.storageObjects)} ${files}`}
          icon="download"
          label="Files"
          progress={storagePercent}
          tone={toneFor(storagePercent)}
          value={formatBytes(usage.storageBytes)}
        />

        <StatCard
          detail={`of ${String(usage.accounts)} ${logins}, signed in this month`}
          icon="users"
          label="Active logins"
          value={usage.activeAccounts}
        />

        <StatCard
          detail={
            daysIdle === null
              ? 'nothing recorded yet'
              : `paused after ${String(FREE_PLAN.inactivityPauseDays)} days idle`
          }
          icon="history"
          label="Last write"
          tone={isGoingQuiet ? 'attention' : 'positive'}
          value={
            usage.lastWriteAt === undefined ? 'Never' : formatRelativeTime(usage.lastWriteAt)
          }
        />
      </div>

      <p className="usage-page__measured">
        Measured at {formatTimestamp(usage.measuredAt)}. The allowances are Supabase’s free-plan
        figures — if this project has since been moved to a paid plan, they are higher than shown.
        Nothing in the application uploads files, so Files should read zero; anything there is
        left over from a version that did.
      </p>
    </Panel>
  )
}

function TableBreakdown({ usage }: { usage: ResourceUsage }) {
  const { sort, toggle } = useTableSort<SortKey>({ key: 'total', direction: 'desc' }, [
    'indexes',
    'rows',
    'total',
  ])

  const largest = usage.tables[0]?.totalBytes ?? 0

  const rows = [...usage.tables].sort((left, right) => {
    const ordered = compareTables(left, right, sort.key)
    return sort.direction === 'asc' ? ordered : -ordered
  })

  return (
    <Panel
      description="The total includes the table, its indexes and its overflow storage, which is what the plan counts."
      title="Where the database is"
    >
      {rows.length === 0 ? (
        <p className="usage-page__note">No tables were reported, which should not happen.</p>
      ) : (
        <div className="data-table__scroll data-table__scroll--uncapped">
          <table className="data-table">
            <thead>
              <tr>
                <SortableHeader columnKey="name" label="Table" onSort={toggle} sort={sort} />
                <SortableHeader columnKey="rows" label="Rows" onSort={toggle} sort={sort} />
                <SortableHeader columnKey="indexes" label="Indexes" onSort={toggle} sort={sort} />
                <SortableHeader columnKey="total" label="Total" onSort={toggle} sort={sort} />
                <th scope="col">Share</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((table) => (
                <tr key={table.name}>
                  <td className="data-table__nowrap">
                    <code className="usage-page__table-name">{table.name}</code>
                  </td>
                  <td className="data-table__nowrap">{table.rows.toLocaleString()}</td>
                  <td className="data-table__nowrap">{formatBytes(table.indexBytes)}</td>
                  <td className="data-table__nowrap">{formatBytes(table.totalBytes)}</td>

                  <td>
                    <span
                      aria-hidden="true"
                      className="usage-page__bar"
                      title={`${formatShare(
                        usedPercent(table.totalBytes, usage.databaseBytes),
                      )} of the database`}
                    >
                      <span
                        className="usage-page__bar-fill"
                        style={{
                          width: `${String(largest === 0 ? 0 : (table.totalBytes / largest) * 100)}%`,
                        }}
                      />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

function UnmeasuredPanel() {
  const dashboard = usageDashboardUrl()

  return (
    <Panel
      description="Metered by Supabase rather than by the database, so this screen cannot count them."
      title="Not measured here"
    >
      <ul className="usage-page__unmeasured">
        <li>
          <span className="usage-page__unmeasured-name">Egress</span>
          <span className="usage-page__unmeasured-limit">
            {formatBytes(FREE_PLAN.egressBytes)} a month
          </span>
          <span className="usage-page__unmeasured-note">
            Everything this application downloads from Supabase, files included.
          </span>
        </li>

        <li>
          <span className="usage-page__unmeasured-name">Edge Function calls</span>
          <span className="usage-page__unmeasured-limit">
            {FREE_PLAN.edgeInvocations.toLocaleString()} a month
          </span>
          <span className="usage-page__unmeasured-note">
            Creating a login, resetting a password, enabling or disabling an account.
          </span>
        </li>

        <li>
          <span className="usage-page__unmeasured-name">Realtime messages</span>
          <span className="usage-page__unmeasured-limit">
            {FREE_PLAN.realtimeMessages.toLocaleString()} a month
          </span>
          <span className="usage-page__unmeasured-note">
            Notifications arriving without a reload.
          </span>
        </li>
      </ul>

      <p className="usage-page__note">
        Reading these needs a token with rights over the whole project, which is not something to
        keep where a browser can reach it. They are on the project’s report in the Supabase
        dashboard, alongside the two figures above.{' '}
        {dashboard === null ? null : (
          <a className="usage-page__link" href={dashboard} rel="noreferrer" target="_blank">
            Open this project’s usage report
          </a>
        )}
      </p>
    </Panel>
  )
}

export function UsagePage() {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const usageQuery = useResourceUsage()

  if (!isUsageAvailable()) {
    return (
      <PagePlaceholder
        description="Usage is a property of a Supabase project — its database size, its files, its plan — and this deployment has no project configured to report on."
        title="Usage"
      />
    )
  }

  const usage = usageQuery.data

  const refresh = async () => {
    setIsRefreshing(true)
    await usageQuery.refetch()
    setIsRefreshing(false)
  }

  return (
    <div className="usage-page">
      <Panel
        action={
          <Button
            disabled={usageQuery.isPending}
            icon="refresh"
            isLoading={isRefreshing}
            onClick={() => void refresh()}
            size="small"
            variant="ghost"
          >
            Refresh
          </Button>
        }
        description="What this Supabase project is using, against the free plan's allowances."
        isPageHeading
        title="Usage"
      >
        <p className="usage-page__note">
          Counted in the database itself when this screen loaded, so these are the project’s own
          figures rather than an estimate. Egress and function calls are metered by Supabase rather
          than by the database and are not shown here — see the note at the foot of the page.
        </p>
      </Panel>

      {usageQuery.error !== null ? (
        <Panel title="Against the free plan">
          <ErrorState
            message={`The usage figures could not be read: ${usageQuery.error.message}`}
            onRetry={() => void usageQuery.refetch()}
          />
        </Panel>
      ) : usage === undefined ? (
        <Panel title="Against the free plan">
          <Skeleton label="Measuring…" rows={4} />
        </Panel>
      ) : (
        <>
          <PlanPanel usage={usage} />
          <TableBreakdown usage={usage} />
        </>
      )}

      <UnmeasuredPanel />
    </div>
  )
}
