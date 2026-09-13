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

/**
 * Who changed what, and what it was before.
 *
 * The screen the README used to apologise for not having. It reads one table, filled
 * by one trigger, and shows the field-level diff of every change to the six kinds of
 * record worth accounting for.
 *
 * Everybody has one, and it holds what they may see: a developer finds the changes to
 * their own work — including the ones somebody else made to it, which is the question
 * that makes this worth building — a mentor finds their developers' as well, and an
 * administrator finds all of it, roster included. None of that is decided here.
 * `record_history_select` decides it, and this screen lists what came back.
 *
 * Read-only, with no actions on a row at all. That is the point of a log: it is the
 * one screen in the application where nothing can be changed, including by whoever
 * wrote the thing being read.
 */

/** How many changes arrive at a time. Bigger than the bin's page, because a log is scanned. */
const CHANGE_PAGE_SIZE = 50

type SortKey = 'kind' | 'subject' | 'what' | 'when' | 'who'

export function ChangeLogPage() {
  const [search, setSearch] = useState('')
  const { sort, toggle } = useTableSort<SortKey>({ key: 'when', direction: 'desc' }, ['when'])

  const paging = usePaging(CHANGE_PAGE_SIZE)
  const changesQuery = useChangeLog(paging.limit)
  const page = paging.apply(changesQuery.data)

  /**
   * Who made a change.
   *
   * Read from the row rather than resolved. The name is copied onto the history row as
   * it is written, because the alternative — mapping a login id through the roster — is
   * exactly what a developer cannot do: `profiles` is an administrator's to read, so
   * their own mentor came back as a stranger. See 20260913235500.
   *
   * The two ways a name can be absent mean different things and are said differently. No
   * actor at all is a change made by a trigger rather than by a person, which is how the
   * synchronised copy of a status change is recorded. An actor with no name is somebody
   * whose login carries none.
   */
  const nameOfActor = (change: ChangeRecord): string => {
    if (change.changedByProfileId === undefined) return 'The system'
    return change.changedByName ?? 'Someone else'
  }

  /** The diff as one line of text, which is also what the search reads. */
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
        description="Recording what changed needs the Supabase data source. A workbook has no way to catch a write, nobody to attribute it to, and can be edited without this application ever seeing it — so a log kept there would be quietly incomplete, which is worse than none."
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
                        {/* Relative, with the exact moment on hover: "2 hours ago"
                            answers "was this just now", and the timestamp is what
                            somebody quotes back. */}
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
