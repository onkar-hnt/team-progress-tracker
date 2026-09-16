/**
 * Every path the frontend asks the gateway for, in one place.
 *
 * Feature services name an entry here instead of writing the path inline, so a
 * route that moves on the backend is a one-line change on this side. Paths are
 * relative to `VITE_API_BASE_URL`; the client joins them.
 */

/** Ids reach the URL escaped, so a value with a slash cannot change the route. */
function segment(value: string): string {
  return encodeURIComponent(value)
}

export const apiEndpoints = {
  /** Identity service: sign-in and the caller's own account. */
  auth: {
    login: 'api/auth/login',
    me: 'api/auth/me',
    changePassword: 'api/auth/change-password',
  },

  /** Identity service: administration of other people's logins. */
  accounts: {
    list: 'api/accounts',
    state: 'api/accounts/state',
    provision: 'api/accounts/provision',
    resetPassword: 'api/accounts/reset-password',
  },

  /** Team service. */
  developers: {
    list: 'api/developers',
    create: 'api/developers',
    byId: (id: string) => `api/developers/${segment(id)}`,
  },

  mentors: {
    list: 'api/mentors',
    create: 'api/mentors',
    byId: (id: string) => `api/mentors/${segment(id)}`,
    assignments: (mentorId: string) => `api/mentors/${segment(mentorId)}/assignments`,
  },

  mentorAssignments: {
    list: 'api/mentor-assignments',
  },

  projects: {
    list: 'api/projects',
    create: 'api/projects',
    byId: (id: string) => `api/projects/${segment(id)}`,
  },

  /** Work service. */
  tasks: {
    list: 'api/tasks',
    create: 'api/tasks',
    byId: (id: string) => `api/tasks/${segment(id)}`,
  },

  dailyUpdates: {
    list: 'api/daily-updates',
    create: 'api/daily-updates',
    byId: (id: string) => `api/daily-updates/${segment(id)}`,
  },

  /** Mentor comments and developer replies on a task. */
  feedback: {
    list: 'api/feedback',
    create: 'api/feedback',
    byId: (id: string) => `api/feedback/${segment(id)}`,
  },

  /** Work service: the audit trail and the 15-day recycle bin. */
  changeLog: {
    recent: 'api/change-log',
    forRecord: (kind: string, recordId: string) =>
      `api/change-log/${segment(kind)}/${segment(recordId)}`,
  },

  recycleBin: {
    list: 'api/recycle-bin',
    restore: (kind: string, id: string) =>
      `api/recycle-bin/${segment(kind)}/${segment(id)}/restore`,
    purge: (kind: string, id: string) => `api/recycle-bin/${segment(kind)}/${segment(id)}`,
  },

  /** Notifications service. */
  notifications: {
    list: 'api/notifications',
    unreadCount: 'api/notifications/unread-count',
    read: (id: string) => `api/notifications/${segment(id)}/read`,
    readAll: 'api/notifications/read-all',
    preferences: 'api/notification-preferences',
  },

  /** Reporting service. */
  reports: {
    usage: 'api/usage',
  },
} as const
