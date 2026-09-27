import { isWorkingDay } from '@utils/date/date.utils'

/**
 * When somebody is reminded that their daily update is not in yet.
 *
 * Two times rather than a repeating nag: late morning, when the day is far
 * enough along to have something to report, and mid-afternoon, which is the
 * last point at which the reminder can still be acted on before the day ends.
 *
 * Read from the reader's own clock. The day a person is being asked about is
 * their calendar day, and the office it is 11 o'clock in is theirs.
 */

export type ReminderSlotId = 'afternoon' | 'morning'

export interface ReminderSlot {
  id: ReminderSlotId

  /** Local hour from which this reminder is owed. */
  hour: number

  /** Completes "…, and your update is not in yet." */
  moment: string
}

const REMINDER_SLOTS: readonly ReminderSlot[] = [
  { id: 'morning', hour: 11, moment: 'It is mid-morning' },
  { id: 'afternoon', hour: 16, moment: 'The day is nearly over' },
]

export interface ReminderQuestion {
  now: Date

  /** The date being asked about, from the same clock as `now`. */
  date: string

  hasSubmitted: boolean
  isOnLeave: boolean

  /** Slots already dismissed for `date`. */
  dismissed: readonly ReminderSlotId[]
}

/**
 * Which reminder is owed, if any.
 *
 * Only the latest slot that has come round is considered. Somebody who was
 * away from the application all morning is asked once, at four o'clock, about
 * the day as it stands — not twice about a morning that has passed. Dismissing
 * that one ends the matter until the next slot.
 */
export function dueReminder(question: ReminderQuestion): ReminderSlot | undefined {
  if (question.hasSubmitted || question.isOnLeave) return undefined
  if (!isWorkingDay(question.date)) return undefined

  const due = [...REMINDER_SLOTS]
    .reverse()
    .find((slot) => question.now.getHours() >= slot.hour)

  if (due === undefined) return undefined

  return question.dismissed.includes(due.id) ? undefined : due
}

/**
 * Dismissals, kept per day.
 *
 * In `localStorage` rather than in the database: "I have seen this" is about
 * one browser on one afternoon, and a table for it would outlive the thing it
 * describes. Yesterday's record is dropped by storing the date alongside.
 */
const REMINDER_STORAGE_KEY = 'team-progress-tracker.update-reminder'

interface StoredDismissal {
  date: string
  slots: ReminderSlotId[]
}

const SLOT_IDS: readonly string[] = REMINDER_SLOTS.map((slot) => slot.id)

function isSlotId(value: unknown): value is ReminderSlotId {
  return typeof value === 'string' && SLOT_IDS.includes(value)
}

/** Anything unreadable, or left from another day, counts as nothing dismissed. */
export function parseDismissal(raw: string | null, date: string): ReminderSlotId[] {
  if (raw === null) return []

  let parsed: unknown

  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }

  if (typeof parsed !== 'object' || parsed === null) return []

  const stored = parsed as Partial<StoredDismissal>
  if (stored.date !== date || !Array.isArray(stored.slots)) return []

  return stored.slots.filter(isSlotId)
}

export function serializeDismissal(date: string, slots: readonly ReminderSlotId[]): string {
  return JSON.stringify({ date, slots: [...new Set(slots)] } satisfies StoredDismissal)
}

export function readDismissedSlots(date: string): ReminderSlotId[] {
  try {
    return parseDismissal(window.localStorage.getItem(REMINDER_STORAGE_KEY), date)
  } catch {
    // Private browsing modes can throw on storage access; asking again is the
    // safe failure, since the alternative is never asking.
    return []
  }
}

export function rememberDismissedSlots(date: string, slots: readonly ReminderSlotId[]): void {
  try {
    window.localStorage.setItem(REMINDER_STORAGE_KEY, serializeDismissal(date, slots))
  } catch {
    // The reminder will come back on the next tick. That is a smaller problem
    // than refusing to dismiss it.
  }
}
