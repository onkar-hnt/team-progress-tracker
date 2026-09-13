import type { PropsWithChildren } from 'react'

import { Button } from '@components/ui/button/Button'
import { Panel } from '@components/ui/panel/Panel'

import './AdminPageLayout.scss'

interface AdminPageLayoutProps {
  title: string
  description: string
  createLabel: string
  onCreate: () => void
}

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
          <Button onClick={onCreate} variant="primary">
            {createLabel}
          </Button>
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
