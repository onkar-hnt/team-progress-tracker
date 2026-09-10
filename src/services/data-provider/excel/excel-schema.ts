import type { TaskPriority, TaskStatus } from '@models/daily-work.model'

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
  developers: 'tblDevelopers',
  projects: 'tblProjects',
  dailyWork: 'tblDailyWork',
} as const

export const DEVELOPER_COLUMNS = {
  developerId: 'DeveloperId',
  developerName: 'DeveloperName',
  role: 'Role',
  location: 'Location',
  active: 'Active',
} as const

export const PROJECT_COLUMNS = {
  projectId: 'ProjectId',
  projectName: 'ProjectName',
  client: 'Client',
  active: 'Active',
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

/** Canonical strings written to boolean columns (`Active`, `IsBlocked`). */
export const EXCEL_BOOLEAN_VALUES = { true: 'Yes', false: 'No' } as const

/**
 * A row as it arrives from the workbook: column name to raw cell value.
 *
 * Values are `unknown` because Excel returns numbers, strings, booleans or
 * error values for the same column depending on cell formatting. Nothing is
 * trusted until it has been through the row schemas.
 */
export type RawExcelRow = Record<string, unknown>
