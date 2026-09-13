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

export function Header({ onToggleDrawer }: HeaderProps) {
  const { signOut, user } = useAuth()
  const confirm = useConfirm()
  const snackbar = useSnackbar()
  const navigate = useNavigate()
  const refresh = useRefreshWorkTracker()

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
        <span className="header__drawer-toggle">
          <Button icon="menu" isIconOnly onClick={onToggleDrawer} variant="inverse">
            Open navigation menu
          </Button>
        </span>

        <strong className="header__title">{APP_NAME}</strong>
      </div>

      {user === null ? null : (
        <div className="header__actions">
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
