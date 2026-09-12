import type { ReactNode } from 'react'

import './PagePlaceholder.scss'

interface PagePlaceholderProps {
  description: string
  title: string
  /**
   * A way out, for placeholders that stand in for a screen rather than
   * explaining a permanent limit. The shell's refresh sits above the routed
   * screen, so a placeholder shown in place of the shell itself has to carry
   * its own.
   */
  action?: ReactNode
}

export function PagePlaceholder({ action, description, title }: PagePlaceholderProps) {
  return (
    <section className="page-placeholder">
      <h1>{title}</h1>
      <p>{description}</p>
      {action === undefined ? null : <div className="page-placeholder__action">{action}</div>}
    </section>
  )
}
