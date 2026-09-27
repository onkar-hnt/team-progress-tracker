import { describe, expect, it } from 'vitest'

import type { DailyWorkEntry, Developer, Project, TaskStatus } from '@models/index'
import {
  buildDailyTrend,
  buildDeveloperSummaries,
  buildProjectSummaries,
  calculateCompletionRate,
  findBlockedEntries,
  findDevelopersMissingUpdate,
  findDevelopersWithUpdate,
  submitsDailyUpdates,
  sumHoursLogged,
  summariseStatuses,
} from '@utils/work-summary/work-summary.utils'

/** Monday 21 September 2026 through Saturday 26 September 2026. */
const monday = '2026-09-21'
const tuesday = '2026-09-22'
const wednesday = '2026-09-23'
const saturday = '2026-09-26'

function entry(partial: Partial<DailyWorkEntry> = {}): DailyWorkEntry {
  return {
    id: 'entry-1',
    date: monday,
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

function developer(id: string, partial: Partial<Developer> = {}): Developer {
  return { id, name: id, active: true, ...partial }
}

function project(id: string, partial: Partial<Project> = {}): Project {
  return {
    id,
    name: id,
    active: true,
    status: 'active',
    mentorIds: [],
    assignedDeveloperIds: [],
    ...partial,
  }
}

/** One entry per status, so a breakdown can be read off the counts. */
function entriesWithStatuses(statuses: readonly TaskStatus[]): DailyWorkEntry[] {
  return statuses.map((status, index) => entry({ id: `entry-${String(index)}`, status }))
}

describe('summariseStatuses', () => {
  it('counts each status separately and totals them', () => {
    const breakdown = summariseStatuses(
      entriesWithStatuses(['not-started', 'in-progress', 'in-progress', 'completed', 'blocked']),
    )

    expect(breakdown).toStrictEqual({
      total: 5,
      notStarted: 1,
      inProgress: 2,
      completed: 1,
      blocked: 1,
      needsAttention: 1,
    })
  })

  it('counts work flagged as blocked as needing attention even while it is in progress', () => {
    const breakdown = summariseStatuses([entry({ isBlocked: true, status: 'in-progress' })])

    expect(breakdown.inProgress).toBe(1)
    expect(breakdown.blocked).toBe(0)
    expect(breakdown.needsAttention).toBe(1)
  })

  it('does not count blocked work twice when it is both flagged and blocked by status', () => {
    const breakdown = summariseStatuses([entry({ isBlocked: true, status: 'blocked' })])

    expect(breakdown.blocked).toBe(1)
    expect(breakdown.needsAttention).toBe(1)
  })

  it('reports zeroes rather than failing when there is nothing to summarise', () => {
    expect(summariseStatuses([])).toStrictEqual({
      total: 0,
      notStarted: 0,
      inProgress: 0,
      completed: 0,
      blocked: 0,
      needsAttention: 0,
    })
  })
})

describe('calculateCompletionRate', () => {
  it('is a percentage of the entries given, to one decimal place', () => {
    expect(calculateCompletionRate(entriesWithStatuses(['completed', 'completed', 'blocked'])))
      .toBe(66.7)
  })

  it('is zero rather than not-a-number when there are no entries', () => {
    expect(calculateCompletionRate([])).toBe(0)
  })

  it('is a hundred when everything is complete', () => {
    expect(calculateCompletionRate(entriesWithStatuses(['completed']))).toBe(100)
  })
})

describe('sumHoursLogged', () => {
  it('adds up the hours reported across entries', () => {
    expect(
      sumHoursLogged([
        entry({ hoursSpent: 3 }),
        entry({ hoursSpent: 2.5, id: 'entry-2', taskTitle: 'Another' }),
      ]),
    ).toBe(5.5)
  })

  it('counts a standard working day for a day where no hours were reported', () => {
    expect(sumHoursLogged([entry()])).toBe(8)
  })

  it('counts one day once, however many tasks were logged against it', () => {
    expect(sumHoursLogged([entry(), entry({ id: 'entry-2', taskTitle: 'Another' })])).toBe(8)
  })

  it('counts two people on the same day as two days of effort', () => {
    expect(
      sumHoursLogged([entry(), entry({ developerId: 'ravi', id: 'entry-2' })]),
    ).toBe(16)
  })

  it('counts the same person on two days as two days of effort', () => {
    expect(sumHoursLogged([entry(), entry({ date: tuesday, id: 'entry-2' })])).toBe(16)
  })

  it('takes the reported hours for a day where any were reported, ignoring the standard day', () => {
    const sameDay = [entry({ hoursSpent: 2 }), entry({ id: 'entry-2', taskTitle: 'Another' })]

    expect(sumHoursLogged(sameDay)).toBe(2)
  })

  it('is zero when there is nothing logged at all', () => {
    expect(sumHoursLogged([])).toBe(0)
  })
})

describe('buildDeveloperSummaries', () => {
  it('summarises only each developer’s own entries', () => {
    const summaries = buildDeveloperSummaries(
      [developer('asha'), developer('ravi')],
      [
        entry({ hoursSpent: 4, status: 'completed' }),
        entry({ developerId: 'ravi', hoursSpent: 1, id: 'entry-2', status: 'blocked' }),
      ],
    )

    expect(summaries[0]?.statuses.completed).toBe(1)
    expect(summaries[0]?.hoursLogged).toBe(4)
    expect(summaries[1]?.statuses.blocked).toBe(1)
    expect(summaries[1]?.hoursLogged).toBe(1)
  })

  it('counts the distinct days somebody logged, not the entries they wrote', () => {
    const summaries = buildDeveloperSummaries(
      [developer('asha')],
      [entry(), entry({ id: 'entry-2', taskTitle: 'Another' }), entry({ date: tuesday, id: 'e3' })],
    )

    expect(summaries[0]?.daysLogged).toBe(2)
  })

  it('includes a developer who logged nothing, with an empty summary', () => {
    const summaries = buildDeveloperSummaries([developer('asha')], [])

    expect(summaries).toHaveLength(1)
    expect(summaries[0]?.statuses.total).toBe(0)
    expect(summaries[0]?.daysLogged).toBe(0)
    expect(summaries[0]?.completionRate).toBe(0)
  })
})

describe('buildProjectSummaries', () => {
  it('summarises only the entries logged against each project', () => {
    const summaries = buildProjectSummaries(
      [project('atlas'), project('borealis')],
      [entry(), entry({ id: 'entry-2', projectId: 'borealis', status: 'completed' })],
    )

    expect(summaries[0]?.statuses.inProgress).toBe(1)
    expect(summaries[1]?.statuses.completed).toBe(1)
  })

  it('counts the distinct people who worked on a project, not their entries', () => {
    const summaries = buildProjectSummaries(
      [project('atlas')],
      [
        entry(),
        entry({ id: 'entry-2', taskTitle: 'Another' }),
        entry({ developerId: 'ravi', id: 'entry-3' }),
      ],
    )

    expect(summaries[0]?.contributorCount).toBe(2)
  })
})

describe('submitsDailyUpdates', () => {
  it('expects an update from somebody with no access role recorded', () => {
    expect(submitsDailyUpdates(developer('asha'))).toBe(true)
  })

  it('expects an update from a developer', () => {
    expect(submitsDailyUpdates(developer('asha', { accessRole: 'developer' }))).toBe(true)
  })

  it('expects no update from a mentor or an admin, who do not log daily work', () => {
    expect(submitsDailyUpdates(developer('asha', { accessRole: 'mentor' }))).toBe(false)
    expect(submitsDailyUpdates(developer('asha', { accessRole: 'admin' }))).toBe(false)
  })

  it('expects no update from somebody who has been deactivated', () => {
    expect(submitsDailyUpdates(developer('asha', { active: false }))).toBe(false)
  })
})

describe('findDevelopersMissingUpdate', () => {
  it('names whoever has no entry on the day', () => {
    const missing = findDevelopersMissingUpdate(
      [developer('asha'), developer('ravi')],
      [entry()],
      monday,
    )

    expect(missing.map((found) => found.id)).toStrictEqual(['ravi'])
  })

  it('expects nothing of anybody on a day that is not a working day', () => {
    expect(findDevelopersMissingUpdate([developer('asha')], [], saturday)).toStrictEqual([])
  })

  it('ignores entries from other days when deciding who is missing', () => {
    const missing = findDevelopersMissingUpdate(
      [developer('asha')],
      [entry({ date: tuesday })],
      monday,
    )

    expect(missing.map((found) => found.id)).toStrictEqual(['asha'])
  })

  it('does not chase people who are not expected to submit updates', () => {
    const missing = findDevelopersMissingUpdate(
      [developer('asha', { accessRole: 'mentor' }), developer('ravi', { active: false })],
      [],
      monday,
    )

    expect(missing).toStrictEqual([])
  })
})

describe('findDevelopersWithUpdate', () => {
  it('names whoever has an entry on the day', () => {
    const updated = findDevelopersWithUpdate(
      [developer('asha'), developer('ravi')],
      [entry()],
      monday,
    )

    expect(updated.map((found) => found.id)).toStrictEqual(['asha'])
  })

  /** Unlike the missing list, this one reports what happened rather than what was expected. */
  it('names somebody inactive who logged work anyway', () => {
    const updated = findDevelopersWithUpdate([developer('asha', { active: false })], [entry()], monday)

    expect(updated.map((found) => found.id)).toStrictEqual(['asha'])
  })
})

describe('buildDailyTrend', () => {
  it('gives every day in the range a point, including the ones with no activity', () => {
    const trend = buildDailyTrend([entry()], { from: monday, to: wednesday })

    expect(trend.map((point) => point.date)).toStrictEqual([monday, tuesday, wednesday])
    expect(trend[1]).toStrictEqual({
      date: tuesday,
      total: 0,
      completed: 0,
      needsAttention: 0,
      hoursLogged: 0,
      developersUpdated: 0,
    })
  })

  it('counts each day’s own entries, people and hours', () => {
    const trend = buildDailyTrend(
      [
        entry({ hoursSpent: 3, status: 'completed' }),
        entry({ developerId: 'ravi', hoursSpent: 5, id: 'entry-2', isBlocked: true }),
        entry({ date: tuesday, id: 'entry-3' }),
      ],
      { from: monday, to: tuesday },
    )

    expect(trend[0]).toStrictEqual({
      date: monday,
      total: 2,
      completed: 1,
      needsAttention: 1,
      hoursLogged: 8,
      developersUpdated: 2,
    })
    expect(trend[1]?.total).toBe(1)
  })

  it('has no points when the range runs backwards', () => {
    expect(buildDailyTrend([entry()], { from: wednesday, to: monday })).toStrictEqual([])
  })
})

describe('findBlockedEntries', () => {
  it('keeps work blocked by status and work merely flagged as blocked', () => {
    const blocked = findBlockedEntries([
      entry({ id: 'by-status', status: 'blocked' }),
      entry({ id: 'by-flag', isBlocked: true }),
      entry({ id: 'moving' }),
    ])

    expect(blocked.map((found) => found.id)).toStrictEqual(['by-status', 'by-flag'])
  })
})
