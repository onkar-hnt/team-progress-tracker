import { useMemo, useState } from 'react'

import { useConfirm } from '@app/providers/confirm-context'
import { useSnackbar } from '@app/providers/snackbar-context'
import { Button } from '@components/ui/button/Button'
import { SortableHeader } from '@components/ui/data-table/SortableHeader'
import { TableSearch } from '@components/ui/data-table/TableSearch'
import { ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { PagePlaceholder } from '@components/ui/page-placeholder/PagePlaceholder'
import { Panel } from '@components/ui/panel/Panel'
import { useAccessScope } from '@hooks/use-access-scope'
import { useDeletedRecords, useDestroyRecord, useRestoreRecord } from '@hooks/use-recycle-bin'
import { useTableSort } from '@hooks/use-table-sort'
import { useDevelopers, useProjects } from '@hooks/use-work-tracker'
import {
  DELETED_RECORD_LABELS,
  isRecycleBinAvailable,
  mayActOnDeletedRecord,
} from '@services/recycle-bin/recycle-bin.service'
import type { DeletedRecord } from '@services/recycle-bin/recycle-bin.service'
import { formatRelativeTime, formatShortDate, formatTimestamp } from '@utils/date.utils'
import { compareText, matchesSearch, sortRows } from '@utils/table.utils'

import './RecycleBinPage.scss'

/**
 * What has been deleted, and how to get it back.
 *
 * Everybody has one, and it holds what they may see: a developer's own deleted
 * entries, the ones belonging to a mentor's developers, everything for an
 * administrator. That is not decided here — the select policies on the six tables
 * decide it, and this screen simply lists what came back. See
 * `recycle-bin.service.ts`.
 *
 * Two actions, deliberately unequal. Restore is one click, because it undoes
 * something and cannot lose anything. Destroy asks first, in the same words the
 * delete buttons used to use, because it is the act those buttons used to perform
 * silently — the whole point of this screen is that the irreversible step is now a
 * separate, deliberate one.
 */

type SortKey = 'date' | 'deleted' | 'kind' | 'title' | 'who'

export function RecycleBinPage() {
  const confirm = useConfirm()
  const snackbar = useSnackbar()

  const [search, setSearch] = useState('')
  const { sort, toggle } = useTableSort<SortKey>({ key: 'deleted', direction: 'desc' }, ['deleted'])

  const { scope } = useAccessScope()
  const recordsQuery = useDeletedRecords()
  const developersQuery = useDevelopers()
  const projectsQuery = useProjects()

  const restore = useRestoreRecord()
  const destroy = useDestroyRecord()

  // The same lookup the work-tracker service does for its views, done here
  // instead: the bin reads its rows outside `DataProvider`, so there is nothing
  // upstream to resolve the names for it. Ids are shown when a name cannot be
  // found rather than a blank, since an unresolvable id is worth seeing.
  const nameOf = useMemo(() => {
    const developers = new Map((developersQuery.data ?? []).map((one) => [one.id, one.name]))
    const projects = new Map((projectsQuery.data ?? []).map((one) => [one.id, one.name]))

    return {
      developer: (id: string) => developers.get(id) ?? id,
      project: (id: string) => projects.get(id) ?? id,
    }
  }, [developersQuery.data, projectsQuery.data])

  /**
   * The second and third things worth knowing about a record, after what it is.
   *
   * One column for both halves of the bin, because they answer the same question in
   * different vocabularies: a deleted work entry belongs to a person and a project,
   * while a deleted project *is* the thing and what identifies it is its client. Two
   * columns would leave one of them empty on every row.
   */
  const detailsOf = (record: DeletedRecord): { primary: string; secondary?: string } => {
    if (record.developerId === undefined) return { primary: record.detail ?? '—' }

    return {
      primary: nameOf.developer(record.developerId),
      ...(record.projectId === undefined ? {} : { secondary: nameOf.project(record.projectId) }),
    }
  }

  const compare = (left: DeletedRecord, right: DeletedRecord, key: SortKey): number => {
    switch (key) {
      case 'kind':
        return compareText(DELETED_RECORD_LABELS[left.kind], DELETED_RECORD_LABELS[right.kind])
      case 'title':
        return compareText(left.title, right.title)
      case 'who':
        return compareText(detailsOf(left).primary, detailsOf(right).primary)
      case 'date':
        return compareText(left.date, right.date)
      case 'deleted':
        return compareText(left.deletedAt, right.deletedAt)
    }
  }

  // What this person can put back, which is narrower than what they can see: a
  // developer reads a comment a mentor wrote about them and a task a mentor
  // deleted, and can restore neither. `mayActOnDeletedRecord` explains why the
  // list is cut here rather than shown with two dead buttons on the end.
  const records = (recordsQuery.data ?? []).filter((record) =>
    mayActOnDeletedRecord(scope, record),
  )

  const visible = sortRows(
    records.filter((record) => {
      const details = detailsOf(record)
      return matchesSearch([record.title, details.primary, details.secondary], search)
    }),
    sort,
    compare,
    (left, right) => compareText(right.deletedAt, left.deletedAt),
  )

  const isBusy = restore.isPending || destroy.isPending

  const putBack = async (record: DeletedRecord) => {
    await restore.mutateAsync({ kind: record.kind, id: record.id }).then(
      () => {
        snackbar.success(`“${record.title}” is back where it was.`)
      },
      // Reported by the hook, which knows how to phrase it. Swallowed here so the
      // rejection does not reach the console saying nothing new.
      () => undefined,
    )
  }

  const askThenDestroy = async (record: DeletedRecord) => {
    const label = DELETED_RECORD_LABELS[record.kind].toLowerCase()

    const isDestroyed = await confirm({
      title: `Destroy this ${label}?`,
      message: `“${record.title}” will be removed from the database for good. This is the step the delete button used to take on its own, and there is nothing behind it — no copy, and no way to establish what was there.`,
      confirmLabel: 'Destroy permanently',
      isDestructive: true,
      action: () => destroy.mutateAsync({ kind: record.kind, id: record.id }),
    })

    if (isDestroyed) snackbar.success(`“${record.title}” was destroyed.`)
  }

  if (!isRecycleBinAvailable()) {
    return (
      <PagePlaceholder
        description="Keeping what has been deleted needs the Supabase data source. Under the workbook and the sample data a delete removes the row outright, so there is nothing for this screen to list — in a workbook, undo is Ctrl+Z in Excel."
        title="Recently deleted"
      />
    )
  }

  return (
    <div className="recycle-bin">
      <Panel
        description="Everything you have deleted, and how to put it back."
        isPageHeading
        title="Recently deleted"
      >
        <p className="recycle-bin__note">
          Deleting no longer destroys: a work entry, task or comment — and an employee, mentor or
          project — stops appearing anywhere and waits here instead, with everything it had.
          Nothing leaves this list on a schedule, so what is here stays until it is restored or
          destroyed. You see what you could delete in the first place, which for a developer is
          their own work entries.
        </p>
      </Panel>

      <Panel description="Newest deletion first." fills={records.length > 0} title="In the bin">
        {recordsQuery.error !== null ? (
          <ErrorState
            message={`The deleted records could not be loaded: ${recordsQuery.error.message}`}
            onRetry={() => void recordsQuery.refetch()}
          />
        ) : recordsQuery.isPending ? (
          <Skeleton label="Looking in the bin…" rows={4} />
        ) : records.length === 0 ? (
          <p className="recycle-bin__empty">
            Your bin is empty. Anything you delete — a work entry, a task, a comment, or a record
            from the roster — appears here instead of being destroyed.
          </p>
        ) : (
          <>
            <TableSearch
              hint="Name, title, developer or project"
              matchCount={visible.length}
              noun="records"
              onChange={setSearch}
              totalCount={records.length}
              value={search}
            />

            {visible.length === 0 ? (
              <p className="recycle-bin__empty">
                Nothing in the bin matches “{search}”. Clear the search to see it all.
              </p>
            ) : (
              <div className="data-table__scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <SortableHeader columnKey="kind" label="What" onSort={toggle} sort={sort} />
                      <SortableHeader columnKey="title" label="Record" onSort={toggle} sort={sort} />
                      <SortableHeader columnKey="who" label="Details" onSort={toggle} sort={sort} />
                      <SortableHeader columnKey="date" label="Dated" onSort={toggle} sort={sort} />
                      <SortableHeader
                        columnKey="deleted"
                        label="Deleted"
                        onSort={toggle}
                        sort={sort}
                      />
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {visible.map((record) => {
                      const details = detailsOf(record)

                      return (
                        <tr key={`${record.kind}-${record.id}`}>
                          <td>
                            <span
                              className={`recycle-bin__kind recycle-bin__kind--${record.kind}`}
                            >
                              {DELETED_RECORD_LABELS[record.kind]}
                            </span>
                          </td>
                          <td className="recycle-bin__title">{record.title}</td>
                          <td>
                            <span className="data-table__nowrap">{details.primary}</span>
                            {details.secondary === undefined ? null : (
                              <span className="recycle-bin__secondary">{details.secondary}</span>
                            )}
                          </td>
                          <td className="data-table__nowrap">
                            {record.date === undefined ? '—' : formatShortDate(record.date)}
                          </td>
                          {/* Relative, with the exact moment on hover: "2 hours ago"
                              is what answers "was this just now or last month", and
                              the timestamp is what somebody quotes. */}
                          <td className="data-table__nowrap">
                            <span title={formatTimestamp(record.deletedAt)}>
                              {formatRelativeTime(record.deletedAt)}
                            </span>
                          </td>
                          <td>
                            <div className="row-actions">
                              <Button
                                disabled={isBusy}
                                onClick={() => void putBack(record)}
                                size="small"
                                variant="secondary"
                              >
                                Restore
                              </Button>
                              <Button
                                disabled={isBusy}
                                onClick={() => void askThenDestroy(record)}
                                size="small"
                                variant="danger"
                              >
                                Destroy
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Panel>
    </div>
  )
}
