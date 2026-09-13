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
 * Whether the Logins screen is worth offering.
 *
 * Two conditions rather than one. Administrators only, because the controls on
 * that screen are refused for everybody else — and only where logins exist at
 * all, since the offline data sources have no auth accounts to administer and the
 * screen would say so and nothing more.
 */
function canAdministerLogins(user: AppUser | null): boolean {
  return isAdmin(user) && areAccountsAvailable()
}

/**
 * Whether there is a bin worth looking in.
 *
 * Two conditions, and the second was added after the first proved not to be enough.
 * The data source has to keep what it deletes, because the offline providers remove the
 * row outright and the screen would have nothing to list. And the person has to be able
 * to delete something in the first place: every Delete in the application is on an
 * administrator's or a mentor's screen, so a developer's bin was a link to an empty
 * table — see `canDeleteRecords`, which carries the argument.
 */
function canRestoreDeletedRecords(user: AppUser | null): boolean {
  return isRecycleBinAvailable() && canDeleteRecords(user)
}

/**
 * Whether there is a log to read.
 *
 * The same shape as the bin above, and the same reasoning: the log holds the history
 * of the records the person may see, so it needs no role test, and only Supabase can
 * keep one — a workbook has no trigger to catch a write and nobody to attribute it
 * to. Without it the link would lead to a placeholder explaining that.
 */
function canReadChangeLog(): boolean {
  return isHistoryAvailable()
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

      /* Moved out of the personal group, where it sat while everybody had one. It is now
         shown to the people who can delete something, and what they can delete is mostly
         other people's — which makes it a maintenance screen rather than one of "mine". */
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
 * The name and role were a caption in the bar until this existed, stated and not
 * linked to anything. Here they are the label of the link to the screen they
 * describe, which is one fewer thing on the bar and one less place to explain.
 *
 * Rendered here rather than added to `navigationGroups`, because it is the one
 * entry drawn from data instead of from a fixed list: an avatar of initials in
 * place of an icon, and the person in place of a label.
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
  const role = USER_ROLE_LABELS[user.role]

  return (
    <div className="sidebar__footer">
      <Tooltip label={isCollapsed ? `${user.name} — your profile` : ''} side="right">
        <NavLink
          // The visible text says who, not where, so the name is spelled out
          // again here with the destination in front of it — both because the
          // collapsed rail has nothing but two letters to be named by, and
          // because "Shubham Deshmukh, Developer" is not on its own a link
          // anybody can predict.
          aria-label={`Your profile: ${user.name}, ${role}`}
          className={({ isActive }) =>
            `sidebar__link sidebar__link--profile${isActive ? ' sidebar__link--active' : ''}`
          }
          onClick={onNavigate}
          to="/profile"
        >
          <span aria-hidden="true" className="sidebar__avatar">
            {initialsFrom(user.name, user.email)}
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

/**
 * Which workspace this is, and the control that collapses the rail.
 *
 * The collapse control was in the bar across the top until the rail was given the
 * full height of the window. The bar now starts where the rail ends, so it has no
 * strip above the rail to sit in — and a control that collapses this thing reads
 * better attached to it than beside an application name.
 *
 * Only the workspace line, not the application's name: the rail is a fixed fifteen
 * rems and truncated the name to "Team Progress Trac…", so the name is in the bar,
 * which has the width for it. Collapsed, this line goes too and the button centres
 * itself in what is left, which is a square the width of the rail.
 *
 * Held to the same height as the bar beside it, so the two agree along one line
 * across the top of the window.
 *
 * Absent below the tablet breakpoint: the rail is a drawer under the bar there,
 * the bar names the application itself, and there is no rail to collapse.
 */
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
      <SidebarHead isCollapsed={isCollapsed} onToggleSidebar={onToggleSidebar} />

      {/* The only part of the rail that scrolls. The head and the profile link
          stay put, so a long list of projects cannot push either off the end. */}
      <nav className="sidebar__nav">
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
