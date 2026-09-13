import { bootstrapAdmin } from '@services/auth/bootstrap-admin'

import { ADMIN_COLUMNS, EXCEL_RECORD_STATUS_VALUES, EXCEL_SHEETS } from './excel-schema'
import { WORKBOOK_TEMPLATE } from './workbook-template'

/** Header rows only: ExcelJS cannot extend table ranges on load. */
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
