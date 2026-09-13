import { useState } from 'react'

import { SortableHeader } from '@components/ui/data-table/SortableHeader'
import { TableSearch } from '@components/ui/data-table/TableSearch'
import { ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { PagePlaceholder } from '@components/ui/page-placeholder/PagePlaceholder'
import { Panel } from '@components/ui/panel/Panel'
import { ShowMore } from '@components/ui/show-more/ShowMore'
import { useChangeLog } from '@hooks/use-history'
import { usePaging } from '@hooks/use-paging'
import { useTableSort } from '@hooks/use-table-sort'
import {
  HISTORY_ACTIONS,
  HISTORY_KINDS,
  isHistoryAvailable,
} from '@services/history/history.service'
import type { ChangeRecord } from '@services/history/history.service'
import { formatRelativeTime, formatTimestamp } from '@utils/date.utils'
import { compareText, matchesSearch, sortRows } from '@utils/table.utils'

import './ChangeLogPage.scss'

const CHANGE_PAGE_SIZE = 50

type SortKey = 'kind' | 'subject' | 'what' | 'when' | 'who'

export function ChangeLogPage() {
  const [search, setSearch] = useState('')
  const { sort, toggle } = useTableSort<SortKey>({ key: 'when', direction: 'desc' }, ['when'])

  const paging = usePaging(CHANGE_PAGE_SIZE)
  const changesQuery = useChangeLog(paging.limit)
  const page = paging.apply(changesQuery.data)

  // Actor name is stored on the row; developers cannot read profiles to resolve it.
  const nameOfActor = (change: ChangeRecord): string => {
    if (change.changedByProfileId === undefined) return 'The system'
    return change.changedByName ?? 'Someone else'
  }

  const describeChange = (change: ChangeRecord): string => {
    if (change.fields.length === 0) return HISTORY_ACTIONS[change.action]

    return change.fields
      .map((field) => `${field.label}: ${field.from ?? 'not set'} → ${field.to ?? 'not set'}`)
      .join(', ')
  }

  const compare = (left: ChangeRecord, right: ChangeRecord, key: SortKey): number => {
    switch (key) {
      case 'kind':
        return compareText(HISTORY_KINDS[left.kind], HISTORY_KINDS[right.kind])
      case 'subject':
        return compareText(left.subject, right.subject)
      case 'what':
        return compareText(describeChange(left), describeChange(right))
      case 'who':
        return compareText(nameOfActor(left), nameOfActor(right))
      case 'when':
        return compareText(left.changedAt, right.changedAt)
    }
  }

  const visible = sortRows(
    page.records.filter((change) =>
      matchesSearch(
        [
          change.subject,
          HISTORY_KINDS[change.kind],
          HISTORY_ACTIONS[change.action],
          describeChange(change),
          nameOfActor(change),
        ],
        search,
      ),
    ),
    sort,
    compare,
    (left, right) => compareText(right.changedAt, left.changedAt),
  )

  if (!isHistoryAvailable()) {
    return (
      <PagePlaceholder
        description="Recording what changed needs a configured Supabase project: the log is written by database triggers, which is what lets every write be attributed to somebody. Until one is configured there is nothing to record."
        title="Change log"
      />
    )
  }

  return (
    <div className="change-log">
      <Panel
        description="Every change to a record, with what it was before."
        isPageHeading
        title="Change log"
      >
        <p className="change-log__note">
          Written as things happen and never edited, including by the person who made the change.
          You see the history of the work you can see, which for a developer is their own — so a
          task moved to completed by somebody else shows here, with their name against it.
        </p>
      </Panel>

      <Panel description="Newest first." fills={page.records.length > 0} title="Changes">
        {changesQuery.error !== null ? (
          <ErrorState
            message={`The change log could not be loaded: ${changesQuery.error.message}`}
            onRetry={() => void changesQuery.refetch()}
          />
        ) : changesQuery.isPending ? (
          <Skeleton label="Reading the log…" rows={6} />
        ) : page.records.length === 0 ? (
          <p className="change-log__note">
            Nothing has been recorded yet. Every edit, deletion and restore from here on appears in
            this list.
          </p>
        ) : (
          <>
            <TableSearch
              hint="Record, field, or who changed it"
              matchCount={visible.length}
              noun="changes"
              onChange={setSearch}
              totalCount={page.records.length}
              value={search}
            />

            {visible.length === 0 ? (
              <p className="change-log__note">
                Nothing on this page matches “{search}”. Clear the search, or show more of the log.
              </p>
            ) : (
              <div className="data-table__scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <SortableHeader columnKey="kind" label="What" onSort={toggle} sort={sort} />
                      <SortableHeader
                        columnKey="subject"
                        label="Record"
                        onSort={toggle}
                        sort={sort}
                      />
                      <SortableHeader columnKey="what" label="Change" onSort={toggle} sort={sort} />
                      <SortableHeader columnKey="who" label="Who" onSort={toggle} sort={sort} />
                      <SortableHeader columnKey="when" label="When" onSort={toggle} sort={sort} />
                    </tr>
                  </thead>

                  <tbody>
                    {visible.map((change) => (
                      <tr key={change.id}>
                        <td>
                          <span className="change-log__kind">{HISTORY_KINDS[change.kind]}</span>
                        </td>
                        <td className="change-log__subject">
                          {change.subject === '' ? '—' : change.subject}
                        </td>
                        <td>
                          {change.fields.length === 0 ? (
                            <span
                              className={`change-log__action change-log__action--${change.action}`}
                            >
                              {HISTORY_ACTIONS[change.action]}
                            </span>
                          ) : (
                            <ul className="change-log__fields">
                              {change.fields.map((field) => (
                                <li key={field.label}>
                                  <span className="change-log__field">{field.label}</span>
                                  <span className="change-log__from">{field.from ?? 'not set'}</span>
                                  {' → '}
                                  <span className="change-log__to">{field.to ?? 'not set'}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td className="data-table__nowrap">
                          {nameOfActor(change)}
                        </td>
                        <td className="data-table__nowrap">
                          <span title={formatTimestamp(change.changedAt)}>
                            {formatRelativeTime(change.changedAt)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {page.hasMore ? (
              <ShowMore
                isLoading={changesQuery.isFetching}
                noun="changes"
                onShowMore={paging.showMore}
                pageSize={paging.pageSize}
                shown={page.records.length}
              />
            ) : null}
          </>
        )}
      </Panel>
    </div>
  )
}
