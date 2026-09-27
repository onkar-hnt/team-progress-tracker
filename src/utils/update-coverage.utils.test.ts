import { describe, expect, it } from 'vitest'

import type { DailyWorkEntry, Developer, LeaveDay } from '@models/index'
import { buildUpdateCoverage, findCoverageFor, findPendingDays } from '@utils/update-coverage.utils'

/** Monday 21 September 2026 through Friday 25 September 2026. */
const monday = '2026-09-21'
const tuesday = '2026-09-22'
const wednesday = '2026-09-23'
const friday = '2026-09-25'
const saturday = '2026-09-26'
const week = { from: monday, to: saturday }

function developer(id: string, partial: Partial<Developer> = {}): Developer {
  return { id, name: id, active: true, ...partial }
}

function entry(developerId: string, date: string, id = `${developerId}-${date}`): DailyWorkEntry {
  return {
    id,
    date,
    developerId,
    projectId: 'project-x',
    taskTitle: 'Something',
    status: 'in-progress',
    priority: 'medium',
    progress: 50,
    isBlocked: false,
    createdAt: '2026-09-21T09:00:00.000Z',
    updatedAt: '2026-09-21T09:00:00.000Z',
  }
}

function leave(developerId: string, date: string, note?: string): LeaveDay {
  return {
    id: `${developerId}-${date}-leave`,
    developerId,
    date,
    createdAt: '2026-09-22T09:00:00.000Z',
    ...(note === undefined ? {} : { note }),
  }
}

describe('update coverage', () => {
  it('asks about working days only, newest first', () => {
    const coverage = buildUpdateCoverage({
      developers: [developer('dev-a')],
      entries: [],
      leaveDays: [],
      range: week,
    })

    expect(coverage.developers[0]?.days.map((day) => day.date)).toEqual([
      friday,
      '2026-09-24',
      wednesday,
      tuesday,
      monday,
    ])
  })

  it('counts a day with an entry as submitted and one without as missing', () => {
    const coverage = buildUpdateCoverage({
      developers: [developer('dev-a')],
      entries: [entry('dev-a', monday), entry('dev-a', tuesday)],
      leaveDays: [],
      range: { from: monday, to: wednesday },
    })

    const row = coverage.developers[0]
    expect(row?.submittedCount).toBe(2)
    expect(row?.missingDates).toEqual([wednesday])
    expect(row?.lastSubmittedDate).toBe(tuesday)
  })

  it('counts several entries on one day as that one day', () => {
    const coverage = buildUpdateCoverage({
      developers: [developer('dev-a')],
      entries: [entry('dev-a', monday, 'first'), entry('dev-a', monday, 'second')],
      leaveDays: [],
      range: { from: monday, to: monday },
    })

    expect(coverage.developers[0]?.submittedCount).toBe(1)
    expect(coverage.totals.missingDays).toBe(0)
  })

  it('answers a day with a leave row, carrying its note', () => {
    const coverage = buildUpdateCoverage({
      developers: [developer('dev-a')],
      entries: [],
      leaveDays: [leave('dev-a', monday, 'Family wedding')],
      range: { from: monday, to: tuesday },
    })

    const row = coverage.developers[0]
    expect(row?.days).toEqual([
      { date: tuesday, state: 'missing' },
      { date: monday, state: 'leave', note: 'Family wedding' },
    ])
    expect(row?.missingCount).toBe(1)
    expect(row?.leaveCount).toBe(1)
  })

  it('prefers a submitted day over a leave day marked for it', () => {
    const coverage = buildUpdateCoverage({
      developers: [developer('dev-a')],
      entries: [entry('dev-a', monday)],
      leaveDays: [leave('dev-a', monday)],
      range: { from: monday, to: monday },
    })

    expect(coverage.developers[0]?.days).toEqual([{ date: monday, state: 'submitted' }])
  })

  it('leaves out people who do not owe an update', () => {
    const coverage = buildUpdateCoverage({
      developers: [
        developer('dev-a'),
        developer('inactive', { active: false }),
        developer('a-mentor', { accessRole: 'mentor' }),
        developer('an-admin', { accessRole: 'admin' }),
      ],
      entries: [],
      leaveDays: [],
      range: { from: monday, to: monday },
    })

    expect(coverage.developers.map((row) => row.developer.id)).toEqual(['dev-a'])
  })

  it('totals gaps across developers, counting each person once', () => {
    const coverage = buildUpdateCoverage({
      developers: [developer('dev-a'), developer('dev-b'), developer('dev-c')],
      entries: [entry('dev-c', monday), entry('dev-c', tuesday)],
      leaveDays: [leave('dev-b', monday), leave('dev-b', tuesday)],
      range: { from: monday, to: tuesday },
    })

    expect(coverage.totals).toEqual({
      developersWithGaps: 1,
      missingDays: 2,
      leaveDays: 2,
    })
  })

  it('ignores other developers\u2019 entries and leave', () => {
    const coverage = buildUpdateCoverage({
      developers: [developer('dev-a')],
      entries: [entry('dev-b', monday)],
      leaveDays: [leave('dev-b', tuesday)],
      range: { from: monday, to: tuesday },
    })

    expect(coverage.developers[0]?.missingDates).toEqual([tuesday, monday])
  })

  it('has nothing to ask about a range with no working days', () => {
    const coverage = buildUpdateCoverage({
      developers: [developer('dev-a')],
      entries: [],
      leaveDays: [],
      range: { from: saturday, to: '2026-09-27' },
    })

    expect(coverage.developers[0]?.days).toEqual([])
    expect(coverage.totals.missingDays).toBe(0)
  })
})

describe('reading one developer out of a coverage', () => {
  const coverage = buildUpdateCoverage({
    developers: [developer('dev-a'), developer('dev-b')],
    entries: [entry('dev-a', monday)],
    leaveDays: [],
    range: { from: monday, to: tuesday },
  })

  it('finds the row for a developer and lists their gaps', () => {
    expect(findPendingDays(findCoverageFor(coverage, 'dev-a'))).toEqual([
      { date: tuesday, state: 'missing' },
    ])
  })

  it('has no row for somebody outside the coverage', () => {
    expect(findCoverageFor(coverage, 'dev-z')).toBeUndefined()
    expect(findPendingDays(undefined)).toEqual([])
  })

  it('has no row when nobody is asked for', () => {
    expect(findCoverageFor(coverage, undefined)).toBeUndefined()
  })
})
