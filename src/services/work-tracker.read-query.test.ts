import { describe, expect, it } from 'vitest'

import type { AppUser, MentorAssignment } from '@models/index'
import { buildAccessScope } from '@services/auth/access-scope'

import { buildDailyWorkReadQuery } from './work-tracker.service'

const shubham = 'shubham'
const generalFlow = 'general-flow'

function user(partial: Pick<AppUser, 'role'> & Partial<AppUser>): AppUser {
  return {
    email: 'mentor@example.com',
    name: 'Mentor',
    ...partial,
  }
}

function assignment(mentorId: string, developerId: string): MentorAssignment {
  return { mentorId, developerId, active: true }
}

describe('buildDailyWorkReadQuery', () => {
  it('keeps a chosen developer and project on the request when the scope list would be empty', () => {
    const scope = buildAccessScope(
      user({ role: 'mentor', mentorId: 'mentor-1' }),
      [assignment('mentor-1', shubham)],
      [],
    )

    const query = buildDailyWorkReadQuery(scope!, {
      dateFrom: '2026-09-21',
      dateTo: '2026-09-27',
      developerIds: [shubham],
      projectIds: [generalFlow],
    })

    expect(query.developerIds).toEqual([shubham])
    expect(query.projectIds).toEqual([generalFlow])
    expect(query.developerIds).not.toEqual([])
    expect(query.projectIds).not.toEqual([])
  })
})
