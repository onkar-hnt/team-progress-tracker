import { Button } from '@components/ui/button/Button'

import './ShowMore.scss'

interface ShowMoreProps {
  /** How many records are on screen now. */
  shown: number

  /** Omit when total is unknown (server-paged queries). */
  total?: number

  /** What is being counted: "entries", "comments", "tasks". */
  noun: string

  /** How many more the next page adds, at most. */
  pageSize: number

  isLoading?: boolean

  onShowMore: () => void
}

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
