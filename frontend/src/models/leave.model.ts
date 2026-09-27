/**
 * A day a developer was on leave, and so owes no daily update. One row per
 * developer per date — the database enforces that, so marking a day twice is a
 * conflict rather than a duplicate.
 */
export interface LeaveDay {
  id: string
  developerId: string
  date: string

  note?: string

  /** The profile that marked the day, which may be an administrator. */
  recordedBy?: string

  createdAt: string
}

export type CreateLeaveDayRequest = Omit<LeaveDay, 'createdAt' | 'id' | 'recordedBy'>

export interface LeaveDayQuery {
  dateFrom?: string
  dateTo?: string
  developerIds?: readonly string[]
}

/** How one working day was accounted for. */
export type UpdateDayState = 'leave' | 'missing' | 'submitted'

export interface UpdateDay {
  date: string
  state: UpdateDayState

  /** The note left with a leave day, when there is one. */
  note?: string
}

export interface DeveloperUpdateCoverage {
  developerId: string
  developerName: string

  /** Every working day in the range, newest first. */
  days: readonly UpdateDay[]

  missingDates: readonly string[]
  leaveDates: readonly string[]

  submittedCount: number
  missingCount: number
  leaveCount: number

  /** The most recent day in range that has an update, if any has. */
  lastSubmittedDate?: string
}

export interface UpdateCoverageTotals {
  developersWithGaps: number
  missingDays: number
  leaveDays: number
}

/**
 * Which working days each visible developer has accounted for. Computed by the
 * Reporting service over rows that already exist, rather than from state
 * written when a day passes, so a day filled in later stops being missing the
 * moment the entry lands.
 */
export interface UpdateCoverage {
  from: string
  to: string
  developers: readonly DeveloperUpdateCoverage[]
  totals: UpdateCoverageTotals
}

export interface UpdateCoverageQuery {
  dateFrom?: string
  dateTo?: string
  developerIds?: readonly string[]
}

/** Asks one developer for their daily update. */
export interface DailyUpdateReminderRequest {
  developerId: string

  /** Appended to the wording as the sender's own words, if given. */
  message?: string
}
