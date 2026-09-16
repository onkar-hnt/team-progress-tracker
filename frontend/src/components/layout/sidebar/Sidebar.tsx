import { NavLink } from 'react-router-dom'

import { useAuth } from '@app/providers/auth-context'
import { Button } from '@components/ui/button/Button'
import { Icon } from '@components/ui/icons/Icon'
import type { IconName } from '@components/ui/icons/Icon'
import { Tooltip } from '@components/ui/tooltip/Tooltip'
import { APP_EYEBROW } from '@constants/app.constants'
import { USER_ROLE_LABELS } from '@models/user.model'
import type { AppUser } from '@models/user.model'
import { areAccountsAvailable } from '@services/accounts/account.service'
import {
  canDeleteRecords,
  canManageTeam,
  canReadFeedback,
  canSubmitDailyUpdate,
  canViewTeamData,
  canWriteFeedback,
  isAdmin,
} from '@services/auth/index'
import { isHistoryAvailable } from '@services/history/history.service'
import { isRecycleBinAvailable } from '@services/recycle-bin/recycle-bin.service'
import { isUsageAvailable } from '@services/usage/usage.service'
import { initialsOf } from '@utils/name.utils'

import './Sidebar.scss'

interface NavigationItem {
  label: string
  path: string
  icon: IconName
  /** Omitted for items everyone who signs in can reach. */
  isVisible?: (user: AppUser | null) => boolean
}

interface NavigationGroup {
  /** `undefined` for the ungrouped items at the top of the rail. */
  heading?: string
  items: readonly NavigationItem[]
}

function readsOwnFeedbackOnly(user: AppUser | null): boolean {
  return canReadFeedback(user) && !canWriteFeedback(user)
}

function canAdministerLogins(user: AppUser | null): boolean {
  return isAdmin(user) && areAccountsAvailable()
}

function canReadUsage(user: AppUser | null): boolean {
  return isAdmin(user) && isUsageAvailable()
}

function canRestoreDeletedRecords(user: AppUser | null): boolean {
  return isRecycleBinAvailable() && canDeleteRecords(user)
}

function canReadChangeLog(): boolean {
  return isHistoryAvailable()
}

const navigationGroups: readonly NavigationGroup[] = [
  {
    items: [
      { label: 'Dashboard', path: '/dashboard', icon: 'dashboard' },
      {
        label: 'Daily Update',
        path: '/daily-update',
        icon: 'calendar',
        isVisible: canSubmitDailyUpdate,
      },
      { label: 'My Tasks', path: '/my-tasks', icon: 'tasks' },
      {
        label: 'My Feedback',
        path: '/feedback',
        icon: 'comments',
        isVisible: readsOwnFeedbackOnly,
      },
      {
        label: 'Change Log',
        path: '/change-log',
        icon: 'history',
        isVisible: canReadChangeLog,
      },
    ],
  },
  {
    heading: 'Team',
    items: [
      { label: 'Team Activity', path: '/team-activity', icon: 'activity', isVisible: canViewTeamData },
      { label: 'Developers', path: '/developers', icon: 'users', isVisible: canViewTeamData },
      { label: 'Feedback', path: '/feedback', icon: 'comments', isVisible: canWriteFeedback },
      { label: 'Reports', path: '/reports', icon: 'chart', isVisible: canViewTeamData },
    ],
  },
  {
    heading: 'Administration',
    items: [
      { label: 'Mentors', path: '/admin/mentors', icon: 'mentors', isVisible: canManageTeam },
      { label: 'Employees', path: '/admin/employees', icon: 'users', isVisible: canManageTeam },
      { label: 'Projects', path: '/admin/projects', icon: 'projects', isVisible: canManageTeam },
      { label: 'Tasks', path: '/admin/tasks', icon: 'tasks', isVisible: canManageTeam },
      { label: 'Logins', path: '/admin/accounts', icon: 'key', isVisible: canAdministerLogins },
      { label: 'Usage', path: '/admin/usage', icon: 'database', isVisible: canReadUsage },
      {
        label: 'Recently Deleted',
        path: '/recently-deleted',
        icon: 'trash',
        isVisible: canRestoreDeletedRecords,
      },
    ],
  },
]

interface SidebarProps {
  isCollapsed: boolean
  isDrawerOpen: boolean
  /** Lets the shell dismiss the mobile drawer once a link is followed. */
  onNavigate: () => void
  /** Collapses the rail to icons on desktop. */
  onToggleSidebar: () => void
}

function ProfileLink({
  isCollapsed,
  onNavigate,
  user,
}: {
  isCollapsed: boolean
  onNavigate: () => void
  user: AppUser
}) {
  const role = USER_ROLE_LABELS[user.role]

  return (
    <div className="sidebar__footer">
      <Tooltip label={isCollapsed ? `${user.name} — your profile` : ''} side="right">
        <NavLink
          // Visible text is the name; aria-label adds destination for collapsed rail.
          aria-label={`Your profile: ${user.name}, ${role}`}
          className={({ isActive }) =>
            `sidebar__link sidebar__link--profile${isActive ? ' sidebar__link--active' : ''}`
          }
          onClick={onNavigate}
          to="/profile"
        >
          <span aria-hidden="true" className="sidebar__avatar">
            {initialsOf(user.name, user.email)}
          </span>

          <span className="sidebar__label sidebar__label--profile">
            <span className="sidebar__person">{user.name}</span>
            <span className="sidebar__caption">{role}</span>
          </span>
        </NavLink>
      </Tooltip>
    </div>
  )
}

function SidebarHead({
  isCollapsed,
  onToggleSidebar,
}: {
  isCollapsed: boolean
  onToggleSidebar: () => void
}) {
  const label = isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'

  return (
    <div className="sidebar__head">
      <span className="sidebar__workspace">{APP_EYEBROW}</span>

      <Tooltip label={isCollapsed ? label : ''} side="right">
        <Button
          aria-pressed={isCollapsed}
          icon={isCollapsed ? 'chevron-right' : 'chevron-left'}
          isIconOnly
          onClick={onToggleSidebar}
          variant="ghost"
        >
          {label}
        </Button>
      </Tooltip>
    </div>
  )
}

export function Sidebar({
  isCollapsed,
  isDrawerOpen,
  onNavigate,
  onToggleSidebar,
}: SidebarProps) {
  const { user } = useAuth()

  // Route guards enforce access; drop groups with no visible items.
  const visibleGroups = navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.isVisible?.(user) ?? true),
    }))
    .filter((group) => group.items.length > 0)

  return (
    <aside
      aria-label="Primary navigation"
      className={`sidebar${isCollapsed ? ' sidebar--collapsed' : ''}${
        isDrawerOpen ? ' sidebar--drawer-open' : ''
      }`}
    >
      <SidebarHead isCollapsed={isCollapsed} onToggleSidebar={onToggleSidebar} />

      {/* Only the nav scrolls; head and profile stay fixed. */}
      <nav className="sidebar__nav">
        {visibleGroups.map((group, index) => (
          <div className="sidebar__group" key={group.heading ?? `group-${String(index)}`}>
            {group.heading === undefined ? null : (
              <h2 className="sidebar__heading">{group.heading}</h2>
            )}

            <ul className="sidebar__list">
              {group.items.map(({ icon, label, path }) => (
                <li key={path}>
                  <Tooltip label={isCollapsed ? label : ''} side="right">
                    <NavLink
                      className={({ isActive }) =>
                        `sidebar__link${isActive ? ' sidebar__link--active' : ''}`
                      }
                      onClick={onNavigate}
                      to={path}
                      {...(isCollapsed ? { 'aria-label': label } : {})}
                    >
                      <span className="sidebar__icon">
                        <Icon name={icon} />
                      </span>
                      <span className="sidebar__label">{label}</span>
                    </NavLink>
                  </Tooltip>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Outside nav — account control, not a destination. */}
      {user === null ? null : (
        <ProfileLink isCollapsed={isCollapsed} onNavigate={onNavigate} user={user} />
      )}
    </aside>
  )
}
