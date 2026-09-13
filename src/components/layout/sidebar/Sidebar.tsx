import { NavLink } from 'react-router-dom'

import { useAuth } from '@app/providers/auth-context'
import { Icon } from '@components/ui/icons/Icon'
import type { IconName } from '@components/ui/icons/Icon'
import { Tooltip } from '@components/ui/tooltip/Tooltip'
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
    ],
  },
]

interface SidebarProps {
  isCollapsed: boolean
  isDrawerOpen: boolean
  /** Lets the shell dismiss the mobile drawer once a link is followed. */
  onNavigate: () => void
}

/**
 * Somebody's initials, for the avatar at the foot of the rail.
 *
 * The first letter of the first word and of the last, so "Shubham Deshmukh" gives
 * SD and a one-word name gives one letter rather than two from the same word. Two
 * is the limit because the circle is sized for two: a third would either shrink
 * the text below legibility or widen the rail.
 *
 * Falls back to the local part of the address, and then to a dash, so the circle
 * is never empty. It is decorative in any case — the link is named by the text
 * beside it, which is why this is `aria-hidden` at the call site.
 */
function initialsFrom(name: string, email: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word !== '')

  const first = words[0]?.[0] ?? email.trim()[0] ?? '-'
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : ''

  return `${first}${last}`.toUpperCase()
}

/**
 * The signed-in person, and the way to their own profile.
 *
 * At the foot of the rail rather than in a group, which is where an account
 * control is looked for, and separated from the navigation above it because it is
 * about the reader rather than about the work. It replaced a "Settings" link
 * under Administration that only administrators and mentors could see — the
 * screen behind it is now mostly a person's own account, so everybody has one and
 * it is reached through their own name.
 *
 * Rendered here rather than added to `navigationGroups`, because it is the one
 * entry drawn from data instead of from a fixed list: an avatar of initials in
 * place of an icon, and the person's name in place of a label.
 */
function ProfileLink({
  isCollapsed,
  onNavigate,
  user,
}: {
  isCollapsed: boolean
  onNavigate: () => void
  user: AppUser
}) {
  return (
    <div className="sidebar__footer">
      <Tooltip label={isCollapsed ? `${user.name} — Profile` : ''} side="right">
        <NavLink
          className={({ isActive }) =>
            `sidebar__link sidebar__link--profile${isActive ? ' sidebar__link--active' : ''}`
          }
          onClick={onNavigate}
          to="/profile"
          // Collapsed, the name and the word Profile are both out of the layout,
          // so the link would otherwise be named by two hidden letters.
          {...(isCollapsed ? { 'aria-label': `Profile: ${user.name}` } : {})}
        >
          <span aria-hidden="true" className="sidebar__avatar">
            {initialsFrom(user.name, user.email)}
          </span>

          {/* Two lines: who, then where the link goes. The name alone would leave
              the destination to be guessed from an avatar, and "Profile" alone
              would waste the one place the rail can say who is signed in. */}
          <span className="sidebar__label sidebar__label--profile">
            <span className="sidebar__person">{user.name}</span>
            <span className="sidebar__caption">Profile</span>
          </span>
        </NavLink>
      </Tooltip>
    </div>
  )
}

export function Sidebar({ isCollapsed, isDrawerOpen, onNavigate }: SidebarProps) {
  const { user } = useAuth()

  // Hiding a link is presentation only; the route guards do the real blocking.
  // Groups left with no visible items are dropped rather than rendered as a
  // bare heading.
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
                  {/* Named beside the rail only while it is a rail. With the
                      labels showing there is nothing left to explain, and an
                      empty label is how `Tooltip` is asked to stay out of it. */}
                  <Tooltip label={isCollapsed ? label : ''} side="right">
                    <NavLink
                      className={({ isActive }) =>
                        `sidebar__link${isActive ? ' sidebar__link--active' : ''}`
                      }
                      onClick={onNavigate}
                      to={path}
                      // When collapsed the label is visually hidden, so the link
                      // needs its name from an attribute instead.
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

      {/* Outside the `<nav>`: it is an account control rather than one of the
          places the application goes, and `nav` landmarks are read out as a list
          of destinations. Absent only where there is no session to describe,
          which is a state this shell is never mounted in. */}
      {user === null ? null : (
        <ProfileLink isCollapsed={isCollapsed} onNavigate={onNavigate} user={user} />
      )}
    </aside>
  )
}
