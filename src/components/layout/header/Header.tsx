import { useNavigate } from 'react-router-dom'

import { useAuth } from '@app/providers/auth-context'
import { Icon } from '@components/ui/icons/Icon'
import { appConfig } from '@config/app.config'
import { APP_EYEBROW, APP_NAME } from '@constants/app.constants'
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
            so neither has an ambiguous meaning. */}
        <button
          aria-label="Open navigation menu"
          className="header__icon-button header__icon-button--drawer"
          onClick={onToggleDrawer}
          type="button"
        >
          <Icon name="menu" size={22} />
        </button>

        <button
          aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-pressed={isSidebarCollapsed}
          className="header__icon-button header__icon-button--rail"
          onClick={onToggleSidebar}
          type="button"
        >
          <Icon name={isSidebarCollapsed ? 'chevron-right' : 'chevron-left'} size={22} />
        </button>

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
          <button
            className="header__refresh"
            disabled={refresh.isPending}
            onClick={() => refresh.mutate()}
            title={
              refresh.error === null
                ? 'Re-read the latest data'
                : `Refresh failed: ${refresh.error.message}`
            }
            type="button"
          >
            <Icon name="refresh" size={18} />
            <span className="header__refresh-label">
              {refresh.isPending ? 'Refreshing…' : 'Refresh'}
            </span>
          </button>
        )}

        {/* Opening the master file is a maintenance action for the people who
            own the data, so it sits with the account controls rather than in
            the navigation. `noreferrer` keeps the app's URL out of the
            referrer sent to SharePoint. */}
        {canOpenWorkbook(user) && workbookUrl !== '' ? (
          <a
            className="header__workbook"
            href={workbookUrl}
            rel="noreferrer noopener"
            target="_blank"
          >
            <Icon name="table" size={18} />
            <span className="header__workbook-label">Open Excel Sheet</span>
          </a>
        ) : null}

        <div className="header__identity">
          <span>{user === null ? 'Signed out' : USER_ROLE_LABELS[user.role]}</span>
          <strong>{user?.name ?? 'Signed out'}</strong>
        </div>

        {user === null ? null : (
          <button className="header__sign-out" onClick={handleSignOut} type="button">
            Sign out
          </button>
        )}
      </div>
    </header>
  )
}
