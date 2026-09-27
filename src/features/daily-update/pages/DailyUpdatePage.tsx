import { useState } from 'react'

import { useAuth } from '@app/providers/auth-context'
import { Button } from '@components/ui/button/Button'
import { EntryList } from '@components/ui/entry-list/EntryList'
import { ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { PagePlaceholder } from '@components/ui/page-placeholder/PagePlaceholder'
import { Panel } from '@components/ui/panel/Panel'
import { useDailyWorkEntries } from '@hooks/use-work-tracker'
import { canSubmitDailyUpdate, canViewTeamData } from '@services/auth/index'
import { formatLongDate, todayIsoDate } from '@utils/date/date.utils'

import { DailyUpdateForm } from '../components/DailyUpdateForm'
import { PendingUpdates } from '../components/PendingUpdates'

import './DailyUpdatePage.scss'

export function DailyUpdatePage() {
  const { user } = useAuth()
  const today = todayIsoDate()

  /**
   * Which day the form is filling in. Today unless a day behind was picked
   * from the panel below — the form has always taken a date, and its schema
   * has always accepted a past one, so backfilling is a matter of saying which
   * day rather than of a second form.
   */
  const [activeDate, setActiveDate] = useState(today)

  const isBackfilling = activeDate !== today

  const entriesQuery = useDailyWorkEntries({ dateFrom: activeDate, dateTo: activeDate })

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
            {isBackfilling
              ? `Filling in ${formatLongDate(activeDate)}, which has nothing logged against it.`
              : 'Type what you worked on and pick the rest. It should take under two minutes.'}
          </p>

          {!isBackfilling ? null : (
            <div className="daily-update-page__back">
              <Button
                icon="chevron-left"
                onClick={() => {
                  setActiveDate(today)
                }}
                size="small"
                variant="secondary"
              >
                Back to today
              </Button>
            </div>
          )}
        </header>

        {/* Keyed by date so the form starts again on the day that was picked,
            rather than keeping the previous day's defaults. */}
        <DailyUpdateForm date={activeDate} key={activeDate} />
      </section>

      {user?.developerId === undefined ? null : (
        <PendingUpdates
          activeDate={activeDate}
          developerId={user.developerId}
          onPickDate={setActiveDate}
        />
      )}

      <Panel
        description={formatLongDate(activeDate)}
        fills={entries.length > 0}
        title={isBackfilling ? 'Logged on that day' : 'Logged today'}
      >
        {entriesQuery.error !== null ? (
          <ErrorState
            message={`Entries for that day could not be loaded: ${entriesQuery.error.message}`}
            onRetry={() => void entriesQuery.refetch()}
          />
        ) : entriesQuery.isPending ? (
          <Skeleton label="Reading that day’s entries…" rows={3} />
        ) : (
          <EntryList
            emptyMessage="Nothing logged for this day yet. What you save above appears here."
            entries={entries}
            showDeveloper={canViewTeamData(user)}
          />
        )}
      </Panel>
    </div>
  )
}
