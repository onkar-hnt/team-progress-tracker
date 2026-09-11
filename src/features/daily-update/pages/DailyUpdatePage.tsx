import { useAuth } from '@app/providers/auth-context'
import { PagePlaceholder } from '@components/ui/page-placeholder/PagePlaceholder'
import { canSubmitDailyUpdate } from '@services/auth/index'
import { todayIsoDate } from '@utils/date.utils'

import { DailyUpdateForm } from '../components/DailyUpdateForm'

import './DailyUpdatePage.scss'

/**
 * Submitting today's work, and nothing else.
 *
 * The day's existing entries used to sit beside the form. They are read back
 * on the dashboard and, for the people who oversee others, on Team Activity —
 * so repeating them here only put a list to manage in the way of the one
 * thing this screen exists for. Amending or removing an entry stays on Team
 * Activity, which is also where the permission to do it is already decided.
 */
export function DailyUpdatePage() {
  const { user } = useAuth()

  if (!canSubmitDailyUpdate(user)) {
    return (
      <PagePlaceholder
        description="This account is not linked to a developer record, so it cannot log work. Ask your mentor to check the account setup."
        title="Daily update unavailable"
      />
    )
  }

  return (
    <div className="daily-update-page">
      <section className="daily-update-page__panel">
        <header className="daily-update-page__header">
          <h1 className="daily-update-page__title">Daily update</h1>
          <p className="daily-update-page__subtitle">
            Type what you worked on and pick the rest. It should take under two minutes.
          </p>
        </header>

        <DailyUpdateForm date={todayIsoDate()} />
      </section>
    </div>
  )
}
