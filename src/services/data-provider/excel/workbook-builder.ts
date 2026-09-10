import { bootstrapAdmin } from '@services/auth/bootstrap-admin'

import { ADMIN_COLUMNS, EXCEL_RECORD_STATUS_VALUES, EXCEL_SHEETS } from './excel-schema'
import { WORKBOOK_TEMPLATE } from './workbook-template'

/**
 * Builds an empty but correctly structured workbook.
 *
 * Creating it here rather than asking somebody to build eight sheets by hand
 * removes the most likely cause of "the app shows nothing": a column spelled
 * differently from the contract.
 *
 * Sheets are plain headers with an autofilter rather than Excel tables. That
 * is deliberate — ExcelJS can create a table but cannot extend one when
 * loading an existing file, so rows this application appended would fall
 * outside the table range and quietly disappear from anything reading the
 * table. A header row has no range to fall out of. If the workbook is later
 * moved to the Microsoft Graph transport, convert each sheet to a table in
 * Excel itself, which does maintain the range correctly.
 *
 * Only the bootstrap administrator is written, and only because that account
 * already exists in configuration. No other record originates in code.
 */
export async function buildStarterWorkbook(): Promise<ArrayBuffer> {
  const module = await import('exceljs')
  const ExcelJS = (module as unknown as { default?: typeof module }).default ?? module

  const workbook = new ExcelJS.Workbook()
  workbook.created = new Date()

  for (const template of WORKBOOK_TEMPLATE) {
    const sheet = workbook.addWorksheet(template.sheetName)

    sheet.columns = template.columns.map((column) => ({
      header: column,
      key: column,
      width: Math.min(Math.max(column.length + 4, 12), 42),
    }))

    sheet.getRow(1).font = { bold: true }
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: template.columns.length },
    }

    if (template.sheetName === EXCEL_SHEETS.admin) {
      sheet.addRow({
        [ADMIN_COLUMNS.adminId]: 'ADM001',
        [ADMIN_COLUMNS.adminName]: bootstrapAdmin.name,
        [ADMIN_COLUMNS.email]: bootstrapAdmin.email,
        [ADMIN_COLUMNS.role]: 'Admin',
        [ADMIN_COLUMNS.createdDate]: new Date().toISOString().slice(0, 10),
        [ADMIN_COLUMNS.status]: EXCEL_RECORD_STATUS_VALUES.true,
      })
    }
  }

  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer
}
