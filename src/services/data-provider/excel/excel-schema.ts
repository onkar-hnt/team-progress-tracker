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
  admin: 'tblAdmin',
  /** The Employees table of the workbook. */
  developers: 'tblDevelopers',
  mentors: 'tblMentors',
  mentorMapping: 'tblMentorMapping',
  projects: 'tblProjects',
  tasks: 'tblTasks',
  comments: 'tblComments',
  dailyWork: 'tblDailyWork',
} as const

/**
 * Worksheet names, paired with the table each sheet holds.
 *
 * Two names exist for the same data because the two transports address it
 * differently: Microsoft Graph reads a named Excel *table*, while a file read
 * directly from disk has only worksheets to go on. Keeping both here means
 * one workbook satisfies either route.
 */
export const EXCEL_SHEETS: Readonly<Record<keyof typeof EXCEL_TABLES, string>> = {
  admin: 'Admin',
  developers: 'Developers',
  mentors: 'Mentors',
  mentorMapping: 'MentorMapping',
  projects: 'Projects',
  tasks: 'Tasks',
  comments: 'Comments',
  dailyWork: 'DailyWork',
}

/** Resolves the worksheet holding a given Excel table. */
export function sheetNameForTable(tableName: string): string {
  const key = (Object.keys(EXCEL_TABLES) as (keyof typeof EXCEL_TABLES)[]).find(
    (candidate) => EXCEL_TABLES[candidate] === tableName,
  )

  // Falling back to the table name keeps an unknown table addressable rather
  // than silently reading the wrong sheet.
  return key === undefined ? tableName : EXCEL_SHEETS[key]
}

/**
 * Administrator records.
 *
 * Read-only as far as access is concerned: the bootstrap administrator built
 * into the application is what guarantees somebody can always sign in, and
 * this sheet is the register of everyone who has been granted the role since.
 */
export const ADMIN_COLUMNS = {
  adminId: 'AdminID',
  adminName: 'AdminName',
  email: 'Email',
  role: 'Role',
  createdDate: 'CreatedDate',
  status: 'Status',
} as const

export const DEVELOPER_COLUMNS = {
  developerId: 'DeveloperID',
  employeeId: 'EmployeeID',
  developerName: 'DeveloperName',
  email: 'Email',

  /** Job title, as distinct from `AccessRole`, which governs permissions. */
  role: 'Role',
  location: 'Location',

  /** Primary project. Fuller assignments live in `Projects.AssignedDevelopers`. */
  projectId: 'ProjectID',
  accessRole: 'AccessRole',
  status: 'Status',
  createdDate: 'CreatedDate',
} as const

export const MENTOR_COLUMNS = {
  mentorId: 'MentorID',
  mentorName: 'MentorName',
  email: 'Email',
  status: 'Status',
  createdDate: 'CreatedDate',
} as const

export const MENTOR_MAPPING_COLUMNS = {
  mappingId: 'MappingID',
  mentorId: 'MentorID',
  developerId: 'DeveloperID',
  assignedDate: 'AssignedDate',
  status: 'Status',
} as const

export const PROJECT_COLUMNS = {
  projectId: 'ProjectID',
  projectName: 'ProjectName',
  clientName: 'ClientName',
  description: 'Description',
  startDate: 'StartDate',
  endDate: 'EndDate',

  /** Lifecycle: Planned, Active, On Hold or Completed. */
  status: 'Status',
  mentorId: 'MentorID',
  assignedDevelopers: 'AssignedDevelopers',
} as const

export const TASK_COLUMNS = {
  taskId: 'TaskID',
  projectId: 'ProjectID',
  developerId: 'DeveloperID',
  mentorId: 'MentorID',
  taskTitle: 'TaskTitle',
  taskDescription: 'TaskDescription',
  priority: 'Priority',
  status: 'Status',
  createdDate: 'CreatedDate',
  dueDate: 'DueDate',
  updatedDate: 'UpdatedDate',
} as const

export const COMMENT_COLUMNS = {
  commentId: 'CommentID',
  projectId: 'ProjectID',
  taskId: 'TaskID',
  developerId: 'DeveloperID',
  mentorId: 'MentorID',
  comment: 'Comment',
  commentDate: 'CommentDate',
  progressUpdate: 'ProgressUpdate',
  blockers: 'Blockers',
  recommendations: 'Recommendations',
  createdDate: 'CreatedDate',
  updatedDate: 'UpdatedDate',
} as const

export const DAILY_WORK_COLUMNS = {
  entryId: 'EntryID',
  developerId: 'DeveloperID',
  projectId: 'ProjectID',
  taskId: 'TaskID',
  date: 'Date',
  taskTitle: 'TaskTitle',
  taskDescription: 'TaskDescription',

  /** What was actually achieved, as opposed to the task it belonged to. */
  workDone: 'WorkDone',
  plannedWork: 'PlannedWork',
  status: 'Status',
  priority: 'Priority',
  progress: 'Progress',
  hoursSpent: 'HoursSpent',
  isBlocked: 'IsBlocked',
  blockers: 'Blockers',
  remarks: 'Remarks',
  createdDate: 'CreatedDate',
  updatedDate: 'UpdatedDate',
} as const

/**
 * Columns that must exist for a table to be mappable at all.
 *
 * Descriptive columns are omitted deliberately: a blank `Remarks` column is
 * normal, whereas a missing `EntryId` column means the workbook is wrong.
 */
export const REQUIRED_ADMIN_COLUMNS: readonly string[] = [
  ADMIN_COLUMNS.adminId,
  ADMIN_COLUMNS.adminName,
  ADMIN_COLUMNS.email,
]

export const REQUIRED_DEVELOPER_COLUMNS: readonly string[] = [
  DEVELOPER_COLUMNS.developerId,
  DEVELOPER_COLUMNS.developerName,
  DEVELOPER_COLUMNS.status,
]

export const REQUIRED_PROJECT_COLUMNS: readonly string[] = [
  PROJECT_COLUMNS.projectId,
  PROJECT_COLUMNS.projectName,
  PROJECT_COLUMNS.status,
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
  TASK_COLUMNS.taskTitle,
  TASK_COLUMNS.projectId,
  TASK_COLUMNS.developerId,
  TASK_COLUMNS.status,
  TASK_COLUMNS.priority,
]

export const REQUIRED_COMMENT_COLUMNS: readonly string[] = [
  COMMENT_COLUMNS.commentId,
  COMMENT_COLUMNS.developerId,
  COMMENT_COLUMNS.mentorId,
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

/** Canonical strings written to yes/no columns such as `IsBlocked`. */
export const EXCEL_BOOLEAN_VALUES = { true: 'Yes', false: 'No' } as const

/**
 * Canonical strings for the `Status` column on people and mappings.
 *
 * Distinct from `EXCEL_BOOLEAN_VALUES` because "Active" reads far better than
 * "Yes" against a person's name, and because this is the column that revokes
 * access: setting it to `Inactive` is how somebody is off-boarded without
 * deleting their history. Reads also accept Yes/No/true/false.
 */
export const EXCEL_RECORD_STATUS_VALUES = { true: 'Active', false: 'Inactive' } as const

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
