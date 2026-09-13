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

/**
 * How much of the free plan this project is using.
 *
 * The application runs on a free Supabase project, which has two ways of stopping that
 * give no warning: the database fills, or nobody writes anything for a week and the
 * project is paused. Both are visible in the Supabase dashboard — behind a login that an
 * administrator of *this* application does not necessarily have — so until this screen
 * existed the numbers were known to whoever owned the Supabase account and to nobody
 * else.
 *
 * ## Measured, not estimated, and honest about the gaps
 *
 * Everything with a figure beside it was counted by `public.resource_usage()` when the
 * screen loaded: database bytes from the catalogue, file bytes from the storage rows,
 * accounts from `auth.users`, the last write from the change log.
 *
 * Egress, Edge Function invocations and realtime messages have no figure, because they
 * are metered by the platform rather than by the database and the only way to them is a
 * token with rights over the whole project. They are listed with their allowances and a
 * link out rather than left off the screen — somebody reading a usage page needs to know
 * which questions it is not answering, or they will assume it answered them.
 *
 * ## Why the per-table breakdown is here
 *
 * Because "the database is at 60%" is not actionable and "the change log is 200 MB of
 * it" is. The table list is what turns the headline into something somebody can do
 * something about, and index bytes are broken out for the same reason.
 */

type SortKey = 'indexes' | 'name' | 'rows' | 'total'

/**
 * How full is too full.
 *
 * Green below half, the neutral progress colour to four fifths, then the attention
 * colour. The last threshold is where somebody should be doing something rather than
 * noting it: a free database at 80% has a hundred megabytes left, which for this
 * application is months rather than days — but a warning is only useful while there is
 * still time to act on it.
 */
function toneFor(percent: number): StatCardTone {
  if (percent >= 80) return 'attention'
  if (percent >= 50) return 'progress'

  return 'positive'
}

/** A percentage as it reads on a card: "62%", and "<1%" for anything that rounds to none. */
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

/**
 * The two allowances this screen can measure, and the two hazards beside them.
 *
 * A separate component from the page for the ordinary reason — it is only rendered once
 * the measurement has arrived, so everything inside it can read a `ResourceUsage`
 * instead of an optional one.
 */
function PlanPanel({ usage }: { usage: ResourceUsage }) {
  const databasePercent = usedPercent(usage.databaseBytes, FREE_PLAN.databaseBytes)
  const storagePercent = usedPercent(usage.storageBytes, FREE_PLAN.storageBytes)

  const files = usage.storageObjects === 1 ? 'file' : 'files'
  const logins = usage.accounts === 1 ? 'login' : 'logins'

  /**
   * Days since anything was written, for the pause warning.
   *
   * `null` where nothing has ever been written — a project just set up, which is idle in
   * the sense the plan means but has no date to count from.
   */
  const daysIdle = usage.lastWriteAt === undefined ? null : daysSince(usage.lastWriteAt)

  // Two days before the pause, which is enough for somebody seeing it on a Monday to act
  // before the following weekend closes the window.
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

        {/* Kept even though this application uploads nothing, which makes it a check
            rather than a gauge: the expected reading is zero, and anything else is a file
            left behind by an earlier version or put there by something outside the
            application — both worth seeing, and neither visible anywhere else. */}
        <StatCard
          detail={`${formatShare(storagePercent)} of ${formatBytes(FREE_PLAN.storageBytes)}, in ${String(usage.storageObjects)} ${files}`}
          icon="download"
          label="Files"
          progress={storagePercent}
          tone={toneFor(storagePercent)}
          value={formatBytes(usage.storageBytes)}
        />

        {/* No bar, for the opposite reason to the Files card above. The allowance is fifty
            thousand people a month against a team of a dozen, so a meter here would be a
            permanently empty track — these numbers are shown because seeing them is how
            somebody stops wondering about this cap, not because it is anywhere near. */}
        <StatCard
          detail={`of ${String(usage.accounts)} ${logins}, signed in this month`}
          icon="users"
          label="Active logins"
          value={usage.activeAccounts}
        />

        {/* The other way a free project stops. Counted from the change log, which has a
            trigger on every table that holds work. */}
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

/** Which tables the database is actually made of, largest first. */
function TableBreakdown({ usage }: { usage: ResourceUsage }) {
  // Size first and descending, because the question is "what is taking the room".
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
      {/* The table below is uncapped, unlike every other one in the application: it has a
          row per table in the schema rather than per record, so it is a dozen rows that grow
          only when a migration adds one — and it sits in the middle of the page with a
          section beneath it, where an inner scroller catches the wheel on the way down. See
          `data-table__scroll--uncapped`. */}
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

                  {/* Drawn against the largest table rather than against the plan: every
                      table here is a fraction of a percent of 500 MB, so a row of empty
                      tracks would compare nothing. The title says the other figure, which
                      is the one worth knowing once a table stands out. */}
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

/** The three allowances the database cannot see, named rather than omitted. */
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
        description="Usage is a property of a Supabase project — its database size, its files, its plan — and this deployment reads its data from somewhere else. A workbook's limit is the disk it sits on."
        title="Usage"
      />
    )
  }

  const usage = usageQuery.data

  /**
   * Refetch, with the spinner held on the control that asked for it.
   *
   * `isFetching` on the query would also flag the refresh React Query does on its own,
   * and a button that spins when nobody pressed it is a button people learn to distrust.
   */
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
