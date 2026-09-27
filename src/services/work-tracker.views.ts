/**
 * What the service hands to a screen, as opposed to what the database stores.
 *
 * These are projections, not domain records: a view is a row with the names of
 * the things it points at already resolved, and an overview is a day or a range
 * with its totals already worked out. They live beside the service rather than
 * in `@models` because they depend on the summary utilities, and `@models` is a
 * leaf that those utilities themselves import from.
 */

import type {
  AssignedTask,
  CommentAuthorRole,
  DailyWorkEntry,
  Developer,
  MentorComment,
} from '@models/index'
import type { DateRange } from '@utils/date.utils'
import type { DailyTrendPoint, StatusBreakdown } from '@utils/work-summary.utils'

export interface DailyWorkEntryView extends DailyWorkEntry {
  developerName: string
  projectName: string
  client?: string
}

export interface AssignedTaskView extends AssignedTask {
  developerName: string
  projectName: string
  mentorName?: string

  isOverdue: boolean
}

export interface MentorCommentView extends MentorComment {
  developerName: string

  /** Who wrote the entry, and in what capacity the trail should label them. */
  authorName: string
  authorRole: CommentAuthorRole

  /** Absent on a developer's own reply, which is attributed to nobody. */
  mentorName?: string

  projectName?: string

  /** Absent when feedback predates task link or the task was deleted. */
  taskName?: string
}

export interface DayOverview {
  date: string
  entries: DailyWorkEntryView[]
  statuses: StatusBreakdown
  completionRate: number
  hoursLogged: number
  developersUpdated: Developer[]

  /** Excludes anybody whose day is accounted for as leave. */
  developersMissingUpdate: Developer[]

  developersOnLeave: Developer[]

  blockedEntries: DailyWorkEntryView[]
}

export interface RangeOverview {
  range: DateRange
  entries: DailyWorkEntryView[]
  statuses: StatusBreakdown
  completionRate: number
  hoursLogged: number
  trend: DailyTrendPoint[]
  blockedEntries: DailyWorkEntryView[]
}
