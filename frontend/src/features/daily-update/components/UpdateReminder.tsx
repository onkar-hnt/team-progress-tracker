import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '@app/providers/auth-context'
import { Button } from '@components/ui/button/Button'
import { Modal } from '@components/ui/modal/Modal'
import { useDailyWorkEntries, useLeaveDays } from '@hooks/use-work-tracker'
import { canSubmitDailyUpdate } from '@services/auth/index'
import { formatLongDate, toIsoDate } from '@utils/date.utils'

import { dueReminder, readDismissedSlots, rememberDismissedSlots } from '../utils/update-reminder'
import type { ReminderSlotId } from '../utils/update-reminder'

import './UpdateReminder.scss'

/**
 * The reminder that a day has not been accounted for.
 *
 * Mounted in the shell rather than on a screen, because the person who needs it
 * is by definition not on the daily update screen. It asks twice — see
 * `update-reminder.ts` for when — and only of somebody who has an update to
 * give: an administrator with no employee record owes nobody anything.
 */
export function UpdateReminder() {
  const { user } = useAuth()

  if (user === null || user.developerId === undefined || !canSubmitDailyUpdate(user)) return null

  return <ReminderClock developerId={user.developerId} />
}

/** A minute is fine: the slots are hours apart. */
const TICK_MS = 60_000

/**
 * Re-reads the clock rather than scheduling for a slot, so an application left
 * open over lunch — or over midnight — reaches the same conclusion a fresh one
 * would. The date keys the watcher below, which is what gives a new day its own
 * dismissals without anything having to reset them.
 */
function ReminderClock({ developerId }: { developerId: string }) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date())
    }, TICK_MS)

    return () => {
      window.clearInterval(timer)
    }
  }, [])

  const date = toIsoDate(now)

  return <ReminderWatcher date={date} developerId={developerId} key={date} now={now} />
}

interface ReminderWatcherProps {
  date: string
  developerId: string
  now: Date
}

function ReminderWatcher({ date, developerId, now }: ReminderWatcherProps) {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const [dismissed, setDismissed] = useState<readonly ReminderSlotId[]>(() =>
    readDismissedSlots(date),
  )

  const entriesQuery = useDailyWorkEntries(
    useMemo(
      () => ({ dateFrom: date, dateTo: date, developerIds: [developerId] }),
      [date, developerId],
    ),
  )

  const leaveQuery = useLeaveDays(
    useMemo(
      () => ({ dateFrom: date, dateTo: date, developerIds: [developerId] }),
      [date, developerId],
    ),
  )

  // Silence until both answers are in. Asking somebody for an update they have
  // already given is worse than asking a minute later.
  const isReady = !entriesQuery.isPending && !leaveQuery.isPending

  const slot = !isReady
    ? undefined
    : dueReminder({
        now,
        date,
        hasSubmitted: (entriesQuery.data ?? []).length > 0,
        isOnLeave: (leaveQuery.data ?? []).length > 0,
        dismissed,
      })

  // Nothing to nag about on the screen that answers it.
  const isOnTheScreen = pathname.startsWith('/daily-update')

  const dismiss = () => {
    if (slot === undefined) return

    const next = [...dismissed, slot.id]
    setDismissed(next)
    rememberDismissedSlots(date, next)
  }

  return (
    <Modal
      isOpen={slot !== undefined && !isOnTheScreen}
      onClose={dismiss}
      size="compact"
      title="Your daily update is not in yet"
    >
      <div className="update-reminder">
        <p className="update-reminder__lead">
          {slot?.moment ?? ''}, and nothing has been logged for {formatLongDate(date)}.
        </p>

        <p className="update-reminder__note">
          It takes a couple of minutes, and it is what your mentor reads to see how your work is
          going.
        </p>

        {/* form__actions is pinned by Modal to match other dialog footers. */}
        <div className="form__actions">
          <Button
            onClick={() => {
              dismiss()
            }}
            variant="secondary"
          >
            Not now
          </Button>

          <Button
            autoFocus
            onClick={() => {
              dismiss()
              void navigate('/daily-update')
            }}
            variant="primary"
          >
            Add it now
          </Button>
        </div>
      </div>
    </Modal>
  )
}
