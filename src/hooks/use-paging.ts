import { useState } from 'react'

/**
 * Asking the database for a page at a time.
 *
 * The counterpart to `limit` on the three record queries. A screen holds how many
 * pages have been asked for, puts the resulting limit in its query, and hands the
 * rows back here to be told whether there is another page.
 *
 * ## Why a growing limit rather than a cursor
 *
 * The same choice as the notification panel, and for the same reason: each page
 * re-reads from the newest row rather than continuing after the oldest one already
 * held. It fetches rows a cursor would not, and in exchange the list is always one
 * consistent answer to one query — so an entry logged while somebody is reading page
 * three appears at the top where it belongs, instead of being skipped or turning up
 * in the middle of a page. It is also what lets React Query cache and invalidate
 * these lists without any of them knowing about paging.
 *
 * One row more than the page is asked for and then dropped, which is how `hasMore`
 * is known without a second counting query. It is why the button offering another
 * page never appears with nothing behind it.
 */

export interface Page<TRecord> {
  /** The rows to draw: the requested page, with the extra row removed. */
  records: TRecord[]

  /** Whether asking for another page would return anything new. */
  hasMore: boolean
}

export interface Paging {
  /**
   * What to put in the query, which is one more than is drawn.
   *
   * Passing it straight through is the whole contract. A screen that computes its
   * own limit from `pageSize` would have to know about the extra row, and the two
   * would eventually disagree about who adds it.
   */
  limit: number

  /** How many rows a page holds, for the label on the button. */
  pageSize: number

  showMore: () => void

  /** Splits an answer into the page and the knowledge that there is more. */
  apply: <TRecord>(rows: readonly TRecord[] | undefined) => Page<TRecord>
}

/**
 * @param pageSize How many rows to show at first, and to add each time.
 * @param resetKey Anything that changes what the list is *of* — the filters, the
 *   developer whose history is on screen. When it changes, paging starts again at
 *   the first page, because "show me twenty more" said of one filter is not a
 *   statement about the next.
 */
export function usePaging(pageSize: number, resetKey = ''): Paging {
  // The key is held beside the count rather than watched by an effect, so the reset
  // happens in the same render as the change instead of one render later. A render
  // that read the old page count would ask for more rows than the new list should
  // have, and the request for them would already be in flight.
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
