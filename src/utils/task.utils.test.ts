import { describe, expect, it } from 'vitest'

import type { DailyWorkEntry, TaskStatus } from '@models/index'
import {
  compareEffort,
  comparePriority,
  compareStatus,
  countCommentsByTask,
  describeEffort,
  describeTask,
  getPriorityLabel,
  getStatusLabel,
  groupTasksByCompletion,
  isEntryBlocked,
  isEntryCompleted,
  progressForStatus,
  sortByMostRecent,
} from '@utils/task.utils'

function entry(partial: Partial<DailyWorkEntry> = {}): DailyWorkEntry {
  return {
    id: 'entry-1',
    date: '2026-09-21',
    developerId: 'asha',
    projectId: 'atlas',
    taskTitle: 'Something',
    status: 'in-progress',
    priority: 'medium',
    progress: 50,
    isBlocked: false,
    createdAt: '2026-09-21T09:00:00.000Z',
    updatedAt: '2026-09-21T09:00:00.000Z',
    ...partial,
  }
}

describe('isEntryBlocked', () => {
  it('is blocked when the status says so', () => {
    expect(isEntryBlocked(entry({ status: 'blocked' }))).toBe(true)
  })

  it('is blocked when the flag is set, whatever the status says', () => {
    expect(isEntryBlocked(entry({ isBlocked: true, status: 'completed' }))).toBe(true)
  })

  it('is not blocked when neither says so', () => {
    expect(isEntryBlocked(entry())).toBe(false)
  })
})

describe('isEntryCompleted', () => {
  it('is complete only when the status says so', () => {
    expect(isEntryCompleted(entry({ status: 'completed' }))).toBe(true)
    expect(isEntryCompleted(entry({ progress: 100 }))).toBe(false)
  })
})

describe('progressForStatus', () => {
  it('implies a full bar for completed work and an empty one for work not started', () => {
    expect(progressForStatus('completed')).toBe(100)
    expect(progressForStatus('not-started')).toBe(0)
  })

  it('implies nothing for work under way or blocked, where any figure is valid', () => {
    expect(progressForStatus('in-progress')).toBeNull()
    expect(progressForStatus('blocked')).toBeNull()
  })
})

describe('status and priority labels', () => {
  it('names each status for a reader', () => {
    expect(getStatusLabel('not-started')).toBe('Not Started')
    expect(getStatusLabel('in-progress')).toBe('In Progress')
  })

  it('names each priority for a reader', () => {
    expect(getPriorityLabel('critical')).toBe('Critical')
    expect(getPriorityLabel('low')).toBe('Low')
  })
})

describe('sortByMostRecent', () => {
  it('puts the latest day first', () => {
    const sorted = sortByMostRecent([
      entry({ date: '2026-09-21', id: 'older' }),
      entry({ date: '2026-09-23', id: 'newer' }),
    ])

    expect(sorted.map((found) => found.id)).toStrictEqual(['newer', 'older'])
  })

  it('breaks a tie on the same day by which was edited last', () => {
    const sorted = sortByMostRecent([
      entry({ id: 'saved-first', updatedAt: '2026-09-21T09:00:00.000Z' }),
      entry({ id: 'saved-second', updatedAt: '2026-09-21T17:00:00.000Z' }),
    ])

    expect(sorted.map((found) => found.id)).toStrictEqual(['saved-second', 'saved-first'])
  })

  it('leaves the caller’s array alone', () => {
    const original = [entry({ date: '2026-09-21', id: 'a' }), entry({ date: '2026-09-23', id: 'b' })]
    sortByMostRecent(original)

    expect(original.map((found) => found.id)).toStrictEqual(['a', 'b'])
  })
})

describe('comparePriority', () => {
  it('sorts the most urgent work first', () => {
    const order = (['low', 'critical', 'medium', 'high'] as const).toSorted(comparePriority)

    expect(order).toStrictEqual(['critical', 'high', 'medium', 'low'])
  })

  it('treats equal priorities as equal', () => {
    expect(comparePriority('high', 'high')).toBe(0)
  })
})

describe('compareStatus', () => {
  it('sorts work that still needs doing ahead of work that is finished', () => {
    const order = (['completed', 'blocked', 'not-started', 'in-progress'] as const).toSorted(
      compareStatus,
    )

    expect(order).toStrictEqual(['not-started', 'in-progress', 'blocked', 'completed'])
  })
})

describe('countCommentsByTask', () => {
  it('counts the trail entries against each task', () => {
    const counts = countCommentsByTask([
      { taskId: 'task-1' },
      { taskId: 'task-1' },
      { taskId: 'task-2' },
    ])

    expect(counts.get('task-1')).toBe(2)
    expect(counts.get('task-2')).toBe(1)
  })

  it('ignores feedback that is not about a task', () => {
    const counts = countCommentsByTask([{}, { taskId: 'task-1' }])

    expect(counts.size).toBe(1)
    expect(counts.get('task-1')).toBe(1)
  })

  it('has no count for a task nobody commented on', () => {
    expect(countCommentsByTask([]).get('task-1')).toBeUndefined()
  })
})

describe('compareEffort', () => {
  it('reports the hours over when a task took longer than estimated', () => {
    expect(compareEffort({ actualHours: 10, estimatedHours: 6, workedDays: 2 })).toStrictEqual({
      verdict: 'over',
      differenceHours: 4,
    })
  })

  it('reports the hours under when a task came in early', () => {
    expect(compareEffort({ actualHours: 4, estimatedHours: 6, workedDays: 1 })).toStrictEqual({
      verdict: 'under',
      differenceHours: 2,
    })
  })

  it('reports being on estimate exactly', () => {
    expect(compareEffort({ actualHours: 6, estimatedHours: 6, workedDays: 1 })).toStrictEqual({
      verdict: 'on',
      differenceHours: 0,
    })
  })

  it('compares nothing when no estimate was given', () => {
    expect(compareEffort({ actualHours: 6, workedDays: 1 })).toBeNull()
  })

  /** An estimate with no day logged against it has not been tested yet. */
  it('compares nothing before any day has been logged against the task', () => {
    expect(compareEffort({ actualHours: 0, estimatedHours: 6, workedDays: 0 })).toBeNull()
  })
})

describe('describeEffort', () => {
  it('says only that the work was on estimate, without a figure', () => {
    expect(describeEffort({ differenceHours: 0, verdict: 'on' })).toBe('On estimate')
  })

  it('says how far over or under the work ran', () => {
    expect(describeEffort({ differenceHours: 4, verdict: 'over' })).toBe('4 h over estimate')
    expect(describeEffort({ differenceHours: 2, verdict: 'under' })).toBe('2 h under estimate')
  })

  it('does not show a trailing zero on a whole or half hour', () => {
    expect(describeEffort({ differenceHours: 1.5, verdict: 'over' })).toBe('1.5 h over estimate')
    expect(describeEffort({ differenceHours: 2.25, verdict: 'over' })).toBe('2.25 h over estimate')
  })

  it('rounds a figure that carries more precision than an hour needs', () => {
    expect(describeEffort({ differenceHours: 1.005, verdict: 'over' })).toBe('1 h over estimate')
  })
})

describe('describeTask', () => {
  const task = {
    id: 'task-1',
    name: 'Connector screen',
    projectName: 'Atlas',
    status: 'in-progress' as TaskStatus,
    isOverdue: false,
  }

  it('names the task and the project it belongs to', () => {
    expect(describeTask(task)).toBe('Connector screen · Atlas')
  })

  it('says when the task is overdue, so the picker shows it', () => {
    expect(describeTask({ ...task, isOverdue: true })).toBe('Connector screen · Atlas · overdue')
  })
})

describe('groupTasksByCompletion', () => {
  const task = (name: string, status: TaskStatus) => ({ name, status })

  it('separates work still to do from work already finished', () => {
    const { completed, open } = groupTasksByCompletion([
      task('Alpha', 'completed'),
      task('Beta', 'in-progress'),
    ])

    expect(open.map((found) => found.name)).toStrictEqual(['Beta'])
    expect(completed.map((found) => found.name)).toStrictEqual(['Alpha'])
  })

  it('orders each group by how much attention it needs, then by name', () => {
    const { open } = groupTasksByCompletion([
      task('Zulu', 'not-started'),
      task('Alpha', 'blocked'),
      task('Bravo', 'not-started'),
      task('Yankee', 'in-progress'),
    ])

    expect(open.map((found) => found.name)).toStrictEqual(['Bravo', 'Zulu', 'Yankee', 'Alpha'])
  })

  it('returns two empty groups when there are no tasks', () => {
    expect(groupTasksByCompletion([])).toStrictEqual({ completed: [], open: [] })
  })
})
