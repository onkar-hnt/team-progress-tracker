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

  // Resolve names here; the bin query runs outside DataProvider.
  const nameOf = useMemo(() => {
    const developers = new Map((developersQuery.data ?? []).map((one) => [one.id, one.name]))
    const projects = new Map((projectsQuery.data ?? []).map((one) => [one.id, one.name]))

    return {
      developer: (id: string) => developers.get(id) ?? id,
      project: (id: string) => projects.get(id) ?? id,
    }
  }, [developersQuery.data, projectsQuery.data])

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

  // Restore rights are narrower than read access.
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
        description="Keeping what has been deleted needs a configured Supabase project: the bin is a database column, and restoring is an update to it. Until one is configured there is nothing for this screen to list."
        title="Recently deleted"
      />
    )
  }

  return (
    <div className="recycle-bin">
      <Panel
        description="Everything deleted in the last fifteen days, and how to put it back."
        isPageHeading
        title="Recently deleted"
      >
        <p className="recycle-bin__note">
          Deleting no longer destroys: a work entry, task or comment — and an employee, mentor or
          project — stops appearing anywhere and waits here instead, with everything it had. It
          waits fifteen days, and is then destroyed for good unless somebody restored it first. You
          see what you could delete in the first place, which for a developer is their own work
          entries.
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
