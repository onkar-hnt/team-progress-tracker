import { describe, expect, it } from 'vitest'

import {
  dueReminder,
  parseDismissal,
  serializeDismissal,
} from '@features/daily-update/update-reminder'
import type { ReminderSlotId } from '@features/daily-update/update-reminder'

/** Tuesday 22 September 2026, and the Saturday after it. */
const tuesday = '2026-09-22'
const saturday = '2026-09-26'

function at(hour: number, minute = 0): Date {
  return new Date(2026, 8, 22, hour, minute)
}

function question(partial: {
  now: Date
  date?: string
  hasSubmitted?: boolean
  isOnLeave?: boolean
  dismissed?: readonly ReminderSlotId[]
}) {
  return {
    date: tuesday,
    hasSubmitted: false,
    isOnLeave: false,
    dismissed: [],
    ...partial,
  }
}

describe('when a reminder is owed', () => {
  it('says nothing before the morning slot', () => {
    expect(dueReminder(question({ now: at(10, 59) }))).toBeUndefined()
  })

  it('asks from eleven in the morning', () => {
    expect(dueReminder(question({ now: at(11) }))?.id).toBe('morning')
  })

  it('still asks in the early afternoon', () => {
    expect(dueReminder(question({ now: at(15, 30) }))?.id).toBe('morning')
  })

  it('asks again at four, as the later reminder', () => {
    expect(dueReminder(question({ now: at(16) }))?.id).toBe('afternoon')
  })

  it('says nothing once the update is in', () => {
    expect(dueReminder(question({ now: at(16), hasSubmitted: true }))).toBeUndefined()
  })

  it('says nothing on a day accounted for as leave', () => {
    expect(dueReminder(question({ now: at(16), isOnLeave: true }))).toBeUndefined()
  })

  it('says nothing at the weekend', () => {
    expect(dueReminder(question({ now: at(16), date: saturday }))).toBeUndefined()
  })
})

describe('dismissing a reminder', () => {
  it('stops the reminder it was dismissed for', () => {
    expect(dueReminder(question({ now: at(12), dismissed: ['morning'] }))).toBeUndefined()
  })

  it('does not stop the later one', () => {
    expect(dueReminder(question({ now: at(16), dismissed: ['morning'] }))?.id).toBe('afternoon')
  })

  it('does not reopen the morning after the afternoon is dismissed', () => {
    expect(dueReminder(question({ now: at(16), dismissed: ['afternoon'] }))).toBeUndefined()
  })

  it('never asks twice about a morning nobody was there for', () => {
    // Away all morning, so the morning slot was never dismissed. Four o'clock
    // asks once, about the day as it stands.
    expect(dueReminder(question({ now: at(16, 5) }))?.id).toBe('afternoon')
  })
})

describe('remembering dismissals', () => {
  it('reads back what it stored', () => {
    const raw = serializeDismissal(tuesday, ['morning'])
    expect(parseDismissal(raw, tuesday)).toEqual(['morning'])
  })

  it('keeps each slot once', () => {
    const raw = serializeDismissal(tuesday, ['morning', 'morning', 'afternoon'])
    expect(parseDismissal(raw, tuesday)).toEqual(['morning', 'afternoon'])
  })

  it('ignores a record left from another day', () => {
    const raw = serializeDismissal('2026-09-21', ['morning', 'afternoon'])
    expect(parseDismissal(raw, tuesday)).toEqual([])
  })

  it('ignores nothing stored, malformed text and unknown slots', () => {
    expect(parseDismissal(null, tuesday)).toEqual([])
    expect(parseDismissal('not json', tuesday)).toEqual([])
    expect(parseDismissal('[]', tuesday)).toEqual([])
    expect(parseDismissal(JSON.stringify({ date: tuesday, slots: ['teatime'] }), tuesday)).toEqual(
      [],
    )
  })
})
