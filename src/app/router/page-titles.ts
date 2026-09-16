/** Sidebar labels, repeated here because those are role-dependent. */
const PAGE_TITLES: Readonly<Record<string, string>> = {
  'admin/accounts': 'Logins',
  'admin/employees': 'Employees',
  'admin/mentors': 'Mentors',
  'admin/projects': 'Projects',
  'admin/tasks': 'Tasks',
  'admin/usage': 'Usage',
  'change-log': 'Change Log',
  'daily-update': 'Daily Update',
  dashboard: 'Dashboard',
  developers: 'Developers',
  feedback: 'Feedback',
  'my-tasks': 'My Tasks',
  profile: 'Profile',
  'recently-deleted': 'Recently Deleted',
  reports: 'Reports',
  'team-activity': 'Team Activity',
}

/** Per-record screens name the kind, not the record. */
const DETAIL_TITLES: Readonly<Record<string, string>> = {
  developers: 'Employee',
  tasks: 'Task',
}

export function titleForPath(pathname: string): string | undefined {
  const path = pathname.replace(/^\/+|\/+$/g, '')

  const exact = PAGE_TITLES[path]
  if (exact !== undefined) return exact

  const segments = path.split('/')
  return segments.length === 2 ? DETAIL_TITLES[segments[0] ?? ''] : undefined
}
