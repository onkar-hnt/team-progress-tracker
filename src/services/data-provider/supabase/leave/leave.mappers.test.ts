import { describe, expect, it } from 'vitest'

import type { CreateLeaveDayRequest } from '@models/index'
import {
  leaveDayRowSchema,
  toLeaveDay,
  toLeaveDayInsert,
} from './leave.mappers'
import type { LeaveDayRow } from './leave.mappers'

function rawRow(partial: Record<string, unknown> = {}) {
  return {
    id: 'leave-1',
    developer_id: 'asha',
    leave_date: '2026-09-21',
    note: null,
    recorded_by: null,
    created_at: '2026-09-21T09:00:00.000Z',
    ...partial,
  }
}

/** Through the schema, because the date column is transformed on the way in. */
function row(partial: Record<string, unknown> = {}): LeaveDayRow {
  return leaveDayRowSchema.parse(rawRow(partial))
}

describe('leaveDayRowSchema', () => {
  it('accepts a plain date', () => {
    expect(row().leave_date).toBe('2026-09-21')
  })

  /** The column may be a date or a timestamp depending on how it was written. */
  it('takes the date off the front of a timestamp', () => {
    expect(row({ leave_date: '2026-09-21T00:00:00.000Z' }).leave_date).toBe('2026-09-21')
  })

  it('rejects a date it cannot read', () => {
    expect(leaveDayRowSchema.safeParse(rawRow({ leave_date: 'not a date' })).success).toBe(false)
    expect(leaveDayRowSchema.safeParse(rawRow({ leave_date: '21/09/2026' })).success).toBe(false)
  })

  it('rejects a row that names no developer', () => {
    expect(leaveDayRowSchema.safeParse(rawRow({ developer_id: '' })).success).toBe(false)
  })
})

describe('toLeaveDay', () => {
  it('reads the columns across to their model names', () => {
    const leaveDay = toLeaveDay(row({ note: 'Wedding', recorded_by: 'profile-ravi' }))

    expect(leaveDay).toStrictEqual({
      id: 'leave-1',
      developerId: 'asha',
      date: '2026-09-21',
      createdAt: '2026-09-21T09:00:00.000Z',
      note: 'Wedding',
      recordedBy: 'profile-ravi',
    })
  })

  it('leaves a field out entirely rather than carrying a null across', () => {
    const leaveDay = toLeaveDay(row())

    expect('note' in leaveDay).toBe(false)
    expect('recordedBy' in leaveDay).toBe(false)
  })

  it('normalises the stamp to a full timestamp', () => {
    expect(toLeaveDay(row({ created_at: '2026-09-21 09:00:00+00' })).createdAt).toBe(
      '2026-09-21T09:00:00.000Z',
    )
  })

  it('keeps a stamp it cannot read rather than discarding it', () => {
    expect(toLeaveDay(row({ created_at: 'unknown' })).createdAt).toBe('unknown')
  })
})

describe('toLeaveDayInsert', () => {
  function createRequest(partial: Partial<CreateLeaveDayRequest> = {}): CreateLeaveDayRequest {
    return { developerId: 'asha', date: '2026-09-21', ...partial }
  }

  it('writes the request out to its column names', () => {
    expect(toLeaveDayInsert(createRequest({ note: 'Wedding' }))).toStrictEqual({
      developer_id: 'asha',
      leave_date: '2026-09-21',
      note: 'Wedding',
    })
  })

  /**
   * The column defaults to the caller and the insert policy refuses any other
   * value, so sending it could only ever be wrong.
   */
  it('sends nothing about who is recording the day', () => {
    expect('recorded_by' in toLeaveDayInsert(createRequest())).toBe(false)
  })

  it('stores an untouched note as nothing recorded', () => {
    expect(toLeaveDayInsert(createRequest({ note: '   ' })).note).toBeNull()
    expect(toLeaveDayInsert(createRequest()).note).toBeNull()
  })

  it('trims a note before storing it', () => {
    expect(toLeaveDayInsert(createRequest({ note: '  Wedding  ' })).note).toBe('Wedding')
  })
})
