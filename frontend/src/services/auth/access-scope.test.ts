import { describe, expect, it } from 'vitest'

import type { AppUser, MentorAssignment } from '@models/index'

import {
  buildAccessScope,
  canViewDeveloper,
  filterByScope,
  isUnrestricted,
  restrictDeveloperIds,
} from './access-scope'

function user(overrides: Partial<AppUser> & Pick<AppUser, 'role'>): AppUser {
  return { email: 'person@handt.ai', name: 'Person', ...overrides }
}

function assignment(
  mentorId: string,
  developerId: string,
  active = true,
): MentorAssignment {
  return { mentorId, developerId, active }
}

/**
 * This mirrors what the services enforce, and exists so screens can hide what
 * a person cannot reach. It is not the guard: a crafted request is still
 * filtered server-side.
 */
describe('what each role can see', () => {
  it('gives an administrator the whole team', () => {
    const scope = buildAccessScope(user({ role: 'admin' }), [])

    expect(scope).not.toBeNull()
    expect(isUnrestricted(scope!)).toBe(true)
    expect(scope!.readsRoster).toBe(true)
    expect(canViewDeveloper(scope!, 'anyone')).toBe(true)
  })

  it('gives a mentor the employees assigned to them, and themselves', () => {
    const scope = buildAccessScope(
      user({ role: 'mentor', mentorId: 'men-1', developerId: 'dev-9' }),
      [
        assignment('men-1', 'dev-1'),
        assignment('men-1', 'dev-2'),
        assignment('men-2', 'dev-3'),
        assignment('men-1', 'dev-4', false),
      ],
    )

    expect(scope!.visibleDeveloperIds).toEqual(['dev-1', 'dev-2', 'dev-9'])
  })

  // A mentor runs the team screens, so the roster is readable even though the
  // work of an unassigned employee is not.
  it('lets a mentor read the roster', () => {
    const scope = buildAccessScope(user({ role: 'mentor', mentorId: 'men-1' }), [])

    expect(scope!.readsRoster).toBe(true)
    expect(canViewDeveloper(scope!, 'dev-1')).toBe(false)
  })

  it('gives a developer only their own record', () => {
    const scope = buildAccessScope(
      user({ role: 'developer', developerId: 'dev-1' }),
      [assignment('men-1', 'dev-2')],
    )

    expect(scope!.visibleDeveloperIds).toEqual(['dev-1'])
    expect(scope!.readsRoster).toBe(false)
  })

  it('gives a developer with no employee row nothing', () => {
    const scope = buildAccessScope(user({ role: 'developer' }), [])

    expect(scope!.visibleDeveloperIds).toEqual([])
  })

  it('has no scope for somebody who is not signed in', () => {
    expect(buildAccessScope(null, [])).toBeNull()
  })
})

describe('narrowing a request to what is in scope', () => {
  const mentorScope = buildAccessScope(user({ role: 'mentor', mentorId: 'men-1' }), [
    assignment('men-1', 'dev-1'),
    assignment('men-1', 'dev-2'),
  ])!

  it('drops the ids the caller may not ask about', () => {
    expect(restrictDeveloperIds(mentorScope, ['dev-2', 'dev-3'])).toEqual(['dev-2'])
  })

  it('asks for everyone in scope when the caller named nobody', () => {
    expect(restrictDeveloperIds(mentorScope, undefined)).toEqual(['dev-1', 'dev-2'])
  })

  it('leaves the request of an administrator as it was', () => {
    const adminScope = buildAccessScope(user({ role: 'admin' }), [])!

    expect(restrictDeveloperIds(adminScope, ['dev-3'])).toEqual(['dev-3'])
    expect(restrictDeveloperIds(adminScope, undefined)).toBeUndefined()
  })

  it('keeps only the records belonging to employees in scope', () => {
    const rows = [
      { developerId: 'dev-1', title: 'In scope' },
      { developerId: 'dev-3', title: 'Someone else' },
    ]

    expect(filterByScope(mentorScope, rows)).toEqual([{ developerId: 'dev-1', title: 'In scope' }])
  })
})
