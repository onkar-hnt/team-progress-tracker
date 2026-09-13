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

export function DailyUpdatePage() {
  const { user } = useAuth()
  const today = todayIsoDate()

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
            showDeveloper={canViewTeamData(user)}
          />
        )}
      </Panel>
    </div>
  )
}
