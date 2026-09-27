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

  /** Days accounted for as leave, which is why no update exists for them. */
  leaveDays: {
    list: 'api/leave-days',
    create: 'api/leave-days',
    byId: (id: string) => `api/leave-days/${segment(id)}`,
  },

  projects: {
    list: 'api/projects',
    create: 'api/projects',
    byId: (id: string) => `api/projects/${segment(id)}`,

    /** The projects a mentor is responsible for, which narrows what they read. */
    responsible: 'api/projects/responsible',
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

    /** Asks one developer for their update. The wording is built server-side. */
    reminders: 'api/daily-updates/reminders',
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

    /** Which working days each visible employee has accounted for, and how. */
    updateCoverage: 'api/reports/update-coverage',
  },
} as const
