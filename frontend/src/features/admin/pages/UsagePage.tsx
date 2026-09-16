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
import { describeApiConfigProblem } from '@services/api/api-config'
import { isUsageAvailable, usedPercent } from '@services/usage/usage.service'
import type { ResourceUsage, TableUsage } from '@services/usage/usage.service'
import { formatBytes } from '@utils/bytes.utils'
import { formatRelativeTime, formatTimestamp } from '@utils/date.utils'
import { compareText } from '@utils/table.utils'

import './UsagePage.scss'

type SortKey = 'indexes' | 'name' | 'rows' | 'total'

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
  const databasePercent = usedPercent(usage.databaseBytes, usage.maxDatabaseBytes)

  const logins = usage.accounts === 1 ? 'login' : 'logins'
  const activeLabel = usage.activeAccounts === 1 ? 'active login' : 'active logins'

  return (
    <Panel
      description={`Measured ${formatRelativeTime(usage.measuredAt)}.`}
      title="Against the database limit"
    >
      <div className="stat-card-grid">
        <StatCard
          detail={`${formatShare(databasePercent)} of ${formatBytes(usage.maxDatabaseBytes)}`}
          icon="database"
          label="Database"
          progress={databasePercent}
          tone={toneFor(databasePercent)}
          value={formatBytes(usage.databaseBytes)}
        />

        <StatCard
          detail="Transaction log files for this database"
          icon="download"
          label="Transaction log"
          value={formatBytes(usage.logBytes)}
        />

        <StatCard
          detail={`${String(usage.activeAccounts)} ${activeLabel} of ${String(usage.accounts)} ${logins}`}
          icon="users"
          label="Accounts"
          value={usage.accounts}
        />

        <StatCard
          detail="Latest write across application tables"
          icon="history"
          label="Last write"
          tone="positive"
          value={
            usage.lastWriteAt === undefined ? 'Never' : formatRelativeTime(usage.lastWriteAt)
          }
        />
      </div>

      <p className="usage-page__measured">
        Measured at {formatTimestamp(usage.measuredAt)}. The database figure is compared to the
        SQL Server Express per-database size limit ({formatBytes(usage.maxDatabaseBytes)}). Active
        accounts are profiles marked active in the identity service, not a count of recent sign-ins.
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
      description="The total includes the table and its indexes, which is what the catalog reports."
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

export function UsagePage() {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const usageQuery = useResourceUsage()

  if (!isUsageAvailable()) {
    return (
      <PagePlaceholder
        description={
          describeApiConfigProblem() ??
          'Usage needs a configured API, which this deployment does not have.'
        }
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
        description="Database footprint and login counts for this deployment."
        isPageHeading
        title="Usage"
      >
        <p className="usage-page__note">
          Counted in SQL Server when this screen loaded, so these are the database’s own figures
          rather than an estimate. Only administrators can read them.
        </p>
      </Panel>

      {usageQuery.error !== null ? (
        <Panel title="Against the database limit">
          <ErrorState
            message={`The usage figures could not be read: ${usageQuery.error.message}`}
            onRetry={() => void usageQuery.refetch()}
          />
        </Panel>
      ) : usage === undefined ? (
        <Panel title="Against the database limit">
          <Skeleton label="Measuring…" rows={4} />
        </Panel>
      ) : (
        <>
          <PlanPanel usage={usage} />
          <TableBreakdown usage={usage} />
        </>
      )}
    </div>
  )
}
