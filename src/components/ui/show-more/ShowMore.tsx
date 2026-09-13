import { Button } from '@components/ui/button/Button'

import './ShowMore.scss'

interface ShowMoreProps {
  /** How many records are on screen now. */
  shown: number

  /**
   * The total, when the caller has it.
   *
   * Present only when the whole list is already in the browser and the paging is a
   * drawing decision — a dashboard panel holding a week of entries, say. Absent when
   * the rows came from a limited query, because then the total is genuinely unknown:
   * the database was asked for a page and one more row, and the answer says whether
   * there is a next page rather than how many there are.
   *
   * The difference is in the wording, and it is worth keeping. "Showing 20 of 63"
   * when the 63 is a guess would be the kind of small lie that makes somebody stop
   * trusting the numbers on the rest of the screen.
   */
  total?: number

  /** What is being counted: "entries", "comments", "tasks". */
  noun: string

  /** How many more the next page adds, at most. */
  pageSize: number

  /** True while the next page is on its way, for the server-paged callers. */
  isLoading?: boolean

  onShowMore: () => void
}

/**
 * The end of a list that has more behind it.
 *
 * One control for both kinds of paging — the client-side kind, where everything is
 * already here and only some of it is drawn, and the server-side kind, where the
 * next page is a request. They look the same on purpose: which one a screen uses is
 * a decision about the size of the data, and it should not change what the person
 * reading it sees or does.
 *
 * The count goes in the button's label rather than the sentence above it, because
 * "Show more" on a long list is a question — twenty more, or four hundred?
 */
export function ShowMore({
  isLoading = false,
  noun,
  onShowMore,
  pageSize,
  shown,
  total,
}: ShowMoreProps) {
  const nextPage = total === undefined ? pageSize : Math.min(pageSize, total - shown)

  return (
    <div className="show-more">
      <p className="show-more__count">
        {total === undefined
          ? `Showing the ${String(shown)} most recent ${noun}.`
          : `Showing ${String(shown)} of ${String(total)} ${noun}.`}
      </p>

      <Button disabled={isLoading} onClick={onShowMore} size="small" variant="ghost">
        {isLoading ? 'Loading…' : `Show ${String(nextPage)} more`}
      </Button>
    </div>
  )
}
