import type { ReactElement } from 'react'

export type IconName =
  | 'activity'
  | 'alert'
  | 'bell'
  | 'calendar'
  | 'chart'
  | 'check'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'close'
  | 'comments'
  | 'dashboard'
  | 'database'
  | 'download'
  | 'eye'
  | 'eye-off'
  | 'filter'
  | 'inbox'
  | 'history'
  | 'info'
  | 'key'
  | 'menu'
  | 'mentors'
  | 'projects'
  | 'refresh'
  | 'sign-out'
  | 'table'
  | 'tasks'
  | 'trash'
  | 'users'
  | 'warning'

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

  history: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 8v4l3 2" />
    </>
  ),
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
  table: (
    <>
      <rect height="16" rx="2" width="18" x="3" y="4" />
      <path d="M3 9h18M9 9v11" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
      <path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </>
  ),
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,

  bell: (
    <>
      <path d="M6 9.5a6 6 0 0 1 12 0c0 3.8 1 5.1 1.7 5.9.4.4.1 1.1-.5 1.1H4.8c-.6 0-.9-.7-.5-1.1C5 14.6 6 13.3 6 9.5z" />
      <path d="M9.5 19a2.5 2.5 0 0 0 5 0" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5M12 16.3h.01" />
    </>
  ),
  check: <path d="M5 12.5 9.5 17 19 7.5" />,
  warning: (
    <>
      <path d="M12 4.5 21 19.5H3z" />
      <path d="M12 10v4M12 17.2h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.8h.01" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  download: (
    <>
      <path d="M12 4v10.5" />
      <path d="M7.5 10.5 12 15l4.5-4.5" />
      <path d="M5 19h14" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12C4.8 8 8.1 6 12 6s7.2 2 9.5 6c-2.3 4-5.6 6-9.5 6s-7.2-2-9.5-6z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  'eye-off': (
    <>
      <path d="M10.6 6.2A9.7 9.7 0 0 1 12 6c3.9 0 7.2 2 9.5 6a15.6 15.6 0 0 1-2.7 3.5" />
      <path d="M6.4 8C4.7 9 3.4 10.3 2.5 12c2.3 4 5.6 6 9.5 6a9.4 9.4 0 0 0 3.2-.5" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="M3.5 3.5l17 17" />
    </>
  ),
  filter: <path d="M4 6.5h16M7 12h10M10 17.5h4" />,
  inbox: (
    <>
      <rect height="14" rx="2" width="18" x="3" y="5" />
      <path d="M3 13h5l1.2 2h5.6L16 13h5" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7.5h16" />
      <path d="M9.5 7.5V5.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2" />
      <path d="M6 7.5 6.9 19a1.5 1.5 0 0 0 1.5 1.4h7.2A1.5 1.5 0 0 0 17.1 19L18 7.5" />
      <path d="M10.5 11.5v5M13.5 11.5v5" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 12a8 8 0 0 1-8 8 8 8 0 0 1-6.7-3.6" />
      <path d="M4 12a8 8 0 0 1 8-8 8 8 0 0 1 6.7 3.6" />
      <path d="M18.7 3.5v4.4h-4.4M5.3 20.5v-4.4h4.4" />
    </>
  ),
  'sign-out': (
    <>
      <path d="M10 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4" />
      <path d="M16.5 8.5 20 12l-3.5 3.5" />
      <path d="M20 12h-9" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="8" r="4" />
      <path d="M10.9 10.9 20 20" />
      <path d="M17.5 17.5 15 20M20 15l-2.5 2.5" />
    </>
  ),

  'chevron-down': <path d="M5.5 9.5 12 16l6.5-6.5" />,
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
