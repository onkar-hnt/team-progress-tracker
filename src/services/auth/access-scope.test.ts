import { describe, expect, it } from 'vitest'

import type { AppUser, MentorAssignment } from '@models/index'
import {
  assignedMentorIds,
  buildAccessScope,
  canViewDeveloperProject,
  filterByScope,
  restrictProjectIds,
} from '@services/auth/access-scope'

const developerA = 'developer-a'
const mentor1 = 'mentor-1'
const mentor2 = 'mentor-2'
const projectX = 'project-x'
const projectY = 'project-y'

function user(partial: Pick<AppUser, 'role'> & Partial<AppUser>): AppUser {
  return {
    email: `${partial.role}@example.com`,
    name: partial.role,
    ...partial,
  }
}

function assignment(mentorId: string, developerId: string, active = true): MentorAssignment {
  return { mentorId, developerId, active }
}

describe('assigned mentors', () => {
  it('returns the one mentor assigned to a developer', () => {
    expect(assignedMentorIds([assignment(mentor1, developerA)], developerA)).toEqual([mentor1])
  })

  it('returns every mentor assigned to a developer, once each', () => {
    const ids = assignedMentorIds(
      [
        assignment(mentor1, developerA),
        assignment(mentor2, developerA),
        assignment(mentor1, developerA),
        assignment(mentor2, 'someone-else'),
        assignment(mentor1, developerA, false),
      ],
      developerA,
    )

    expect(ids).toEqual([mentor1, mentor2])
  })
})

describe('project isolation', () => {
  const assignments = [assignment(mentor1, developerA), assignment(mentor2, developerA)]

  const mentorOne = buildAccessScope(
    user({ role: 'mentor', mentorId: mentor1 }),
    assignments,
    [projectX],
  )
  const mentorTwo = buildAccessScope(
    user({ role: 'mentor', mentorId: mentor2 }),
    assignments,
    [projectY],
  )

  it('shows a single-mentor developer only on that mentor’s project', () => {
    const scope = buildAccessScope(
      user({ role: 'mentor', mentorId: mentor1 }),
      [assignment(mentor1, developerA)],
      [projectX],
    )

    expect(scope).not.toBeNull()
    expect(canViewDeveloperProject(scope!, developerA, projectX)).toBe(true)
    expect(canViewDeveloperProject(scope!, developerA, projectY)).toBe(false)
  })

  it('keeps each mentor on their own project when the developer is shared', () => {
    expect(mentorOne).not.toBeNull()
    expect(mentorTwo).not.toBeNull()

    expect(canViewDeveloperProject(mentorOne!, developerA, projectX)).toBe(true)
    expect(canViewDeveloperProject(mentorOne!, developerA, projectY)).toBe(false)
    expect(canViewDeveloperProject(mentorTwo!, developerA, projectY)).toBe(true)
    expect(canViewDeveloperProject(mentorTwo!, developerA, projectX)).toBe(false)
  })

  it('lets every mentor responsible for the same project see that project', () => {
    const shared = [projectX]
    const first = buildAccessScope(user({ role: 'mentor', mentorId: mentor1 }), assignments, shared)
    const second = buildAccessScope(
      user({ role: 'mentor', mentorId: mentor2 }),
      assignments,
      shared,
    )

    expect(canViewDeveloperProject(first!, developerA, projectX)).toBe(true)
    expect(canViewDeveloperProject(second!, developerA, projectX)).toBe(true)
    expect(canViewDeveloperProject(first!, developerA, projectY)).toBe(false)
  })

  it('drops a project id that was not granted, including one supplied as a filter', () => {
    expect(restrictProjectIds(mentorOne!, [projectY])).toEqual([])
    expect(restrictProjectIds(mentorOne!, [projectX, projectY])).toEqual([projectX])
    expect(restrictProjectIds(mentorOne!, undefined)).toEqual([projectX])
  })

  it('does not return another mentor’s project rows from an in-memory list', () => {
    const rows = [
      { developerId: developerA, projectId: projectX, label: 'x' },
      { developerId: developerA, projectId: projectY, label: 'y' },
    ]

    expect(filterByScope(mentorOne!, rows).map((row) => row.label)).toEqual(['x'])
    expect(filterByScope(mentorTwo!, rows).map((row) => row.label)).toEqual(['y'])
  })
})

describe('developer and admin visibility', () => {
  it('leaves a developer’s own work visible on every project', () => {
    const scope = buildAccessScope(
      user({ role: 'developer', developerId: developerA }),
      [assignment(mentor1, developerA), assignment(mentor2, developerA)],
    )

    expect(scope?.visibleProjectIds).toBeNull()
    expect(canViewDeveloperProject(scope!, developerA, projectX)).toBe(true)
    expect(canViewDeveloperProject(scope!, developerA, projectY)).toBe(true)
    expect(canViewDeveloperProject(scope!, 'someone-else', projectX)).toBe(false)
    expect(
      assignedMentorIds(
        [assignment(mentor1, developerA), assignment(mentor2, developerA)],
        developerA,
      ),
    ).toEqual([mentor1, mentor2])
  })

  it('keeps a mentor’s own employee work visible outside the projects they mentor', () => {
    const scope = buildAccessScope(
      user({ role: 'mentor', mentorId: mentor1, developerId: 'mentor-as-developer' }),
      [assignment(mentor1, developerA)],
      [projectX],
    )

    expect(canViewDeveloperProject(scope!, 'mentor-as-developer', projectY)).toBe(true)
    expect(canViewDeveloperProject(scope!, developerA, projectY)).toBe(false)
  })

  it('leaves an administrator unrestricted', () => {
    const scope = buildAccessScope(user({ role: 'admin' }), [], [])

    expect(scope?.visibleDeveloperIds).toBeNull()
    expect(scope?.visibleProjectIds).toBeNull()
    expect(canViewDeveloperProject(scope!, developerA, projectY)).toBe(true)
    expect(restrictProjectIds(scope!, [projectY])).toEqual([projectY])
  })
})
