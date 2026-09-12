import { useNavigate } from 'react-router-dom'

import { useAuth } from '@app/providers/auth-context'
import { Button, ButtonLink } from '@components/ui/button/Button'
import { Tooltip } from '@components/ui/tooltip/Tooltip'
import { appConfig } from '@config/app.config'
import { APP_EYEBROW, APP_NAME } from '@constants/app.constants'
import { NotificationBell } from '@features/notifications/components/NotificationBell'
import { useRefreshWorkTracker } from '@hooks/use-work-tracker'
import { USER_ROLE_LABELS } from '@models/user.model'
import { canOpenWorkbook } from '@services/auth/index'

import './Header.scss'

interface HeaderProps {
  isSidebarCollapsed: boolean
  /** Collapses the rail on desktop. */
  onToggleSidebar: () => void
  /** Opens the sliding drawer on small screens. */
  onToggleDrawer: () => void
}

export function Header({ isSidebarCollapsed, onToggleDrawer, onToggleSidebar }: HeaderProps) {
  const { signOut, user } = useAuth()
  const navigate = useNavigate()
  const refresh = useRefreshWorkTracker()

  // Available whatever the data source is: the workbook is where the team
  // maintains its records even while the app is still reading fixtures.
  const workbookUrl = appConfig.sharePoint.workbookUrl

  const handleSignOut = async () => {
    await signOut()
    void navigate('/login', { replace: true })
  }

  return (
    <header className="header">
      <div className="header__brand">
        {/* Two controls for two behaviours: a rail collapse on desktop and a
            drawer on small screens. Each is hidden where it does not apply,
            so neither has an ambiguous meaning.

            The label is the accessible name rather than an `aria-label`, which
            is what `isIconOnly` means: it is rendered and hidden, so it cannot
            be forgotten. */}
        <span className="header__drawer-toggle">
          <Button icon="menu" isIconOnly onClick={onToggleDrawer} variant="inverse">
            Open navigation menu
          </Button>
        </span>

        <span className="header__rail-toggle">
          <Button
            aria-pressed={isSidebarCollapsed}
            icon={isSidebarCollapsed ? 'chevron-right' : 'chevron-left'}
            isIconOnly
            onClick={onToggleSidebar}
            variant="inverse"
          >
            {isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          </Button>
        </span>

        <div>
          <span className="header__eyebrow">{APP_EYEBROW}</span>
          <strong className="header__title">{APP_NAME}</strong>
        </div>
      </div>

      <div className="header__account">
        {/* One refresh for the whole application rather than one per screen.
            Every screen renders this shell, so putting it here means it is in
            the same place on all of them — including the ones that write their
            own heading, and the placeholders shown when a screen has nothing
            to display, neither of which has anywhere to hang a button.

            It re-reads whatever the current screen is showing because it
            invalidates the root, so it needs no knowledge of the route. */}
        {user === null ? null : (
          <Tooltip
            label={
              refresh.error === null
                ? 'Re-read the latest data'
                : `Refresh failed: ${refresh.error.message}`
            }
          >
            <Button
              collapsesLabel
              disabled={refresh.isPending}
              icon="refresh"
              onClick={() => refresh.mutate()}
              variant="inverse"
            >
              {refresh.isPending ? 'Refreshing…' : 'Refresh'}
            </Button>
          </Tooltip>
        )}

        {/* Beside the refresh control rather than out on its own, because both
            are about what the application knows right now. Renders nothing at
            all unless the data source can produce notifications, and nothing
            when signed out. */}
        {user === null ? null : <NotificationBell />}

        {/* Opening the master file is a maintenance action for the people who
            own the data, so it sits with the account controls rather than in
            the navigation. `noreferrer` keeps the app's URL out of the
            referrer sent to SharePoint. */}
        {canOpenWorkbook(user) && workbookUrl !== '' ? (
          <ButtonLink
            collapsesLabel
            href={workbookUrl}
            icon="table"
            rel="noreferrer noopener"
            target="_blank"
            variant="inverse"
          >
            Open Excel Sheet
          </ButtonLink>
        ) : null}

        <div className="header__identity">
          <span>{user === null ? 'Signed out' : USER_ROLE_LABELS[user.role]}</span>
          <strong>{user?.name ?? 'Signed out'}</strong>
        </div>

        {user === null ? null : (
          <Button onClick={handleSignOut} variant="inverse">
            Sign out
          </Button>
        )}
      </div>
    </header>
  )
}
