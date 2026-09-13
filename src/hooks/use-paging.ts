import { useState } from 'react'

/** Growing limit + limit+1 row mirrors notification paging for consistent cache invalidation. */

export interface Page<TRecord> {
  records: TRecord[]
  hasMore: boolean
}

export interface Paging {
  /** Query limit includes one extra row to detect hasMore. */
  limit: number

  pageSize: number

  showMore: () => void

  apply: <TRecord>(rows: readonly TRecord[] | undefined) => Page<TRecord>
}

export function usePaging(pageSize: number, resetKey = ''): Paging {
  const [state, setState] = useState({ key: resetKey, pages: 1 })

  const pages = state.key === resetKey ? state.pages : 1

  return {
    limit: pageSize * pages + 1,
    pageSize,

    showMore: () => {
      setState({ key: resetKey, pages: pages + 1 })
    },

    apply: (rows) => {
      const all = rows ?? []
      const shown = pageSize * pages

      return { records: all.slice(0, shown), hasMore: all.length > shown }
    },
  }
}
