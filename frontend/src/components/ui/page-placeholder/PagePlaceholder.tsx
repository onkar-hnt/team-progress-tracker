import type { ReactNode } from 'react'

import './PagePlaceholder.scss'

interface PagePlaceholderProps {
  description: string
  title: string
  action?: ReactNode
}

export function PagePlaceholder({ action, description, title }: PagePlaceholderProps) {
  return (
    <div className="page-placeholder">
      <section className="page-placeholder__card">
        <h1>{title}</h1>
        <p>{description}</p>
        {action === undefined ? null : <div className="page-placeholder__action">{action}</div>}
      </section>
    </div>
  )
}
