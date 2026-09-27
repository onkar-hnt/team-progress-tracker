import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import type { Developer } from '@models/index'
import type { DayOverview } from '@services/work-tracker.views'

import { MissingUpdatesPanel } from './MissingUpdatesPanel'

const WORKING_DAY = '2026-09-24'
const SATURDAY = '2026-09-26'

function developer(name: string, partial: Partial<Developer> = {}): Developer {
  return { id: name.toLowerCase(), name, active: true, ...partial }
}

function day(partial: Partial<DayOverview> = {}): DayOverview {
  return {
    date: WORKING_DAY,
    entries: [],
    statuses: {
      total: 0,
      notStarted: 0,
      inProgress: 0,
      completed: 0,
      blocked: 0,
      needsAttention: 0,
    },
    completionRate: 0,
    hoursLogged: 0,
    developersUpdated: [],
    developersMissingUpdate: [],
    developersOnLeave: [],
    blockedEntries: [],
    ...partial,
  }
}

function renderPanel(props: Parameters<typeof MissingUpdatesPanel>[0]) {
  return render(
    <MemoryRouter>
      <MissingUpdatesPanel {...props} />
    </MemoryRouter>,
  )
}

describe('MissingUpdatesPanel', () => {
  it('names everybody who has not accounted for the day, and links to each of them', () => {
    renderPanel({
      day: day({ developersMissingUpdate: [developer('Asha'), developer('Ravi')] }),
      isLoading: false,
      selectedDate: WORKING_DAY,
    })

    expect(screen.getByRole('link', { name: 'Asha' })).toHaveAttribute('href', '/developers/asha')
    expect(screen.getByRole('link', { name: 'Ravi' })).toHaveAttribute('href', '/developers/ravi')
  })

  it('shows a developer’s role beside their name when one is recorded', () => {
    renderPanel({
      day: day({ developersMissingUpdate: [developer('Asha', { role: 'Backend' })] }),
      isLoading: false,
      selectedDate: WORKING_DAY,
    })

    expect(screen.getByText('Backend')).toBeInTheDocument()
  })

  it('says nothing is outstanding rather than showing an empty list', () => {
    renderPanel({ day: day(), isLoading: false, selectedDate: WORKING_DAY })

    expect(screen.getByText('Nothing outstanding')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('names the one person on leave, but only counts them once there are several', () => {
    const { unmount } = renderPanel({
      day: day({ developersOnLeave: [developer('Asha')] }),
      isLoading: false,
      selectedDate: WORKING_DAY,
    })

    expect(screen.getByText('Asha is on leave.')).toBeInTheDocument()
    unmount()

    renderPanel({
      day: day({ developersOnLeave: [developer('Asha'), developer('Ravi')] }),
      isLoading: false,
      selectedDate: WORKING_DAY,
    })

    expect(screen.getByText('2 people are on leave.')).toBeInTheDocument()
  })

  it('says no updates are expected on a day that is not a working day', () => {
    renderPanel({ day: day(), isLoading: false, selectedDate: SATURDAY })

    expect(
      screen.getByText('The selected day is not a working day, so no updates are expected.'),
    ).toBeInTheDocument()
  })

  /** The panel shares a loading flag with the week query, so it waits for both. */
  it('shows the placeholder while anything it depends on is still loading', () => {
    renderPanel({
      day: day({ developersMissingUpdate: [developer('Asha')] }),
      isLoading: true,
      selectedDate: WORKING_DAY,
    })

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText('Asha')).not.toBeInTheDocument()
  })
})
