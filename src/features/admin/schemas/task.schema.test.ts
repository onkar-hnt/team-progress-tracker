import { describe, expect, it } from 'vitest'

import type { AssignedTask } from '@models/index'

import { taskFormSchema, toTaskFormValues, toTaskRequest } from './task.schema'

const values = {
  ...toTaskFormValues(),
  name: 'Build the invoice export',
  projectId: 'project-1',
  developerId: 'dev-1',
}

const task: AssignedTask = {
  id: 'task-1',
  name: 'Build the invoice export',
  projectId: 'project-1',
  developerId: 'dev-1',
  priority: 'medium',
  status: 'not-started',
  createdDate: '2026-09-01',
  workedDays: 0,
  actualHours: 0,
  updatedAt: '2026-09-01T00:00:00Z',
}

describe('the task description', () => {
  it('takes the formatting it was written with', () => {
    const result = taskFormSchema.safeParse({
      ...values,
      description: '<p>Two parts:</p><ul><li>the export</li><li>the download</li></ul>',
    })

    expect(result.success).toBe(true)
  })

  // The markup would otherwise spend the allowance the writer is counting in words.
  it('is measured by the words rather than the markup around them', () => {
    const bolded = `<p><strong>${'a'.repeat(1000)}</strong></p>`

    expect(taskFormSchema.safeParse({ ...values, description: bolded }).success).toBe(true)

    const tooLong = taskFormSchema.safeParse({
      ...values,
      description: `<p>${'a'.repeat(1001)}</p>`,
    })

    expect(tooLong.success).toBe(false)
    expect(tooLong.error?.issues[0]?.message).toBe('Keep this under 1000 characters')
  })

  it('stores what the editor reported, without its trailing paragraph', () => {
    expect(toTaskRequest({ ...values, description: '<p>The export</p><p></p>' }).description).toBe(
      '<p>The export</p>',
    )
  })

  // Sent rather than omitted, so clearing the box clears the stored description
  // instead of leaving the previous one in the record.
  it('sends an emptied description, so saving clears it', () => {
    expect(toTaskRequest({ ...values, description: '<p><br></p>' }).description).toBe('')
    expect(toTaskRequest({ ...values, description: '' }).description).toBe('')
  })

  it('opens a description written before the editor existed', () => {
    expect(toTaskFormValues({ ...task, description: 'Plain text.' })).toMatchObject({
      description: 'Plain text.',
    })

    expect(toTaskFormValues(task)).toMatchObject({ description: '' })
  })
})
