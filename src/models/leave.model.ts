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
