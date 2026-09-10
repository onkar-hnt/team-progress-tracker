import { NavLink } from 'react-router-dom'

import { useAuth } from '@app/providers/auth-context'
import { Icon } from '@components/ui/icons/Icon'
import type { IconName } from '@components/ui/icons/Icon'
import type { AppUser } from '@models/user.model'
import { canManageTeam, canSubmitDailyUpdate } from '@services/auth/index'

import './Sidebar.scss'

interface NavigationItem {
  label: string
  path: string
  icon: IconName
  /** Omitted for items everyone who signs in can reach. */
  isVisible?: (user: AppUser | null) => boolean
}

const navigationItems: readonly NavigationItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: 'dashboard' },
  { label: 'Daily Update', path: '/daily-update', icon: 'calendar', isVisible: canSubmitDailyUpdate },
  { label: 'Team Activity', path: '/team-activity', icon: 'activity' },
  { label: 'Developers', path: '/developers', icon: 'users' },
  { label: 'Reports', path: '/reports', icon: 'chart' },
  { label: 'Settings', path: '/settings', icon: 'settings', isVisible: canManageTeam },
]

interface SidebarProps {
  isCollapsed: boolean
  isDrawerOpen: boolean
  /** Lets the shell dismiss the mobile drawer once a link is followed. */
  onNavigate: () => void
}

export function Sidebar({ isCollapsed, isDrawerOpen, onNavigate }: SidebarProps) {
  const { user } = useAuth()

  // Hiding a link is presentation only; the route guards do the real blocking.
  const visibleItems = navigationItems.filter((item) => item.isVisible?.(user) ?? true)

  return (
    <aside
      aria-label="Primary navigation"
      className={`sidebar${isCollapsed ? ' sidebar--collapsed' : ''}${
        isDrawerOpen ? ' sidebar--drawer-open' : ''
      }`}
    >
      <nav>
        <ul className="sidebar__list">
          {visibleItems.map(({ icon, label, path }) => (
            <li key={path}>
              <NavLink
                className={({ isActive }) =>
                  `sidebar__link${isActive ? ' sidebar__link--active' : ''}`
                }
                onClick={onNavigate}
                to={path}
                // When collapsed the label is visually hidden, so the link
                // needs its name from an attribute instead. The title also
                // gives sighted users a hover tooltip on the rail.
                {...(isCollapsed ? { 'aria-label': label, title: label } : {})}
              >
                <span className="sidebar__icon">
                  <Icon name={icon} />
                </span>
                <span className="sidebar__label">{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  )
}
