import { useState } from 'react'
import { NavLink } from 'react-router-dom'

import { useAuth } from '@app/providers/auth-context'
import { Icon } from '@components/ui/icons/Icon'
import type { IconName } from '@components/ui/icons/Icon'
import type { AppUser } from '@models/user.model'
import {
  canManageTeam,
  canReadFeedback,
  canSubmitDailyUpdate,
  canViewTeamData,
  canWriteFeedback,
} from '@services/auth/index'

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

/**
 * Whether feedback is only ever read here, never written.
 *
 * The feedback screen serves both roles, so it appears in the group and under
 * the name that fits the person looking at it: personal for a developer
 * reading what was written about them, team-wide for a mentor writing it. The
 * two predicates are mutually exclusive, so only one link ever renders.
 */
function readsOwnFeedbackOnly(user: AppUser | null): boolean {
  return canReadFeedback(user) && !canWriteFeedback(user)
}

/**
 * Navigation grouped by who it is for.
 *
 * Team-wide and administrative areas are kept in labelled groups so it is
 * obvious at a glance which links show other people's data. A developer sees
 * only the first group, and so has no link that leads anywhere they cannot go.
 */
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
      { label: 'Settings', path: '/settings', icon: 'settings', isVisible: canManageTeam },
    ],
  },
]

interface SidebarProps {
  isCollapsed: boolean
  isDrawerOpen: boolean
  /** Lets the shell dismiss the mobile drawer once a link is followed. */
  onNavigate: () => void
}

/** The label showing beside the rail, and which row it belongs to. */
interface RailTooltip {
  label: string

  /** The middle of the link, in viewport coordinates. */
  top: number
}

export function Sidebar({ isCollapsed, isDrawerOpen, onNavigate }: SidebarProps) {
  const { user } = useAuth()

  const [tooltip, setTooltip] = useState<RailTooltip | null>(null)

  // Hiding a link is presentation only; the route guards do the real blocking.
  // Groups left with no visible items are dropped rather than rendered as a
  // bare heading.
  const visibleGroups = navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.isVisible?.(user) ?? true),
    }))
    .filter((group) => group.items.length > 0)

  // Measured on the way in rather than placed by stylesheet. The rail scrolls
  // its own overflow, so a tooltip positioned inside it would be cut off at the
  // edge — it has to be `fixed`, and a fixed box needs to be told where the
  // link it belongs to ended up.
  const openTooltip = (element: HTMLElement, label: string) => {
    if (!isCollapsed) return

    const rect = element.getBoundingClientRect()
    setTooltip({ label, top: rect.top + rect.height / 2 })
  }

  return (
    <aside
      aria-label="Primary navigation"
      className={`sidebar${isCollapsed ? ' sidebar--collapsed' : ''}${
        isDrawerOpen ? ' sidebar--drawer-open' : ''
      }`}
    >
      <nav>
        {visibleGroups.map((group, index) => (
          <div className="sidebar__group" key={group.heading ?? `group-${String(index)}`}>
            {/* The heading is hidden on the collapsed rail, where there is no
                room for it, but stays available to screen readers. */}
            {group.heading === undefined ? null : (
              <h2 className="sidebar__heading">{group.heading}</h2>
            )}

            <ul className="sidebar__list">
              {group.items.map(({ icon, label, path }) => (
                <li key={path}>
                  <NavLink
                    className={({ isActive }) =>
                      `sidebar__link${isActive ? ' sidebar__link--active' : ''}`
                    }
                    onBlur={() => setTooltip(null)}
                    onClick={onNavigate}
                    onFocus={(event) => openTooltip(event.currentTarget, label)}
                    onPointerEnter={(event) => openTooltip(event.currentTarget, label)}
                    onPointerLeave={() => setTooltip(null)}
                    to={path}
                    // When collapsed the label is visually hidden, so the link
                    // needs its name from an attribute instead. No `title`: the
                    // browser's own tooltip cannot be styled, appears after a
                    // delay it decides, and sits wherever the cursor happens to
                    // be. `sidebar__tooltip` does that job.
                    {...(isCollapsed ? { 'aria-label': label } : {})}
                  >
                    <span className="sidebar__icon">
                      <Icon name={icon} />
                    </span>
                    <span className="sidebar__label">{label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* One tooltip, moved to whichever link is under the cursor, rather than
          one per link that is hidden until wanted.

          `aria-hidden`, because it repeats the name the link already carries in
          `aria-label`. A screen reader announcing both would say it twice. */}
      {!isCollapsed || tooltip === null ? null : (
        <span aria-hidden="true" className="sidebar__tooltip" style={{ top: tooltip.top }}>
          {tooltip.label}
        </span>
      )}
    </aside>
  )
}
