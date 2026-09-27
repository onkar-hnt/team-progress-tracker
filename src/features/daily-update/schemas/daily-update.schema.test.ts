import { describe, expect, it } from 'vitest'

import {
  createEmptyFormValues,
  dailyUpdateFormSchema,
  toCreateDailyWorkEntryRequest,
} from './daily-update.schema'

const values = {
  ...createEmptyFormValues({ date: '2026-09-26', developerId: 'dev-1' }),
  projectId: 'project-1',
  taskTitle: 'Connector configuration screen',
  estimatedHours: '8',
  hoursSpent: '4',
}

function issuePaths(result: { success: boolean; error?: { issues: { path: unknown[] }[] } }) {
  return (result.error?.issues ?? []).map((issue) => issue.path.join('.'))
}

describe('the daily update form', () => {
  it('asks a new entry what moved today', () => {
    const result = dailyUpdateFormSchema({ isNewEntry: true }).safeParse(values)

    expect(result.success).toBe(false)
    expect(issuePaths(result)).toContain('workDone')
  })

  it('leaves it optional when correcting an older entry, which may have none', () => {
    const result = dailyUpdateFormSchema({ isNewEntry: false }).safeParse(values)

    expect(result.success).toBe(true)
  })

  it('accepts a new entry that says what moved', () => {
    const result = dailyUpdateFormSchema({ isNewEntry: true }).safeParse({
      ...values,
      workDone: '<p>Built the form and wired the <strong>save</strong>.</p>',
    })

    expect(result.success).toBe(true)
  })

  // The editor reports a paragraph whether or not anything was written in it.
  it('does not count an emptied editor as an answer', () => {
    const result = dailyUpdateFormSchema({ isNewEntry: true }).safeParse({
      ...values,
      workDone: '<p><br></p>',
    })

    expect(result.success).toBe(false)
    expect(issuePaths(result)).toContain('workDone')
  })

  // Sent rather than omitted, so emptying the box on an edit clears the stored
  // text instead of leaving the previous day's.
  it('carries the day of work through to the request, empty or not', () => {
    expect(
      toCreateDailyWorkEntryRequest({ ...values, workDone: '<p>Wired the save</p>' }).workDone,
    ).toBe('<p>Wired the save</p>')

    expect(toCreateDailyWorkEntryRequest({ ...values, workDone: '<p></p>' }).workDone).toBe('')
    expect(toCreateDailyWorkEntryRequest({ ...values, workDone: '' }).workDone).toBe('')
  })
})
