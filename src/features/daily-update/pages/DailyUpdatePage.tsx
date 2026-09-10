import { useState } from 'react'

import { useAuth } from '@app/providers/auth-context'
import { PagePlaceholder } from '@components/ui/page-placeholder/PagePlaceholder'
import { canSubmitDailyUpdate, isAdmin } from '@services/auth/index'
import { formatLongDate, todayIsoDate } from '@utils/date.utils'

import { DailyUpdateEntries } from '../components/DailyUpdateEntries'
import { DailyUpdateForm } from '../components/DailyUpdateForm'

import './DailyUpdatePage.scss'

export function DailyUpdatePage() {
  const { user } = useAuth()

  // The form owns the date field; the page mirrors it so the entry list below
  // always reflects the day being logged.
  const [selectedDate, setSelectedDate] = useState(todayIsoDate)

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

        <DailyUpdateForm date={selectedDate} onDateChange={setSelectedDate} />
      </section>

      <section className="daily-update-page__panel">
        <header className="daily-update-page__header">
          <h2 className="daily-update-page__section-title">
            {isAdmin(user) ? 'Team entries' : 'Your entries'}
          </h2>
          <p className="daily-update-page__subtitle">{formatLongDate(selectedDate)}</p>
        </header>

        <DailyUpdateEntries date={selectedDate} />
      </section>
    </div>
  )
}
