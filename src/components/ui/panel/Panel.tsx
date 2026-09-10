import type { PropsWithChildren, ReactNode } from 'react'

import './Panel.scss'

interface PanelProps {
  title: string
  description?: string
  /** Rendered on the right of the header, for filters or links. */
  action?: ReactNode
  /** Renders the title as an `h1`, for the single main heading of a page. */
  isPageHeading?: boolean
}

/**
 * A titled surface used for every dashboard and report section.
 *
 * Headings are real heading elements so the page keeps a usable outline for
 * screen readers instead of a wall of visually-styled divs.
 */
export function Panel({
  action,
  children,
  description,
  isPageHeading = false,
  title,
}: PropsWithChildren<PanelProps>) {
  return (
    <section className="panel">
      <header className="panel__header">
        <div>
          {isPageHeading ? (
            <h1 className="panel__title panel__title--page">{title}</h1>
          ) : (
            <h2 className="panel__title">{title}</h2>
          )}
          {description === undefined ? null : <p className="panel__description">{description}</p>}
        </div>
        {action === undefined ? null : <div className="panel__action">{action}</div>}
      </header>
      {children}
    </section>
  )
}
