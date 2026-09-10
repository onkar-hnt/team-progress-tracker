import { useNavigate } from 'react-router-dom'

import { useAuth } from '@app/providers/auth-context'
import { Icon } from '@components/ui/icons/Icon'
import { isAdmin } from '@services/auth/index'

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
          <span className="header__eyebrow">Team workspace</span>
          <strong className="header__title">Team Progress Tracker</strong>
        </div>
      </div>

      <div className="header__account">
        <div className="header__identity">
          <span>{user === null ? 'Mentor' : isAdmin(user) ? 'Mentor (Admin)' : 'Developer'}</span>
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
