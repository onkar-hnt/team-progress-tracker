import { WORKBOOK_TEMPLATE } from './workbook-template'
import type { WorkbookGateway, WorkbookStructure } from './workbook-gateway'

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

export async function inspectAdminWorkbookStructure(
  gateway: WorkbookGateway,
): Promise<{ missingTables: string[]; missingColumns: MissingColumns[] }> {
  return diffAgainstTemplate(await gateway.describeStructure())
}

export async function ensureAdminWorkbookStructure(
  gateway: WorkbookGateway,
): Promise<WorkbookStructureReport> {
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

    const present = new Set(existing.columns.map((column) => column.trim().toLowerCase()))
    const columns = template.columns.filter(
      (column) => !present.has(column.trim().toLowerCase()),
    )

    if (columns.length > 0) missingColumns.push({ tableName: template.tableName, columns })
  }

  return { missingTables, missingColumns }
}
