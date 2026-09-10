import type { TaskPriority, TaskStatus } from '@models/daily-work.model'
import type { ProjectStatus } from '@models/project.model'
import type { UserRole } from '@models/user.model'

/**
 * The workbook contract.
 *
 * Every value in this file is a published interface shared with the Excel
 * file itself. Changing a table name, a column name or an accepted cell value
 * breaks existing data, so treat these as frozen. New columns may be appended
 * to the workbook without changes here; unknown columns are ignored on read.
 */
export const WORKBOOK_FILE_NAME = 'Team-Progress-Tracker.xlsx'

/**
 * Excel table (ListObject) names, not worksheet names.
 *
 * Tables are addressed by name so that rows can be read without depending on
 * worksheet layout, cell ranges or row numbers.
 */
export const EXCEL_TABLES = {
  /** The Employees table of the workbook. */
  developers: 'tblDevelopers',
  mentors: 'tblMentors',
  mentorMapping: 'tblMentorMapping',
  projects: 'tblProjects',
  tasks: 'tblTasks',
  comments: 'tblComments',
  dailyWork: 'tblDailyWork',
} as const

export const DEVELOPER_COLUMNS = {
  developerId: 'DeveloperId',
  developerName: 'DeveloperName',
  role: 'Role',
  location: 'Location',
  active: 'Active',

  /// Appended columns. Existing workbooks without them still read correctly:
  /// a missing column is treated as a blank cell, so `Email` simply means the
  /// row cannot sign in and `AccessRole` defaults to developer.
  email: 'Email',
  accessRole: 'AccessRole',
} as const

export const MENTOR_COLUMNS = {
  mentorId: 'MentorId',
  mentorName: 'MentorName',
  email: 'Email',
  active: 'Active',
} as const

export const MENTOR_MAPPING_COLUMNS = {
  mentorId: 'MentorId',
  developerId: 'DeveloperId',
} as const

export const PROJECT_COLUMNS = {
  projectId: 'ProjectId',
  projectName: 'ProjectName',
  client: 'Client',
  active: 'Active',

  description: 'Description',
  status: 'Status',
  startDate: 'StartDate',
  endDate: 'EndDate',
  mentorId: 'MentorId',
  assignedDevelopers: 'AssignedDevelopers',
} as const

export const TASK_COLUMNS = {
  taskId: 'TaskId',
  taskName: 'TaskName',
  taskDescription: 'TaskDescription',
  projectId: 'ProjectId',
  developerId: 'DeveloperId',
  mentorId: 'MentorId',
  priority: 'Priority',
  status: 'Status',
  createdDate: 'CreatedDate',
  dueDate: 'DueDate',
  updatedAt: 'UpdatedAt',
} as const

export const COMMENT_COLUMNS = {
  commentId: 'CommentId',
  developerId: 'DeveloperId',
  mentorId: 'MentorId',
  projectId: 'ProjectId',
  commentDate: 'CommentDate',
  comment: 'Comment',
  progressUpdate: 'ProgressUpdate',
  blockers: 'Blockers',
  recommendations: 'Recommendations',
  createdAt: 'CreatedAt',
  updatedAt: 'UpdatedAt',
} as const

export const DAILY_WORK_COLUMNS = {
  entryId: 'EntryId',
  date: 'Date',
  developerId: 'DeveloperId',
  projectId: 'ProjectId',
  taskTitle: 'TaskTitle',
  taskDescription: 'TaskDescription',
  status: 'Status',
  priority: 'Priority',
  progress: 'Progress',
  hoursSpent: 'HoursSpent',
  isBlocked: 'IsBlocked',
  blockerDescription: 'BlockerDescription',
  remarks: 'Remarks',
  createdAt: 'CreatedAt',
  updatedAt: 'UpdatedAt',
} as const

/**
 * Columns that must exist for a table to be mappable at all.
 *
 * Descriptive columns are omitted deliberately: a blank `Remarks` column is
 * normal, whereas a missing `EntryId` column means the workbook is wrong.
 */
export const REQUIRED_DEVELOPER_COLUMNS: readonly string[] = [
  DEVELOPER_COLUMNS.developerId,
  DEVELOPER_COLUMNS.developerName,
  DEVELOPER_COLUMNS.active,
]

export const REQUIRED_PROJECT_COLUMNS: readonly string[] = [
  PROJECT_COLUMNS.projectId,
  PROJECT_COLUMNS.projectName,
  PROJECT_COLUMNS.active,
]

export const REQUIRED_MENTOR_COLUMNS: readonly string[] = [
  MENTOR_COLUMNS.mentorId,
  MENTOR_COLUMNS.mentorName,
  MENTOR_COLUMNS.email,
]

export const REQUIRED_MENTOR_MAPPING_COLUMNS: readonly string[] = [
  MENTOR_MAPPING_COLUMNS.mentorId,
  MENTOR_MAPPING_COLUMNS.developerId,
]

export const REQUIRED_TASK_COLUMNS: readonly string[] = [
  TASK_COLUMNS.taskId,
  TASK_COLUMNS.taskName,
  TASK_COLUMNS.projectId,
  TASK_COLUMNS.developerId,
  TASK_COLUMNS.status,
  TASK_COLUMNS.priority,
]

export const REQUIRED_COMMENT_COLUMNS: readonly string[] = [
  COMMENT_COLUMNS.commentId,
  COMMENT_COLUMNS.developerId,
  COMMENT_COLUMNS.mentorId,
  COMMENT_COLUMNS.commentDate,
  COMMENT_COLUMNS.comment,
]

export const REQUIRED_DAILY_WORK_COLUMNS: readonly string[] = [
  DAILY_WORK_COLUMNS.entryId,
  DAILY_WORK_COLUMNS.date,
  DAILY_WORK_COLUMNS.developerId,
  DAILY_WORK_COLUMNS.projectId,
  DAILY_WORK_COLUMNS.taskTitle,
  DAILY_WORK_COLUMNS.status,
  DAILY_WORK_COLUMNS.priority,
  DAILY_WORK_COLUMNS.progress,
]

/**
 * Cell values used by the `Status` column, paired with their domain codes.
 *
 * Read accepts these case-insensitively; write always emits exactly these
 * strings so the workbook stays consistent and filterable by humans.
 */
export const EXCEL_STATUS_VALUES: Readonly<Record<TaskStatus, string>> = {
  'not-started': 'Not Started',
  'in-progress': 'In Progress',
  completed: 'Completed',
  blocked: 'Blocked',
}

export const EXCEL_PRIORITY_VALUES: Readonly<Record<TaskPriority, string>> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
}

export const EXCEL_PROJECT_STATUS_VALUES: Readonly<Record<ProjectStatus, string>> = {
  planned: 'Planned',
  active: 'Active',
  'on-hold': 'On Hold',
  completed: 'Completed',
}

/** Cell values for the Employees `AccessRole` column. */
export const EXCEL_ACCESS_ROLE_VALUES: Readonly<Record<UserRole, string>> = {
  admin: 'Admin',
  mentor: 'Mentor',
  developer: 'Developer',
}

/** Canonical strings written to boolean columns (`Active`, `IsBlocked`). */
export const EXCEL_BOOLEAN_VALUES = { true: 'Yes', false: 'No' } as const

/**
 * Separator for columns holding several ids in one cell.
 *
 * A comma is the natural choice but is also what a person typing into Excel
 * would use inside prose, so a semicolon is less likely to appear by accident.
 * Reads accept either.
 */
export const EXCEL_LIST_SEPARATOR = '; '

/**
 * A row as it arrives from the workbook: column name to raw cell value.
 *
 * Values are `unknown` because Excel returns numbers, strings, booleans or
 * error values for the same column depending on cell formatting. Nothing is
 * trusted until it has been through the row schemas.
 */
export type RawExcelRow = Record<string, unknown>
