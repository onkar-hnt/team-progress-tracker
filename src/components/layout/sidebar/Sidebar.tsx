import { NavLink } from 'react-router-dom'
import './Sidebar.scss'

const navigationItems = [
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'Daily Update', path: '/daily-update' },
  { label: 'Team Activity', path: '/team-activity' },
  { label: 'Developers', path: '/developers' },
  { label: 'Reports', path: '/reports' },
] as const

export function Sidebar() {
  return (
    <aside className="sidebar" aria-label="Primary navigation">
      <nav><ul className="sidebar__list">
        {navigationItems.map(({ label, path }) => (
          <li key={path}><NavLink className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`} to={path}>{label}</NavLink></li>
        ))}
      </ul></nav>
    </aside>
  )
}
