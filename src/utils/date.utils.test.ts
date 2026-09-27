import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  daysSince,
  formatLongDate,
  formatRelativeTime,
  formatShortDate,
  formatTimestamp,
  formatWeekday,
  getMonthRange,
  getSingleDayRange,
  getTrailingRange,
  getWeekday,
  getWeekRange,
  isIsoDateString,
  isWorkingDay,
  listDatesInRange,
  listWorkingDatesInRange,
  parseIsoDate,
  shiftIsoDate,
  toIsoDate,
  todayIsoDate,
  toNearestWorkingDay,
} from '@utils/date.utils'

/** Monday 21 September 2026 through Sunday 27 September 2026. */
const monday = '2026-09-21'
const tuesday = '2026-09-22'
const wednesday = '2026-09-23'
const thursday = '2026-09-24'
const friday = '2026-09-25'
const saturday = '2026-09-26'
const sunday = '2026-09-27'

describe('reading a calendar day', () => {
  it('writes a date as the yyyy-MM-dd the whole app passes around', () => {
    expect(toIsoDate(new Date(2026, 8, 21))).toBe(monday)
  })

  it('reads a well-formed date back', () => {
    expect(toIsoDate(parseIsoDate(monday)!)).toBe(monday)
  })

  it('has no date for something that is not one', () => {
    expect(parseIsoDate('not-a-date')).toBeNull()
    expect(parseIsoDate('')).toBeNull()
  })

  it('answers today in the same format', () => {
    expect(isIsoDateString(todayIsoDate())).toBe(true)
  })
})

describe('recognising a date string', () => {
  it('accepts a real calendar day', () => {
    expect(isIsoDateString(monday)).toBe(true)
    expect(isIsoDateString('2024-02-29')).toBe(true)
  })

  // The round trip is what catches these: parsing alone can roll a day over
  // into the next month and report success.
  it('rejects a day the month does not have', () => {
    expect(isIsoDateString('2026-02-31')).toBe(false)
    expect(isIsoDateString('2026-09-31')).toBe(false)
    expect(isIsoDateString('2026-02-29')).toBe(false)
  })

  it('rejects a month that does not exist', () => {
    expect(isIsoDateString('2026-13-01')).toBe(false)
    expect(isIsoDateString('2026-00-10')).toBe(false)
  })

  it('rejects anything not written as ten characters', () => {
    expect(isIsoDateString('2026-9-21')).toBe(false)
    expect(isIsoDateString('26-09-21')).toBe(false)
    expect(isIsoDateString(`${monday}T09:00:00Z`)).toBe(false)
  })

  it('rejects a value that is not a string at all', () => {
    expect(isIsoDateString(20260921)).toBe(false)
    expect(isIsoDateString(null)).toBe(false)
    expect(isIsoDateString(undefined)).toBe(false)
    expect(isIsoDateString(new Date())).toBe(false)
  })
})

describe('working days', () => {
  it('numbers the weekdays from Monday', () => {
    expect(getWeekday(monday)).toBe(1)
    expect(getWeekday(friday)).toBe(5)
    expect(getWeekday(saturday)).toBe(6)
    expect(getWeekday(sunday)).toBe(7)
  })

  it('has no weekday for something that is not a date', () => {
    expect(getWeekday('not-a-date')).toBeNull()
  })

  it('counts Monday through Friday as working days', () => {
    expect([monday, tuesday, wednesday, thursday, friday].every(isWorkingDay)).toBe(true)
  })

  it('does not count the weekend', () => {
    expect(isWorkingDay(saturday)).toBe(false)
    expect(isWorkingDay(sunday)).toBe(false)
  })

  it('does not count a value that is not a date', () => {
    expect(isWorkingDay('not-a-date')).toBe(false)
  })

  it('steps back to the last working day from a weekend', () => {
    expect(toNearestWorkingDay(sunday)).toBe(friday)
    expect(toNearestWorkingDay(saturday)).toBe(friday)
  })

  it('leaves a working day where it is', () => {
    expect(toNearestWorkingDay(wednesday)).toBe(wednesday)
  })
})

describe('shifting a date', () => {
  it('moves forward and back within a month', () => {
    expect(shiftIsoDate(monday, 3)).toBe(thursday)
    expect(shiftIsoDate(friday, -4)).toBe(monday)
    expect(shiftIsoDate(monday, 0)).toBe(monday)
  })

  it('crosses a month and a year boundary', () => {
    expect(shiftIsoDate('2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftIsoDate('2026-03-01', -1)).toBe('2026-02-28')
    expect(shiftIsoDate('2024-03-01', -1)).toBe('2024-02-29')
  })

  it('hands back what it was given when that is not a date', () => {
    expect(shiftIsoDate('not-a-date', 5)).toBe('not-a-date')
  })
})

describe('ranges', () => {
  it('reads a week as Monday through Sunday, whichever day it is asked about', () => {
    const week = { from: monday, to: sunday }

    expect(getWeekRange(monday)).toEqual(week)
    expect(getWeekRange(thursday)).toEqual(week)
    expect(getWeekRange(sunday)).toEqual(week)
  })

  it('reads a month from its first day to its last', () => {
    expect(getMonthRange(wednesday)).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(getMonthRange('2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(getMonthRange('2024-02-10')).toEqual({ from: '2024-02-01', to: '2024-02-29' })
  })

  it('counts a trailing range inclusively, so seven days ends six days later', () => {
    expect(getTrailingRange(sunday, 7)).toEqual({ from: monday, to: sunday })
    expect(getTrailingRange(sunday, 1)).toEqual({ from: sunday, to: sunday })
  })

  it('treats a trailing range of nothing as the day itself', () => {
    expect(getTrailingRange(sunday, 0)).toEqual({ from: sunday, to: sunday })
    expect(getTrailingRange(sunday, -5)).toEqual({ from: sunday, to: sunday })
  })

  it('reads one day as a range starting and ending on it', () => {
    expect(getSingleDayRange(monday)).toEqual({ from: monday, to: monday })
  })

  it('falls back to the day asked about when it is not a date', () => {
    expect(getWeekRange('not-a-date')).toEqual({ from: 'not-a-date', to: 'not-a-date' })
    expect(getMonthRange('not-a-date')).toEqual({ from: 'not-a-date', to: 'not-a-date' })
  })
})

describe('listing the days in a range', () => {
  it('includes both ends', () => {
    expect(listDatesInRange({ from: monday, to: wednesday })).toEqual([monday, tuesday, wednesday])
    expect(listDatesInRange({ from: monday, to: monday })).toEqual([monday])
  })

  it('lists nothing for a range that ends before it starts', () => {
    expect(listDatesInRange({ from: wednesday, to: monday })).toEqual([])
  })

  it('lists nothing when either end is not a date', () => {
    expect(listDatesInRange({ from: 'not-a-date', to: wednesday })).toEqual([])
    expect(listDatesInRange({ from: monday, to: 'not-a-date' })).toEqual([])
  })

  it('leaves the weekend out of a working week', () => {
    expect(listWorkingDatesInRange({ from: monday, to: sunday })).toEqual([
      monday,
      tuesday,
      wednesday,
      thursday,
      friday,
    ])
  })

  it('has no working days in a weekend', () => {
    expect(listWorkingDatesInRange({ from: saturday, to: sunday })).toEqual([])
  })
})

describe('formatting a date for a screen', () => {
  it('writes a short, a long and a weekday form', () => {
    expect(formatShortDate(monday)).toBe('21 Sep')
    expect(formatLongDate(monday)).toBe('21 Sep 2026')
    expect(formatWeekday(monday)).toBe('Mon')
  })

  it('shows what it was given rather than an error when that is not a date', () => {
    expect(formatShortDate('not-a-date')).toBe('not-a-date')
    expect(formatLongDate('not-a-date')).toBe('not-a-date')
    expect(formatWeekday('not-a-date')).toBe('')
  })

  // Written without a zone so the expectation does not move with the machine's.
  it('writes a timestamp to the minute', () => {
    expect(formatTimestamp(`${monday}T14:30:00`)).toBe('21 Sep 2026, 14:30')
  })

  it('shows what it was given rather than an error when that is not a timestamp', () => {
    expect(formatTimestamp('nonsense')).toBe('nonsense')
  })
})

describe('how long ago something was', () => {
  it('counts whole days and truncates the part day', () => {
    expect(daysSince(`${monday}T00:00:00`, new Date(`${friday}T00:00:00`))).toBe(4)
    expect(daysSince(`${monday}T00:00:00`, new Date(`${tuesday}T23:59:00`))).toBe(1)
    expect(daysSince(`${monday}T09:00:00`, new Date(`${monday}T17:00:00`))).toBe(0)
  })

  it('counts a future timestamp as fewer than no days', () => {
    expect(daysSince(`${friday}T00:00:00`, new Date(`${thursday}T00:00:00`))).toBe(-1)
  })

  it('has no count for something that is not a timestamp', () => {
    expect(daysSince('nonsense')).toBeNull()
  })
})

describe('relative time', () => {
  // The wording comes from formatDistanceToNowStrict, which reads the real
  // clock rather than the `now` argument, so the two have to be held together.
  afterEach(() => {
    vi.useRealTimers()
  })

  function at(isoTimestamp: string, elapsedMs: number): string {
    const now = new Date(isoTimestamp)
    vi.useFakeTimers()
    vi.setSystemTime(now)

    return formatRelativeTime(new Date(now.getTime() - elapsedMs).toISOString(), now)
  }

  it('says just now for anything under a minute', () => {
    expect(at(`${friday}T12:00:00`, 0)).toBe('Just now')
    expect(at(`${friday}T12:00:00`, 59_000)).toBe('Just now')
  })

  it('counts minutes, hours and days while they are recent', () => {
    expect(at(`${friday}T12:00:00`, 5 * 60_000)).toBe('5 minutes ago')
    expect(at(`${friday}T12:00:00`, 3 * 60 * 60_000)).toBe('3 hours ago')
    expect(at(`${friday}T12:00:00`, 2 * 24 * 60 * 60_000)).toBe('2 days ago')
  })

  it('gives the date once something is a week old', () => {
    expect(at(`${friday}T12:00:00`, 7 * 24 * 60 * 60_000)).toBe('18 Sep 2026')
    expect(at(`${friday}T12:00:00`, 40 * 24 * 60 * 60_000)).toBe('16 Aug 2026')
  })

  it('shows what it was given rather than an error when that is not a timestamp', () => {
    expect(formatRelativeTime('nonsense')).toBe('nonsense')
  })
})
