import { useNavigate } from 'react-router-dom'

import { useAuth } from '@app/providers/auth-context'
import { useConfirm } from '@app/providers/confirm-context'
import { useSnackbar } from '@app/providers/snackbar-context'
import { Button } from '@components/ui/button/Button'
import { Tooltip } from '@components/ui/tooltip/Tooltip'
import { APP_EYEBROW, APP_NAME } from '@constants/app.constants'
import { NotificationBell } from '@features/notifications/components/NotificationBell'
import { useRefreshWorkTracker } from '@hooks/use-work-tracker'
import { USER_ROLE_LABELS } from '@models/user.model'
import { logFailure, toUserMessage } from '@services/errors/error-message'

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
  const confirm = useConfirm()
  const snackbar = useSnackbar()
  const navigate = useNavigate()
  const refresh = useRefreshWorkTracker()

  /**
   * Asks first, then says so either way.
   *
   * The control sits in the header on every screen, a press away from Refresh
   * and the notification bell, and it ends the session from wherever somebody
   * happens to be — including a half-filled form, which goes with it. That is
   * enough to be worth a question, even though nothing is deleted.
   *
   * The message afterwards is a separate matter: signing out ends at the login
   * screen, which on its own is ambiguous, since a session that expired looks
   * exactly the same. A failure said nothing at all before this — the navigation
   * simply did not happen, leaving somebody who believes they have signed out
   * still signed in.
   */
  const handleSignOut = async () => {
    const isConfirmed = await confirm({
      title: 'Sign out?',
      message:
        'You will be returned to the sign-in screen. Anything typed into a form but not yet saved will be lost.',
      confirmLabel: 'Sign out',
    })

    if (!isConfirmed) return

    try {
      await signOut()
    } catch (error) {
      logFailure('sign out', error)
      snackbar.error(toUserMessage(error, 'You could not be signed out. Please try again.'))
      return
    }

    void navigate('/login', { replace: true })
    snackbar.info('You have been signed out.')
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

        <div className="header__identity">
          <span>{user === null ? 'Signed out' : USER_ROLE_LABELS[user.role]}</span>
          <strong>{user?.name ?? 'Signed out'}</strong>
        </div>

        {user === null ? null : (
          <Button onClick={() => void handleSignOut()} variant="inverse">
            Sign out
          </Button>
        )}
      </div>
    </header>
  )
}
