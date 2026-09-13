import { EXCEL_BOOLEAN_VALUES, EXCEL_RECORD_STATUS_VALUES } from './excel-schema'

const MS_PER_DAY = 86_400_000

const SECONDS_PER_DAY = 86_400

const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30)

const EXCEL_EPOCH_BEFORE_PHANTOM_DAY_UTC_MS = Date.UTC(1899, 11, 31)

const EXCEL_PHANTOM_LEAP_DAY_SERIAL = 60

const ISO_DATE_PREFIX_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/

const NUMERIC_STRING_PATTERN = /^-?\d+(\.\d+)?$/

/** True when the parts form a real calendar date (rejects 2026-02-30). */
function isRealCalendarDate(year: number, month: number, day: number): boolean {
  const candidate = new Date(Date.UTC(year, month - 1, day))
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  )
}

function formatUtcDateOnly(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, '0')
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** `true` when `value` is a `yyyy-MM-dd` string denoting a real date. */
export function isIsoDateString(value: unknown): value is string {
  if (typeof value !== 'string' || value.length !== 10) return false
  const match = ISO_DATE_PREFIX_PATTERN.exec(value)
  if (!match) return false
  return isRealCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]))
}

export function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial < 1) return null
  if (Math.floor(serial) === EXCEL_PHANTOM_LEAP_DAY_SERIAL) return null

  const epoch =
    serial < EXCEL_PHANTOM_LEAP_DAY_SERIAL
      ? EXCEL_EPOCH_BEFORE_PHANTOM_DAY_UTC_MS
      : EXCEL_EPOCH_UTC_MS

  return new Date(epoch + Math.round(serial * SECONDS_PER_DAY) * 1_000)
}

/** Converts a calendar day to the Excel serial for that day at midnight. */
export function isoDateToExcelSerial(isoDate: string): number | null {
  if (!isIsoDateString(isoDate)) return null
  const utcMs = Date.parse(`${isoDate}T00:00:00Z`)
  return (utcMs - EXCEL_EPOCH_UTC_MS) / MS_PER_DAY
}

export function parseExcelDateCell(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : formatUtcDateOnly(value)
  }

  if (typeof value === 'number') {
    const date = excelSerialToDate(value)
    return date ? formatUtcDateOnly(date) : null
  }

  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (trimmed === '') return null

  const isoMatch = ISO_DATE_PREFIX_PATTERN.exec(trimmed)
  if (isoMatch) {
    const [, year, month, day] = isoMatch
    if (!isRealCalendarDate(Number(year), Number(month), Number(day))) return null
    return `${year}-${month}-${day}`
  }

  if (NUMERIC_STRING_PATTERN.test(trimmed)) {
    const date = excelSerialToDate(Number(trimmed))
    return date ? formatUtcDateOnly(date) : null
  }

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null

  const year = String(parsed.getFullYear()).padStart(4, '0')
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseExcelTimestampCell(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString()
  }

  if (typeof value === 'number') {
    const date = excelSerialToDate(value)
    return date ? date.toISOString() : null
  }

  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (trimmed === '') return null

  if (NUMERIC_STRING_PATTERN.test(trimmed)) {
    const date = excelSerialToDate(Number(trimmed))
    return date ? date.toISOString() : null
  }

  if (isIsoDateString(trimmed)) return `${trimmed}T00:00:00.000Z`

  const parsed = new Date(trimmed)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

export function parseExcelBooleanCell(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (value === null || value === undefined || value === '') return null

  if (typeof value === 'number') {
    if (value === 1) return true
    if (value === 0) return false
    return null
  }

  if (typeof value !== 'string') return null

  switch (value.trim().toLowerCase()) {
    case 'yes':
    case 'y':
    case 'true':
    case '1':
    case 'active':
      return true
    case 'no':
    case 'n':
    case 'false':
    case '0':
    case 'inactive':
      return false
    default:
      return null
  }
}

export function formatExcelBoolean(value: boolean): string {
  return value ? EXCEL_BOOLEAN_VALUES.true : EXCEL_BOOLEAN_VALUES.false
}

export function formatExcelRecordStatus(value: boolean): string {
  return value ? EXCEL_RECORD_STATUS_VALUES.true : EXCEL_RECORD_STATUS_VALUES.false
}

export function parseExcelNumberCell(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') return null

  const trimmed = value.trim().replace(/,/g, '').replace(/%$/, '')
  if (trimmed === '') return null

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

export function parseExcelTextCell(value: unknown): string | null {
  if (value === null || value === undefined) return null

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : null
  }

  if (typeof value === 'boolean') return formatExcelBoolean(value)
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (trimmed === '' || trimmed.startsWith('#')) return null
  return trimmed
}
