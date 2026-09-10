/**
 * A project that daily work can be logged against.
 *
 * `id` mirrors the `ProjectId` column in `tblProjects`. The project list is
 * configuration data owned by the workbook, not by the application.
 */
export interface Project {
  id: string
  name: string
  client?: string
  active: boolean
}
