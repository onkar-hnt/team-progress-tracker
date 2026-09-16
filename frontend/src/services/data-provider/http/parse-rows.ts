import type { z } from 'zod'

import {
  DuplicateRecordError,
  RowValidationError,
} from '../data-provider.errors'
import type { DataSourceTable, RowValidationIssue } from '../data-provider.errors'

/** Omits optional model fields when the API sent JSON null. */
export function optionalField<TKey extends string, TValue>(
  key: TKey,
  value: TValue | null | undefined,
): Record<TKey, TValue> | Record<string, never> {
  if (value === null || value === undefined) return {}
  return { [key]: value } as Record<TKey, TValue>
}

function readRowId(row: unknown): { recordId?: string } {
  if (typeof row !== 'object' || row === null) return {}

  const record = row as { code?: unknown; id?: unknown }
  const candidate = record.code ?? record.id
  return typeof candidate === 'string' ? { recordId: candidate } : {}
}

function collectDuplicateIds<TRecord>(
  records: readonly TRecord[],
  readId: (record: TRecord) => string | undefined,
): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()

  for (const record of records) {
    const id = readId(record)
    if (id === undefined) continue

    if (seen.has(id)) duplicates.add(id)
    else seen.add(id)
  }

  return [...duplicates]
}

function defaultRecordId<TRecord>(record: TRecord): string | undefined {
  if (typeof record !== 'object' || record === null || !('id' in record)) return undefined

  const id = (record as { id?: unknown }).id
  return typeof id === 'string' ? id : undefined
}

export function parseRows<TRow, TRecord>(
  table: DataSourceTable,
  schema: z.ZodType<TRow>,
  rows: readonly unknown[],
  toRecord: (row: TRow) => TRecord,
  readId?: (record: TRecord) => string | undefined,
): TRecord[] {
  const records: TRecord[] = []
  const issues: RowValidationIssue[] = []
  const resolveId = readId ?? defaultRecordId

  rows.forEach((row, index) => {
    const parsed = schema.safeParse(row)

    if (parsed.success) {
      records.push(toRecord(parsed.data))
      return
    }

    issues.push({
      index,
      ...readRowId(row),
      messages: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    })
  })

  if (issues.length > 0) throw new RowValidationError(table, issues)

  const duplicateIds = collectDuplicateIds(records, resolveId)
  if (duplicateIds.length > 0) throw new DuplicateRecordError(table, duplicateIds)

  return records
}

export function parseOne<TRow, TRecord>(
  table: DataSourceTable,
  schema: z.ZodType<TRow>,
  row: unknown,
  toRecord: (row: TRow) => TRecord,
  readId?: (record: TRecord) => string | undefined,
): TRecord {
  return parseRows(table, schema, [row], toRecord, readId)[0]!
}
