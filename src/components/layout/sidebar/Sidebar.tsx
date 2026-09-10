import { NavLink } from 'react-router-dom'

import { useAuth } from '@app/providers/auth-context'
import type { AppUser } from '@models/user.model'
import { canManageTeam, canSubmitDailyUpdate } from '@services/auth/index'

import './Sidebar.scss'

interface NavigationItem {
  label: string
  path: string
  /** Omitted for items everyone who signs in can reach. */
  isVisible?: (user: AppUser | null) => boolean
}

const navigationItems: readonly NavigationItem[] = [
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'Daily Update', path: '/daily-update', isVisible: canSubmitDailyUpdate },
  { label: 'Team Activity', path: '/team-activity' },
  { label: 'Developers', path: '/developers' },
  { label: 'Reports', path: '/reports' },
  { label: 'Settings', path: '/settings', isVisible: canManageTeam },
]

export function Sidebar() {
  const { user } = useAuth()

  // Hiding a link is presentation only; the route guards do the real blocking.
  const visibleItems = navigationItems.filter((item) => item.isVisible?.(user) ?? true)

  return (
    <aside className="sidebar" aria-label="Primary navigation">
      <nav>
        <ul className="sidebar__list">
          {visibleItems.map(({ label, path }) => (
            <li key={path}>
              <NavLink
                className={({ isActive }) =>
                  `sidebar__link${isActive ? ' sidebar__link--active' : ''}`
                }
                to={path}
              >
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  )
}
