import { WORKBOOK_TEMPLATE } from './workbook-template'
import type { WorkbookGateway, WorkbookStructure } from './workbook-gateway'

/**
 * Brings the Admin workbook up to the agreed structure.
 *
 * The workbook is edited by people as well as by this application, so it can
 * be missing a sheet, missing a table, or missing a column that was added to
 * the contract after the file was created. Rather than let that surface as
 * every screen failing on read, the structure is checked in one place and
 * repaired where the transport allows it.
 *
 * The operation is idempotent, and deliberately conservative about how:
 *
 * - a table is created only when `describeStructure` did not report it, so a
 *   second run finds it and does nothing
 * - a column is added only when absent from that table's header, so headers
 *   cannot be duplicated
 * - nothing is ever deleted, renamed, reordered or rewritten, so no existing
 *   row or hand-made column can be lost
 * - columns present in the workbook but absent from the template are left
 *   alone, matching the read rule that unknown columns are ignored
 *
 * Running it against a correct workbook therefore changes nothing and reports
 * nothing, which is what makes it safe to call on every admin sign-in.
 */

/** A table that exists but is missing columns the template defines. */
export interface MissingColumns {
  tableName: string
  columns: string[]
}

export interface WorkbookStructureReport {
  /** True when every template table and column is present. */
  isReady: boolean

  /** Whether the transport is able to repair what is missing. */
  canRepair: boolean

  /** Still missing after this run. Non-empty only when repair is unavailable. */
  missingTables: string[]
  missingColumns: MissingColumns[]

  /** What this particular run changed. Empty on every subsequent run. */
  createdTables: string[]
  addedColumns: MissingColumns[]
}

/**
 * Reports what the workbook is missing, without changing anything.
 *
 * Separate from the repair so the answer can be shown to an administrator on
 * a read-only connection, where creating anything would fail.
 */
export async function inspectAdminWorkbookStructure(
  gateway: WorkbookGateway,
): Promise<{ missingTables: string[]; missingColumns: MissingColumns[] }> {
  return diffAgainstTemplate(await gateway.describeStructure())
}

export async function ensureAdminWorkbookStructure(
  gateway: WorkbookGateway,
): Promise<WorkbookStructureReport> {
  // Checked first so an unreachable or unauthorised workbook is reported as a
  // connection problem rather than as a workbook missing all eight tables.
  await gateway.validateConnection()

  const initial = await inspectAdminWorkbookStructure(gateway)
  const createdTables: string[] = []
  const addedColumns: MissingColumns[] = []

  if (gateway.canManageStructure) {
    for (const tableName of initial.missingTables) {
      const template = WORKBOOK_TEMPLATE.find((sheet) => sheet.tableName === tableName)
      if (template === undefined) continue

      await gateway.createTable({
        sheetName: template.sheetName,
        tableName: template.tableName,
        columns: template.columns,
      })

      createdTables.push(tableName)
    }

    for (const missing of initial.missingColumns) {
      await gateway.addColumns(missing.tableName, missing.columns)
      addedColumns.push(missing)
    }
  }

  // Re-read rather than assume the writes landed: the report is what an
  // administrator acts on, so it has to describe the workbook as it now is.
  const remaining = gateway.canManageStructure
    ? await inspectAdminWorkbookStructure(gateway)
    : initial

  return {
    isReady: remaining.missingTables.length === 0 && remaining.missingColumns.length === 0,
    canRepair: gateway.canManageStructure,
    missingTables: remaining.missingTables,
    missingColumns: remaining.missingColumns,
    createdTables,
    addedColumns,
  }
}

function diffAgainstTemplate(structure: WorkbookStructure): {
  missingTables: string[]
  missingColumns: MissingColumns[]
} {
  const byName = new Map(structure.tables.map((table) => [table.name, table]))
  const missingTables: string[] = []
  const missingColumns: MissingColumns[] = []

  for (const template of WORKBOOK_TEMPLATE) {
    const existing = byName.get(template.tableName)

    if (existing === undefined) {
      missingTables.push(template.tableName)
      continue
    }

    // Compared case-insensitively because Excel treats column names that way,
    // so a header of "email" already satisfies "Email" and adding a second
    // one would be rejected by Excel itself.
    const present = new Set(existing.columns.map((column) => column.trim().toLowerCase()))
    const columns = template.columns.filter(
      (column) => !present.has(column.trim().toLowerCase()),
    )

    if (columns.length > 0) missingColumns.push({ tableName: template.tableName, columns })
  }

  return { missingTables, missingColumns }
}
