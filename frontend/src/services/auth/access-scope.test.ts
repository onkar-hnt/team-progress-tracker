import { describe, expect, it } from 'vitest'

import type { AppUser, MentorAssignment } from '@models/index'

import {
  assignedMentorIds,
  buildAccessScope,
  canRequestProject,
  canViewDeveloper,
  canViewDeveloperProject,
  filterByScope,
  isUnrestricted,
  restrictDeveloperIds,
  restrictProjectIds,
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

describe('which projects a person may see work on', () => {
  /** Assigned to dev-1 and dev-2, and responsible for prj-1 only. */
  const mentorScope = buildAccessScope(
    user({ role: 'mentor', mentorId: 'men-1', developerId: 'dev-9' }),
    [assignment('men-1', 'dev-1'), assignment('men-1', 'dev-2')],
    ['prj-1'],
  )!

  it('does not narrow an administrator by project', () => {
    const adminScope = buildAccessScope(user({ role: 'admin' }), [], ['prj-1'])!

    expect(adminScope.visibleProjectIds).toBeNull()
    expect(canRequestProject(adminScope, 'prj-2')).toBe(true)
    expect(canViewDeveloperProject(adminScope, 'anyone', 'prj-2')).toBe(true)
  })

  it('does not narrow a developer reading their own work', () => {
    const scope = buildAccessScope(user({ role: 'developer', developerId: 'dev-1' }), [])!

    expect(scope.visibleProjectIds).toBeNull()
  })

  it('shows an assigned employee only on a project the mentor is responsible for', () => {
    expect(canViewDeveloperProject(mentorScope, 'dev-1', 'prj-1')).toBe(true)
    expect(canViewDeveloperProject(mentorScope, 'dev-1', 'prj-2')).toBe(false)
  })

  it('still hides an unassigned employee on the mentor’s own project', () => {
    expect(canViewDeveloperProject(mentorScope, 'dev-3', 'prj-1')).toBe(false)
  })

  // General feedback is not another project's data, so it stays with every
  // mentor assigned to the employee.
  it('keeps work with no project visible to an assigned mentor', () => {
    expect(canViewDeveloperProject(mentorScope, 'dev-1', undefined)).toBe(true)
  })

  it('never narrows the mentor’s own rows by project', () => {
    expect(canViewDeveloperProject(mentorScope, 'dev-9', 'prj-2')).toBe(true)
  })

  it('answers a mentor asking for every project with their own', () => {
    expect(restrictProjectIds(mentorScope, undefined)).toEqual(['prj-1'])
    expect(restrictProjectIds(mentorScope, ['prj-1', 'prj-2'])).toEqual(['prj-1'])
  })

  it('filters rows by project as well as by employee', () => {
    const rows = [
      { developerId: 'dev-1', projectId: 'prj-1', title: 'Mine to see' },
      { developerId: 'dev-1', projectId: 'prj-2', title: 'Another mentor’s project' },
      { developerId: 'dev-1', title: 'No project at all' },
    ]

    expect(filterByScope(mentorScope, rows).map((row) => row.title)).toEqual([
      'Mine to see',
      'No project at all',
    ])
  })

  it('gives a mentor responsible for nothing no project work of other people', () => {
    const scope = buildAccessScope(
      user({ role: 'mentor', mentorId: 'men-1' }),
      [assignment('men-1', 'dev-1')],
    )!

    expect(scope.visibleProjectIds).toEqual([])
    expect(canViewDeveloperProject(scope, 'dev-1', 'prj-1')).toBe(false)
    expect(canViewDeveloperProject(scope, 'dev-1', undefined)).toBe(true)
  })
})

describe('the mentors looking after one employee', () => {
  const assignments = [
    assignment('men-1', 'dev-1'),
    assignment('men-2', 'dev-1'),
    assignment('men-2', 'dev-1'),
    assignment('men-3', 'dev-1', false),
    assignment('men-1', 'dev-2'),
  ]

  it('lists each active mentor once', () => {
    expect(assignedMentorIds(assignments, 'dev-1')).toEqual(['men-1', 'men-2'])
  })

  it('has nobody for an employee with no mentor', () => {
    expect(assignedMentorIds(assignments, 'dev-7')).toEqual([])
  })
})
