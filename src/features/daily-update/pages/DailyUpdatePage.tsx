import { useAuth } from '@app/providers/auth-context'
import { EntryList } from '@components/ui/entry-list/EntryList'
import { ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { PagePlaceholder } from '@components/ui/page-placeholder/PagePlaceholder'
import { Panel } from '@components/ui/panel/Panel'
import { useDailyWorkEntries } from '@hooks/use-work-tracker'
import { canSubmitDailyUpdate, canViewTeamData } from '@services/auth/index'
import { formatLongDate, todayIsoDate } from '@utils/date.utils'

import { DailyUpdateForm } from '../components/DailyUpdateForm'

import './DailyUpdatePage.scss'

/**
 * Submitting today's work, and reading back what has been submitted.
 *
 * The day's entries sat beside the form once, were taken away on the argument that the
 * dashboard and Team Activity already show them, and are back — because the screen is a
 * form of six fields, and a screen of six fields in a window this size is mostly empty.
 * The space had been going to the form's own card, which grew to fill it and became a
 * white surface with a third of its height holding nothing.
 *
 * They earn their place beyond filling it, which is why they are what came back rather
 * than something decorative. This is the one screen where a person is *writing* updates,
 * so it is the one place where "have I already logged that task" is a live question — the
 * form itself says "log one entry per task", and until now the way to check was to go to
 * another screen and come back. A saved entry appearing in the list underneath is also the
 * only confirmation the write actually landed that does not disappear like a snackbar.
 *
 * Read-only, deliberately. Amending and removing an entry stays on Team Activity, where
 * the permission to do it is already worked out and where somebody looking for yesterday's
 * mistake is already going to look.
 */
export function DailyUpdatePage() {
  const { user } = useAuth()
  const today = todayIsoDate()

  // Today only. The question this answers is "what have I logged today", and a range
  // would make it a history — which is the dashboard's job and Team Activity's.
  const entriesQuery = useDailyWorkEntries({ dateFrom: today, dateTo: today })

  if (!canSubmitDailyUpdate(user)) {
    return (
      <PagePlaceholder
        description="This account is not linked to a developer record, so it cannot log work. Ask your mentor to check the account setup."
        title="Daily update unavailable"
      />
    )
  }

  const entries = entriesQuery.data ?? []

  return (
    <div className="daily-update-page">
      <section className="daily-update-page__panel">
        <header className="daily-update-page__header">
          <h1 className="daily-update-page__title">Daily update</h1>
          <p className="daily-update-page__subtitle">
            Type what you worked on and pick the rest. It should take under two minutes.
          </p>
        </header>

        <DailyUpdateForm date={today} />
      </section>

      {/* Given the rest of the window, but only while it has something to put in it — an
          empty list has no more use for the height than the form above does, and a
          sentence floating in a half-empty card is what this screen was fixing. */}
      <Panel
        description={formatLongDate(today)}
        fills={entries.length > 0}
        title="Logged today"
      >
        {entriesQuery.error !== null ? (
          <ErrorState
            message={`Today’s entries could not be loaded: ${entriesQuery.error.message}`}
            onRetry={() => void entriesQuery.refetch()}
          />
        ) : entriesQuery.isPending ? (
          <Skeleton label="Reading today’s entries…" rows={3} />
        ) : (
          <EntryList
            emptyMessage="Nothing logged for today yet. What you save above appears here."
            entries={entries}
            // Every row is the same person on a developer's own screen, so their name
            // would be repeated down the list. An administrator or mentor logging on
            // somebody else's behalf needs to see whose entry it is.
            showDeveloper={canViewTeamData(user)}
          />
        )}
      </Panel>
    </div>
  )
}
