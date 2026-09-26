import { describe, expect, it } from 'vitest'

import { parseDailyWorkQuery, serializeDailyWorkQuery } from '@hooks/query-keys'

import type { ActivityFilterState } from './activity-filters'
import {
  activityFiltersFromNavigation,
  activityRangeLink,
  createDefaultFilters,
  toDailyWorkQuery,
} from './activity-filters'

const shubham = 'shubham'
const generalFlow = 'general-flow'

function filters(partial: Partial<ActivityFilterState> = {}): ActivityFilterState {
  return { ...createDefaultFilters(), ...partial }
}

describe('team activity filters', () => {
  it('sends the selected developer and project to the list request', () => {
    const query = toDailyWorkQuery(
      filters({
        developerId: shubham,
        projectId: generalFlow,
        status: 'completed',
        priority: 'medium',
        blockedOnly: true,
        search: 'freeze',
      }),
    )

    expect(query.developerIds).toEqual([shubham])
    expect(query.projectIds).toEqual([generalFlow])
    expect(query.statuses).toEqual(['completed'])
    expect(query.priorities).toEqual(['medium'])
    expect(query.isBlocked).toBe(true)
    expect(query).not.toHaveProperty('search')
  })

  it('changes the request when the developer changes', () => {
    const everyone = toDailyWorkQuery(filters())
    const oneDeveloper = toDailyWorkQuery(filters({ developerId: shubham }))

    expect(everyone.developerIds).toBeUndefined()
    expect(oneDeveloper.developerIds).toEqual([shubham])
    expect(oneDeveloper).not.toEqual(everyone)
    expect(serializeDailyWorkQuery(oneDeveloper)).not.toBe(serializeDailyWorkQuery(everyone))
    expect(parseDailyWorkQuery(serializeDailyWorkQuery(oneDeveloper))?.developerIds).toEqual([
      shubham,
    ])
  })

  it('keeps a drill-down off the query string', () => {
    const link = activityRangeLink(
      { from: '2026-09-21', to: '2026-09-27' },
      { developerId: shubham, projectId: generalFlow },
    )

    expect(link.pathname).toBe('/team-activity')
    expect(link).not.toHaveProperty('search')
    expect(link.state.activityFilters.developerId).toBe(shubham)
    expect(link.state.activityFilters.projectId).toBe(generalFlow)
    expect(link.state.activityFilters.preset).toBe('custom')
  })

  it('reads an older query string once, without requiring it to stay in the address bar', () => {
    const params = new URLSearchParams({ developer: shubham, project: generalFlow })

    expect(activityFiltersFromNavigation(null, params).developerId).toBe(shubham)
    expect(activityFiltersFromNavigation(null, params).projectId).toBe(generalFlow)
  })
})
