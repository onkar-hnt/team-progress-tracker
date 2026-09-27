import { describe, expect, it } from 'vitest'

import type { CreateAssignedTaskRequest } from '@models/index'
import {
  taskRowSchema,
  toAssignedTask,
  toTaskInsert,
  toTaskUpdate,
} from './task.mappers'
import type { TaskRow } from './task.mappers'

function row(partial: Partial<TaskRow> = {}): TaskRow {
  return {
    id: 'task-1',
    code: 'TSK-001',
    name: 'Connector screen',
    description: null,
    project_id: 'atlas',
    developer_id: 'asha',
    mentor_id: null,
    priority: 'medium',
    status: 'in-progress',
    created_date: '2026-09-21',
    due_date: null,
    estimated_hours: null,
    worked_days: 0,
    actual_hours: 0,
    updated_at: '2026-09-21T09:00:00.000Z',
    ...partial,
  }
}

function createRequest(
  partial: Partial<CreateAssignedTaskRequest> = {},
): CreateAssignedTaskRequest {
  return {
    name: 'Connector screen',
    projectId: 'atlas',
    developerId: 'asha',
    priority: 'medium',
    status: 'in-progress',
    createdDate: '2026-09-21',
    ...partial,
  }
}

describe('taskRowSchema', () => {
  it('accepts a row as the database returns it', () => {
    expect(taskRowSchema.safeParse(row()).success).toBe(true)
  })

  it('rejects a priority or status the application does not know', () => {
    expect(taskRowSchema.safeParse(row({ priority: 'urgent' as never })).success).toBe(false)
    expect(taskRowSchema.safeParse(row({ status: 'archived' as never })).success).toBe(false)
  })

  /** Hours are read as numbers, so a string would break the arithmetic downstream. */
  it('rejects hours that arrive as text', () => {
    expect(taskRowSchema.safeParse(row({ actual_hours: '4' as never })).success).toBe(false)
  })

  it('rejects a task with no project or developer', () => {
    expect(taskRowSchema.safeParse(row({ project_id: '' })).success).toBe(false)
    expect(taskRowSchema.safeParse(row({ developer_id: '' })).success).toBe(false)
  })
})

describe('toAssignedTask', () => {
  it('reads the columns across to their model names', () => {
    const task = toAssignedTask(
      row({ actual_hours: 6, due_date: '2026-09-30', estimated_hours: 4, worked_days: 2 }),
    )

    expect(task).toMatchObject({
      id: 'task-1',
      code: 'TSK-001',
      name: 'Connector screen',
      projectId: 'atlas',
      developerId: 'asha',
      dueDate: '2026-09-30',
      estimatedHours: 4,
      workedDays: 2,
      actualHours: 6,
    })
  })

  it('leaves a field out entirely rather than carrying a null across', () => {
    const task = toAssignedTask(row())

    expect('description' in task).toBe(false)
    expect('mentorId' in task).toBe(false)
    expect('dueDate' in task).toBe(false)
    expect('estimatedHours' in task).toBe(false)
  })

  /** Zero is a real figure and must survive, unlike a null. */
  it('keeps an estimate of zero hours rather than dropping it', () => {
    expect(toAssignedTask(row({ estimated_hours: 0 })).estimatedHours).toBe(0)
  })

  it('keeps the recorded effort even when no day has been logged', () => {
    const task = toAssignedTask(row())

    expect(task.workedDays).toBe(0)
    expect(task.actualHours).toBe(0)
  })
})

describe('toTaskInsert', () => {
  it('writes the request out to its column names', () => {
    expect(toTaskInsert(createRequest({ estimatedHours: 4, mentorId: 'ravi' }))).toStrictEqual({
      name: 'Connector screen',
      description: null,
      project_id: 'atlas',
      developer_id: 'asha',
      mentor_id: 'ravi',
      priority: 'medium',
      status: 'in-progress',
      created_date: '2026-09-21',
      due_date: null,
      estimated_hours: 4,
    })
  })

  it('trims the name before storing it', () => {
    expect(toTaskInsert(createRequest({ name: '  Connector screen  ' })).name).toBe(
      'Connector screen',
    )
  })

  it('stores an untouched field as nothing recorded rather than as an empty string', () => {
    const insert = toTaskInsert(createRequest({ description: '   ', dueDate: '' }))

    expect(insert.description).toBeNull()
    expect(insert.due_date).toBeNull()
  })

  it('stores an estimate of zero rather than treating it as absent', () => {
    expect(toTaskInsert(createRequest({ estimatedHours: 0 })).estimated_hours).toBe(0)
  })
})

describe('toTaskUpdate', () => {
  it('writes nothing for an empty change', () => {
    expect(toTaskUpdate({})).toStrictEqual({})
  })

  it('writes only the fields the caller mentioned', () => {
    expect(toTaskUpdate({ status: 'completed' })).toStrictEqual({ status: 'completed' })
  })

  it('trims a new name', () => {
    expect(toTaskUpdate({ name: '  Renamed  ' })).toStrictEqual({ name: 'Renamed' })
  })

  /**
   * Mentioning a nullable field with nothing in it is how the caller clears
   * it, so the key must be written even though the value is null.
   */
  it('clears a nullable field the caller mentioned but left empty', () => {
    expect(toTaskUpdate({ dueDate: '' })).toStrictEqual({ due_date: null })
    expect(toTaskUpdate({ mentorId: undefined })).toStrictEqual({ mentor_id: null })
    expect(toTaskUpdate({ estimatedHours: undefined })).toStrictEqual({ estimated_hours: null })
  })

  it('does not clear a required field the caller mentioned but left empty', () => {
    expect(toTaskUpdate({ status: undefined })).toStrictEqual({})
    expect(toTaskUpdate({ projectId: undefined })).toStrictEqual({})
  })

  it('reassigns the task when a new developer or project is given', () => {
    expect(toTaskUpdate({ developerId: 'ravi', projectId: 'borealis' })).toStrictEqual({
      developer_id: 'ravi',
      project_id: 'borealis',
    })
  })

  it('sets an estimate of zero rather than reading it as a clear', () => {
    expect(toTaskUpdate({ estimatedHours: 0 })).toStrictEqual({ estimated_hours: 0 })
  })
})
