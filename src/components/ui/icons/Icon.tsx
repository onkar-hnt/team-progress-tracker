import type { ReactElement } from 'react'

/**
 * Inline icon set.
 *
 * Hand-written SVG rather than an icon package: the application needs a
 * dozen glyphs, and inlining them avoids a dependency and a second network
 * request. Icons are decorative here because every one sits next to a text
 * label or an accessible name on the control itself.
 */

export type IconName =
  | 'activity'
  | 'calendar'
  | 'chart'
  | 'chevron-left'
  | 'chevron-right'
  | 'comments'
  | 'dashboard'
  | 'menu'
  | 'mentors'
  | 'projects'
  | 'settings'
  | 'table'
  | 'tasks'
  | 'users'

const PATHS: Readonly<Record<IconName, ReactElement>> = {
  dashboard: (
    <>
      <rect height="7" rx="1.5" width="7" x="3" y="3" />
      <rect height="7" rx="1.5" width="7" x="14" y="3" />
      <rect height="7" rx="1.5" width="7" x="14" y="14" />
      <rect height="7" rx="1.5" width="7" x="3" y="14" />
    </>
  ),
  calendar: (
    <>
      <rect height="16" rx="2" width="18" x="3" y="5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <path d="M8 14h4" />
    </>
  ),
  activity: <path d="M3 12h4l3 7 4-14 3 7h4" />,
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 5.5a3.5 3.5 0 0 1 0 7M18 20a6.6 6.6 0 0 0-2-4.7" />
    </>
  ),
  mentors: (
    <>
      <circle cx="10" cy="8" r="3.5" />
      <path d="M3.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16.5 9.5l1.8 1.8L22 7.5" />
    </>
  ),
  projects: (
    <>
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v7.5A1.5 1.5 0 0 1 17.5 19h-13A1.5 1.5 0 0 1 3 17.5z" />
      <path d="M3 11h16" />
    </>
  ),
  tasks: (
    <>
      <rect height="17" rx="2" width="14" x="5" y="4" />
      <path d="M9 4.5h6M8.5 11l2 2 4-4M8.5 16.5h5" />
    </>
  ),
  comments: (
    <>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v8A1.5 1.5 0 0 1 18.5 15H9l-5 4z" />
      <path d="M8 8h8M8 11h5" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20h16" />
      <path d="M7 20v-7M12 20V6M17 20v-10" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h10M18 7h2M4 12h4M12 12h8M4 17h9M17 17h3" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="15" cy="17" r="2" />
    </>
  ),
  table: (
    <>
      <rect height="16" rx="2" width="18" x="3" y="4" />
      <path d="M3 9h18M9 9v11" />
    </>
  ),
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  'chevron-left': <path d="M14.5 5.5 8 12l6.5 6.5" />,
  'chevron-right': <path d="M9.5 5.5 16 12l-6.5 6.5" />,
}

interface IconProps {
  name: IconName
  /** Edge length in pixels; icons are square. */
  size?: number
}

export function Icon({ name, size = 20 }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className="icon"
      fill="none"
      focusable="false"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      viewBox="0 0 24 24"
      width={size}
    >
      {PATHS[name]}
    </svg>
  )
}
