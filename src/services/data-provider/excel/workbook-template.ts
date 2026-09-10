import {
  ADMIN_COLUMNS,
  COMMENT_COLUMNS,
  DAILY_WORK_COLUMNS,
  DEVELOPER_COLUMNS,
  EXCEL_SHEETS,
  EXCEL_TABLES,
  MENTOR_COLUMNS,
  MENTOR_MAPPING_COLUMNS,
  PROJECT_COLUMNS,
  TASK_COLUMNS,
} from './excel-schema'

/**
 * The structure of the workbook, in one place.
 *
 * This drives three things that must never disagree: creating a new workbook,
 * checking that an opened one is usable, and telling somebody what is missing
 * when it is not. Deriving all three from a single definition is what stops
 * the file and the application drifting apart.
 */

export interface SheetTemplate {
  sheetName: string
  tableName: string
  columns: readonly string[]

  /** Shown in the UI to explain what belongs in the sheet. */
  description: string
}

/** Column order is the order they appear in a newly created workbook. */
export const WORKBOOK_TEMPLATE: readonly SheetTemplate[] = [
  {
    sheetName: EXCEL_SHEETS.admin,
    tableName: EXCEL_TABLES.admin,
    description:
      'Administrators. A register of who holds the role — the built-in bootstrap account can always sign in regardless.',
    columns: [
      ADMIN_COLUMNS.adminId,
      ADMIN_COLUMNS.adminName,
      ADMIN_COLUMNS.email,
      ADMIN_COLUMNS.role,
      ADMIN_COLUMNS.createdDate,
      ADMIN_COLUMNS.status,
    ],
  },
  {
    sheetName: EXCEL_SHEETS.developers,
    tableName: EXCEL_TABLES.developers,
    description:
      'Everyone who can sign in or be assigned work. AccessRole decides their permissions.',
    columns: [
      DEVELOPER_COLUMNS.developerId,
      DEVELOPER_COLUMNS.employeeId,
      DEVELOPER_COLUMNS.developerName,
      DEVELOPER_COLUMNS.email,
      DEVELOPER_COLUMNS.role,
      DEVELOPER_COLUMNS.location,
      DEVELOPER_COLUMNS.projectId,
      DEVELOPER_COLUMNS.accessRole,
      DEVELOPER_COLUMNS.status,
      DEVELOPER_COLUMNS.createdDate,
    ],
  },
  {
    sheetName: EXCEL_SHEETS.mentors,
    tableName: EXCEL_TABLES.mentors,
    description: 'Mentor records. Somebody who also logs work needs a row in Developers too.',
    columns: [
      MENTOR_COLUMNS.mentorId,
      MENTOR_COLUMNS.mentorName,
      MENTOR_COLUMNS.email,
      MENTOR_COLUMNS.status,
      MENTOR_COLUMNS.createdDate,
    ],
  },
  {
    sheetName: EXCEL_SHEETS.mentorMapping,
    tableName: EXCEL_TABLES.mentorMapping,
    description:
      'One row per mentor–developer pair. This is what decides which developers a mentor can see.',
    columns: [
      MENTOR_MAPPING_COLUMNS.mappingId,
      MENTOR_MAPPING_COLUMNS.mentorId,
      MENTOR_MAPPING_COLUMNS.developerId,
      MENTOR_MAPPING_COLUMNS.assignedDate,
      MENTOR_MAPPING_COLUMNS.status,
    ],
  },
  {
    sheetName: EXCEL_SHEETS.projects,
    tableName: EXCEL_TABLES.projects,
    description: 'Projects, their clients, and the developers assigned to them.',
    columns: [
      PROJECT_COLUMNS.projectId,
      PROJECT_COLUMNS.projectName,
      PROJECT_COLUMNS.clientName,
      PROJECT_COLUMNS.description,
      PROJECT_COLUMNS.startDate,
      PROJECT_COLUMNS.endDate,
      PROJECT_COLUMNS.status,
      PROJECT_COLUMNS.mentorId,
      PROJECT_COLUMNS.assignedDevelopers,
    ],
  },
  {
    sheetName: EXCEL_SHEETS.tasks,
    tableName: EXCEL_TABLES.tasks,
    description:
      'Work assigned to developers. Titles and descriptions are written in the application, never seeded here.',
    columns: [
      TASK_COLUMNS.taskId,
      TASK_COLUMNS.projectId,
      TASK_COLUMNS.developerId,
      TASK_COLUMNS.mentorId,
      TASK_COLUMNS.taskTitle,
      TASK_COLUMNS.taskDescription,
      TASK_COLUMNS.priority,
      TASK_COLUMNS.status,
      TASK_COLUMNS.createdDate,
      TASK_COLUMNS.dueDate,
      TASK_COLUMNS.updatedDate,
    ],
  },
  {
    sheetName: EXCEL_SHEETS.comments,
    tableName: EXCEL_TABLES.comments,
    description: 'Mentor feedback recorded against a developer.',
    columns: [
      COMMENT_COLUMNS.commentId,
      COMMENT_COLUMNS.projectId,
      COMMENT_COLUMNS.developerId,
      COMMENT_COLUMNS.mentorId,
      COMMENT_COLUMNS.comment,
      COMMENT_COLUMNS.commentDate,
      COMMENT_COLUMNS.progressUpdate,
      COMMENT_COLUMNS.blockers,
      COMMENT_COLUMNS.recommendations,
      COMMENT_COLUMNS.createdDate,
      COMMENT_COLUMNS.updatedDate,
    ],
  },
  {
    sheetName: EXCEL_SHEETS.dailyWork,
    tableName: EXCEL_TABLES.dailyWork,
    description:
      'Every daily update, for every person and date. There are deliberately no per-date sheets.',
    columns: [
      DAILY_WORK_COLUMNS.entryId,
      DAILY_WORK_COLUMNS.developerId,
      DAILY_WORK_COLUMNS.projectId,
      DAILY_WORK_COLUMNS.date,
      DAILY_WORK_COLUMNS.taskTitle,
      DAILY_WORK_COLUMNS.taskDescription,
      DAILY_WORK_COLUMNS.workDone,
      DAILY_WORK_COLUMNS.plannedWork,
      DAILY_WORK_COLUMNS.status,
      DAILY_WORK_COLUMNS.priority,
      DAILY_WORK_COLUMNS.progress,
      DAILY_WORK_COLUMNS.hoursSpent,
      DAILY_WORK_COLUMNS.isBlocked,
      DAILY_WORK_COLUMNS.blockers,
      DAILY_WORK_COLUMNS.remarks,
      DAILY_WORK_COLUMNS.createdDate,
      DAILY_WORK_COLUMNS.updatedDate,
    ],
  },
]

export function templateForSheet(sheetName: string): SheetTemplate | undefined {
  return WORKBOOK_TEMPLATE.find((sheet) => sheet.sheetName === sheetName)
}
