import { useAuth } from '@app/providers/auth-context'
import { useSnackbar } from '@app/providers/snackbar-context'
import { CheckboxField } from '@components/ui/field/Field'
import { ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { Panel } from '@components/ui/panel/Panel'
import { useMutedNotificationTypes, useSaveMutedNotificationTypes } from '@hooks/use-notifications'
import type { NotificationType } from '@models/index'
import { logFailure, toUserMessage } from '@services/errors/error-message'
import { areNotificationsAvailable } from '@services/notifications/notification.service'

import './NotificationPreferences.scss'

/**
 * Which notifications somebody wants.
 *
 * Lives with the notifications feature rather than with the Profile page that
 * renders it, because the wording of each line has to stay next to the triggers
 * that produce the notification — "somebody else changes the status of your task"
 * is a claim about `notify_task_status_change`, not about the page it appears on. The
 * page composes it the same way the header composes the bell.
 *
 * Stored as the types that are *off* and shown as the ones that are *on*, so the
 * empty row a new account has means everything is delivered. Enforcement is in
 * the database, in `enqueue_notification`: a muted notification is never written,
 * so it cannot arrive in the badge count or over the websocket.
 */

/**
 * One line on the screen, and the types it covers.
 *
 * Grouped rather than one line per type because `task_assigned` and
 * `task_reassigned` are the same concern to the person receiving them — a task
 * became theirs — and differ only in whether it had an owner before. Two
 * tickboxes would invite a combination that means nothing.
 */
interface PreferenceGroup {
  id: string

  /**
   * Whether the notification reaches somebody as the person doing the work or as
   * somebody responsible for it. Decides who is shown the line at all: every one
   * of the six types is addressed through a `developers` or `mentors` row, so a
   * line for a capacity somebody does not hold would offer to switch off
   * something they could never receive.
   */
  capacity: 'developer' | 'mentor'

  /** Completes "You will be notified when …", so it starts lower case. */
  event: string

  hint?: string

  types: readonly NotificationType[]
}

const PREFERENCE_GROUPS: readonly PreferenceGroup[] = [
  {
    id: 'assignment',
    capacity: 'developer',
    event: 'a task is assigned to you',
    hint: 'Both a new task created for you and one moved to you from somebody else.',
    types: ['task_assigned', 'task_reassigned'],
  },
  {
    id: 'status',
    capacity: 'developer',
    event: 'somebody else changes the status of your task',
    hint: 'Your own changes are never notified, including the status a daily update sets.',
    types: ['task_status_changed'],
  },
  {
    id: 'feedback',
    capacity: 'developer',
    event: 'a mentor leaves feedback on your work',
    types: ['feedback_added'],
  },
  {
    id: 'daily-updates',
    capacity: 'mentor',
    event: 'somebody you mentor submits a daily update',
    hint: 'One notification per update, for each developer assigned to you.',
    types: ['daily_update_submitted'],
  },
  {
    id: 'blocked',
    capacity: 'mentor',
    event: 'somebody you mentor flags a blocker',
    hint: 'Blocked work stays listed on your dashboard whether this is on or off.',
    types: ['work_blocked'],
  },
]

export function NotificationPreferences() {
  const { user } = useAuth()
  const snackbar = useSnackbar()
  const muted = useMutedNotificationTypes()
  const save = useSaveMutedNotificationTypes()

  // Hidden rather than shown disabled: on a deployment without notifications
  // there is no bell either, so a screen offering to configure them would be
  // describing a feature that is not there.
  if (!areNotificationsAvailable() || user === null) return null

  const groups = PREFERENCE_GROUPS.filter((group) =>
    group.capacity === 'developer' ? user.developerId !== undefined : user.mentorId !== undefined,
  )

  const current = muted.data ?? []

  const toggle = (group: PreferenceGroup, isOn: boolean) => {
    const next = isOn
      ? current.filter((type) => !group.types.includes(type))
      : [...current, ...group.types.filter((type) => !current.includes(type))]

    save.mutate(next, {
      onSuccess: () => {
        snackbar.success(`You will ${isOn ? '' : 'no longer '}be notified when ${group.event}.`)
      },
      onError: (error) => {
        logFailure('save notification preferences', error)
        snackbar.error(toUserMessage(error, 'That preference could not be saved.'))
      },
    })
  }

  return (
    <Panel
      description="Everything is on unless you say otherwise. Switching one off stops the notification being created at all, so it will not appear in the bell or its count."
      title="Notifications"
    >
      {muted.isPending ? (
        <Skeleton label="Loading your notification preferences…" rows={3} />
      ) : muted.isError ? (
        <ErrorState
          message={toUserMessage(muted.error, 'Your notification preferences could not be read.')}
          onRetry={() => void muted.refetch()}
        />
      ) : groups.length === 0 ? (
        // An administrator with neither an employee nor a mentor record. Every
        // notification is addressed through one or the other, so there is
        // genuinely nothing for them to turn off, and empty tickboxes would
        // suggest they were receiving something.
        <p className="notification-preferences__note">
          Notifications are addressed to people through their employee or mentor record, and your
          account is linked to neither, so none are sent to you.
        </p>
      ) : (
        <div className="notification-preferences">
          {groups.map((group) => {
            const isOn = !group.types.some((type) => current.includes(type))

            return (
              <CheckboxField
                checked={isOn}
                id={`notify-${group.id}`}
                key={group.id}
                label={capitaliseFirst(group.event)}
                onChange={() => {
                  toggle(group, !isOn)
                }}
                {...(group.hint === undefined ? {} : { hint: group.hint })}
              />
            )
          })}
        </div>
      )}
    </Panel>
  )
}

/**
 * The event clause, as a label.
 *
 * Each `event` is written to complete a sentence, which is where it is read most
 * — in the confirmation after a change — so the tickbox borrows it and lifts the
 * first letter rather than the two being worded separately and drifting apart.
 */
function capitaliseFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
