import type { TaskPriority, TaskStatus } from '@models/daily-work.model'
import type { ProjectStatus } from '@models/project.model'
import type { UserRole } from '@models/user.model'

export const WORKBOOK_FILE_NAME = 'Team-Progress-Tracker.xlsx'

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

  return key === undefined ? tableName : EXCEL_SHEETS[key]
}

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

export const EXCEL_RECORD_STATUS_VALUES = { true: 'Active', false: 'Inactive' } as const

export const EXCEL_LIST_SEPARATOR = '; '

export type RawExcelRow = Record<string, unknown>
