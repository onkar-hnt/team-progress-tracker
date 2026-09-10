import type { PropsWithChildren } from 'react'

import { Panel } from '@components/ui/panel/Panel'

import './AdminPageLayout.scss'

interface AdminPageLayoutProps {
  title: string
  description: string
  createLabel: string
  onCreate: () => void
}

/**
 * Common frame for the administration screens.
 *
 * Each of them is a heading, a primary "add" action and a table, so the shape
 * lives here and the pages differ only in their content.
 */
export function AdminPageLayout({
  children,
  createLabel,
  description,
  onCreate,
  title,
}: PropsWithChildren<AdminPageLayoutProps>) {
  return (
    <div className="admin-page">
      <Panel
        action={
          <button className="button button--primary" onClick={onCreate} type="button">
            {createLabel}
          </button>
        }
        description={description}
        isPageHeading
        title={title}
      >
        <p className="admin-page__note">
          Everything on this screen is stored in the team workbook and is read from it everywhere
          else in the application.
        </p>
      </Panel>

      {children}
    </div>
  )
}
