import { describe, expect, it } from 'vitest'

import type { DailyWorkQuery } from '@models/index'
import { parseDailyWorkQuery, queryKeys, serializeDailyWorkQuery } from '@hooks/query-keys'

const range = { from: '2026-09-21', to: '2026-09-25' }

describe('queryKeys', () => {
  /** Two people sharing a browser profile must not read each other's rows from cache. */
  it('puts the access scope on every key that depends on it', () => {
    expect(queryKeys.dailyWork('mentor:ravi')).toContain('mentor:ravi')
    expect(queryKeys.tasks('mentor:ravi')).toContain('mentor:ravi')
    expect(queryKeys.dayOverview('mentor:ravi', '2026-09-21')).toContain('mentor:ravi')
    expect(queryKeys.unreadNotificationCount('mentor:ravi')).toContain('mentor:ravi')
  })

  it('gives different scopes different keys for the same read', () => {
    expect(queryKeys.tasks('mentor:ravi')).not.toStrictEqual(queryKeys.tasks('developer:asha'))
  })

  /** Invalidating a family prefix must reach the keys under it. */
  it('starts each scoped key with the family prefix that invalidates it', () => {
    expect(queryKeys.dailyWork('s')).toEqual(
      expect.arrayContaining(queryKeys.allDailyWork() as unknown as unknown[]),
    )
    expect(queryKeys.tasks('s').slice(0, 2)).toStrictEqual([...queryKeys.allTasks()])
    expect(queryKeys.comments('s').slice(0, 2)).toStrictEqual([...queryKeys.allComments()])
    expect(queryKeys.leaveDays('s', range).slice(0, 2)).toStrictEqual([...queryKeys.allLeaveDays()])
  })

  it('nests the unread count under notifications, so one invalidation refreshes both', () => {
    expect(queryKeys.unreadNotificationCount('s').slice(0, 2)).toStrictEqual([
      ...queryKeys.allNotifications(),
    ])
  })

  /** Marking a notification read should not refetch the preference screen. */
  it('keeps notification preferences outside the notifications family', () => {
    expect(queryKeys.notificationPreferences('s').slice(0, 2)).not.toStrictEqual([
      ...queryKeys.allNotifications(),
    ])
  })

  it('separates the roster lists from the scoped ones, which return different rows', () => {
    expect(queryKeys.roster('developers')).not.toStrictEqual(queryKeys.developers())
  })

  it('distinguishes the three roster tables', () => {
    expect(queryKeys.roster('developers')).not.toStrictEqual(queryKeys.roster('mentors'))
    expect(queryKeys.roster('mentors')).not.toStrictEqual(queryKeys.roster('projects'))
  })

  it('puts the page size on the notifications key, so loading more keeps the rows', () => {
    expect(queryKeys.notifications('s', 20)).not.toStrictEqual(queryKeys.notifications('s', 40))
  })

  /** The order the ids arrive in is not part of the question being asked. */
  it('keys the same set of developers the same way whatever order they are given in', () => {
    expect(queryKeys.leaveDays('s', range, ['ravi', 'asha'])).toStrictEqual(
      queryKeys.leaveDays('s', range, ['asha', 'ravi']),
    )
    expect(queryKeys.updateCoverage('s', range, ['ravi', 'asha'])).toStrictEqual(
      queryKeys.updateCoverage('s', range, ['asha', 'ravi']),
    )
  })

  it('tells an open developer filter apart from an empty one', () => {
    expect(queryKeys.leaveDays('s', range)).not.toStrictEqual(queryKeys.leaveDays('s', range, []))
  })

  it('keys each range separately', () => {
    expect(queryKeys.rangeOverview('s', range)).not.toStrictEqual(
      queryKeys.rangeOverview('s', { from: '2026-09-21', to: '2026-09-26' }),
    )
  })
})

describe('serializeDailyWorkQuery', () => {
  /**
   * A nested object can compare equal enough for React Query to keep the old
   * entry, which showed the previous selection's rows. A string cannot.
   */
  it('is a string, so a changed selection is a different cache entry', () => {
    expect(typeof serializeDailyWorkQuery({ developerIds: ['asha'] })).toBe('string')
  })

  it('writes the same text for the same filter, whatever order the fields were set in', () => {
    const one: DailyWorkQuery = { dateFrom: '2026-09-21', developerIds: ['asha'] }
    const other: DailyWorkQuery = { developerIds: ['asha'], dateFrom: '2026-09-21' }

    expect(serializeDailyWorkQuery(one)).toBe(serializeDailyWorkQuery(other))
  })

  it('writes the same text however the ids were ordered', () => {
    expect(serializeDailyWorkQuery({ developerIds: ['ravi', 'asha'] })).toBe(
      serializeDailyWorkQuery({ developerIds: ['asha', 'ravi'] }),
    )
  })

  it('writes different text for different filters', () => {
    expect(serializeDailyWorkQuery({ developerIds: ['asha'] })).not.toBe(
      serializeDailyWorkQuery({ developerIds: ['ravi'] }),
    )
  })

  it('writes the same text for no filter and an empty one', () => {
    expect(serializeDailyWorkQuery()).toBe(serializeDailyWorkQuery({}))
  })

  it('tells an open filter apart from an empty selection', () => {
    expect(serializeDailyWorkQuery({})).not.toBe(serializeDailyWorkQuery({ developerIds: [] }))
  })
})

describe('parseDailyWorkQuery', () => {
  it('reads back every field it was given', () => {
    const query: DailyWorkQuery = {
      dateFrom: '2026-09-21',
      dateTo: '2026-09-25',
      developerIds: ['asha'],
      projectIds: ['atlas'],
      statuses: ['blocked'],
      priorities: ['high'],
      isBlocked: true,
      limit: 20,
    }

    expect(parseDailyWorkQuery(serializeDailyWorkQuery(query))).toStrictEqual(query)
  })

  it('reads an empty filter back as an empty filter', () => {
    expect(parseDailyWorkQuery(serializeDailyWorkQuery({}))).toStrictEqual({})
  })

  /** A null slot means the filter was never set, which is not the same as empty. */
  it('leaves a field out when the filter was open on it', () => {
    const parsed = parseDailyWorkQuery(serializeDailyWorkQuery({ developerIds: ['asha'] }))

    expect(parsed).toStrictEqual({ developerIds: ['asha'] })
    expect('dateFrom' in (parsed ?? {})).toBe(false)
  })

  it('reads an empty selection back as an empty selection', () => {
    expect(parseDailyWorkQuery(serializeDailyWorkQuery({ developerIds: [] }))).toStrictEqual({
      developerIds: [],
    })
  })

  it('keeps a false flag rather than reading it as unset', () => {
    expect(parseDailyWorkQuery(serializeDailyWorkQuery({ isBlocked: false }))).toStrictEqual({
      isBlocked: false,
    })
  })

  it('reads nothing from text that is not a serialized filter', () => {
    expect(parseDailyWorkQuery('not json')).toBeUndefined()
    expect(parseDailyWorkQuery('{}')).toBeUndefined()
    expect(parseDailyWorkQuery('')).toBeUndefined()
  })

  it('ignores entries of the wrong type inside a list', () => {
    expect(parseDailyWorkQuery('[null,null,["asha",7],null,null,null,null,null]')).toStrictEqual({
      developerIds: ['asha'],
    })
  })
})
