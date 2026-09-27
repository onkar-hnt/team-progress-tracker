import { describe, expect, it } from 'vitest'

import { dailyUpdateRowSchema, toDailyWorkEntry } from './daily-update.mappers'

const row = {
  id: 'entry-1',
  developer_id: '3ec16ff0-9df1-4add-af70-0f593ffbb0c3',
  project_id: '1623ba63-84d0-4249-a730-bb9bdad2fef7',
  task_id: null,
  entry_date: '2026-09-24',
  task_title: 'Screen freezes',
  description: null,
  work_done: null,
  planned_work: null,
  status: 'completed',
  priority: 'medium',
  progress: 100,
  hours_spent: '6.00',
  estimated_hours: null,
  is_blocked: false,
  blocker_description: null,
  remarks: null,
  created_at: '2026-09-24T10:00:00.000Z',
  updated_at: '2026-09-24T10:00:00.000Z',
  deleted_at: null,
}

describe('daily update rows', () => {
  it('keeps a row when hours arrive as numeric strings', () => {
    const parsed = dailyUpdateRowSchema.parse(row)
    const entry = toDailyWorkEntry(parsed)

    expect(entry.developerId).toBe(row.developer_id)
    expect(entry.date).toBe('2026-09-24')
    expect(entry.hoursSpent).toBe(6)
    expect(entry.progress).toBe(100)
  })

  it('reads a timestamp date as the calendar day', () => {
    const parsed = dailyUpdateRowSchema.parse({
      ...row,
      entry_date: '2026-09-23T00:00:00+00:00',
      hours_spent: 4,
    })

    expect(toDailyWorkEntry(parsed).date).toBe('2026-09-23')
    expect(toDailyWorkEntry(parsed).hoursSpent).toBe(4)
  })
})
