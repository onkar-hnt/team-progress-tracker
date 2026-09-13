import { useNavigate } from 'react-router-dom'

import { useAuth } from '@app/providers/auth-context'
import { useConfirm } from '@app/providers/confirm-context'
import { useSnackbar } from '@app/providers/snackbar-context'
import { Button } from '@components/ui/button/Button'
import { Tooltip } from '@components/ui/tooltip/Tooltip'
import { APP_NAME } from '@constants/app.constants'
import { NotificationBell } from '@features/notifications/components/NotificationBell'
import { useRefreshWorkTracker } from '@hooks/use-work-tracker'
import { logFailure, toUserMessage } from '@services/errors/error-message'

import './Header.scss'

interface HeaderProps {
  /** Opens the sliding drawer on small screens. */
  onToggleDrawer: () => void
}

/**
 * The bar over the content, and only over the content.
 *
 * It used to span the window and carry five different things: the brand, a rail
 * collapse, a drawer toggle, three controls, and the signed-in person's name and
 * role in text. The rail runs the full height of the window now and begins the
 * layout, so this bar starts where the rail ends — and the control that collapses
 * the rail went to the rail, which is what it acts on.
 *
 * What is left is the application's name and what acts on the application rather
 * than describing it: re-read the data, what has happened, end the session. All
 * three are icons with a tooltip and a hidden label, which is what the row of
 * mixed labelled buttons and text became. Who is signed in is at the foot of the
 * rail, next to their initials, and is a link to their profile rather than a
 * caption.
 */
export function Header({ onToggleDrawer }: HeaderProps) {
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
      {/* The application's name lives here rather than at the head of the rail,
          which is only fifteen rems wide and truncated it to "Team Progress
          Trac…". The bar has the whole width of the content to spell it out. The
          rail keeps the workspace line above the navigation.

          The drawer toggle is here because it is only for the screens where the
          rail is not on one. Its label is the accessible name rather than an
          `aria-label`, which is what `isIconOnly` means: it is rendered and
          hidden, so it cannot be forgotten. */}
      <div className="header__brand">
        <span className="header__drawer-toggle">
          <Button icon="menu" isIconOnly onClick={onToggleDrawer} variant="inverse">
            Open navigation menu
          </Button>
        </span>

        <strong className="header__title">{APP_NAME}</strong>
      </div>

      {/* One guard for the group. Every control in it acts on a session, so there
          is nothing here to draw without one. */}
      {user === null ? null : (
        <div className="header__actions">
          {/* One refresh for the whole application rather than one per screen.
              Every screen renders this shell, so putting it here means it is in
              the same place on all of them — including the ones that write their
              own heading, and the placeholders shown when a screen has nothing
              to display, neither of which has anywhere to hang a button.

              It re-reads whatever the current screen is showing because it
              invalidates the root, so it needs no knowledge of the route.

              `isLoading` rather than `disabled`: with the label hidden, a
              spinner in place of the icon is the only thing left that can say a
              refresh is in flight. It disables the control as well. */}
          <Tooltip
            label={
              refresh.error === null
                ? 'Re-read the latest data'
                : `Refresh failed: ${refresh.error.message}`
            }
          >
            <Button
              icon="refresh"
              isIconOnly
              isLoading={refresh.isPending}
              onClick={() => refresh.mutate()}
              variant="inverse"
            >
              {refresh.isPending ? 'Refreshing…' : 'Refresh'}
            </Button>
          </Tooltip>

          {/* Beside the refresh control rather than out on its own, because both
              are about what the application knows right now. Renders nothing at
              all unless the data source can produce notifications. */}
          <NotificationBell />

          <Tooltip label="Sign out">
            <Button
              icon="sign-out"
              isIconOnly
              onClick={() => void handleSignOut()}
              variant="inverse"
            >
              Sign out
            </Button>
          </Tooltip>
        </div>
      )}
    </header>
  )
}
