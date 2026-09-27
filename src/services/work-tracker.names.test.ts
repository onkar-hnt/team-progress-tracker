import { describe, expect, it } from 'vitest'

import type { Developer, Mentor, MentorComment } from '@models/index'
import { onTheRoster, resolveAuthorName, resolveName } from '@services/work-tracker.names'

function developer(id: string, partial: Partial<Developer> = {}): Developer {
  return { id, name: id, active: true, ...partial }
}

function mentor(id: string, partial: Partial<Mentor> = {}): Mentor {
  return { id, name: id, email: `${id}@example.com`, active: true, ...partial }
}

function comment(partial: Partial<MentorComment> = {}): MentorComment {
  return {
    id: 'comment-1',
    developerId: 'asha',
    date: '2026-09-21',
    comment: 'Looks good.',
    createdAt: '2026-09-21T09:00:00.000Z',
    updatedAt: '2026-09-21T09:00:00.000Z',
    ...partial,
  }
}

describe('onTheRoster', () => {
  it('keeps a record that has not been deleted', () => {
    expect(onTheRoster({})).toBe(true)
  })

  it('excludes a record that has been soft-deleted', () => {
    expect(onTheRoster({ deletedAt: '2026-09-21T09:00:00.000Z' })).toBe(false)
  })
})

describe('resolveName', () => {
  it('names the record the id points at', () => {
    expect(resolveName([developer('asha', { name: 'Asha' })], 'asha', 'developer')).toBe('Asha')
  })

  /** Work outlives the roster, so an unknown id is shown rather than hidden. */
  it('shows the id when no record matches, so the row is still traceable', () => {
    expect(resolveName([], 'ghost', 'developer')).toBe('Unknown (ghost)')
  })

  it('names the kind of thing that is missing when there is no id at all', () => {
    expect(resolveName([], undefined, 'project')).toBe('Unknown project')
    expect(resolveName([], undefined, 'mentor')).toBe('Unknown mentor')
  })

  it('still names somebody who has left the roster', () => {
    const left = developer('asha', { deletedAt: '2026-09-01T00:00:00.000Z', name: 'Asha' })

    expect(resolveName([left], 'asha', 'developer')).toBe('Asha')
  })
})

describe('resolveAuthorName', () => {
  const developers = [developer('asha', { name: 'Asha', profileId: 'profile-asha' })]
  const mentors = [mentor('mentor-1', { name: 'Ravi', profileId: 'profile-ravi' })]

  it('names the author through the login that wrote the entry', () => {
    const entry = comment({ authorProfileId: 'profile-ravi', mentorId: 'mentor-1' })

    expect(resolveAuthorName(entry, 'mentor', developers, mentors)).toBe('Ravi')
  })

  /**
   * Somebody can hold both a mentor and an employee record. The mentor record
   * is checked first, so they are named once rather than twice over.
   */
  it('names somebody who holds both records once, from the mentor side', () => {
    const both = [mentor('mentor-1', { name: 'Ravi the mentor', profileId: 'shared' })]
    const alsoEmployee = [developer('ravi', { name: 'Ravi the employee', profileId: 'shared' })]
    const entry = comment({ authorProfileId: 'shared' })

    expect(resolveAuthorName(entry, 'mentor', alsoEmployee, both)).toBe('Ravi the mentor')
  })

  it('names the author from the employee roster when no mentor holds that login', () => {
    const entry = comment({ authorProfileId: 'profile-asha' })

    expect(resolveAuthorName(entry, 'developer', developers, mentors)).toBe('Asha')
  })

  it('names the developer the entry is about when they wrote it themselves', () => {
    expect(resolveAuthorName(comment(), 'developer', developers, mentors)).toBe('Asha')
  })

  /** Entries written before authorship was recorded fall back to the named mentor. */
  it('falls back to the mentor the entry names when no author was recorded', () => {
    const entry = comment({ mentorId: 'mentor-1' })

    expect(resolveAuthorName(entry, 'mentor', developers, mentors)).toBe('Ravi')
  })

  it('falls back to the mentor the entry names when the author’s login is unknown', () => {
    const entry = comment({ authorProfileId: 'profile-gone', mentorId: 'mentor-1' })

    expect(resolveAuthorName(entry, 'mentor', developers, mentors)).toBe('Ravi')
  })

  it('says an administrator wrote it when there is nothing else to go on', () => {
    expect(resolveAuthorName(comment(), 'admin', developers, mentors)).toBe('Administrator')
  })

  it('admits the mentor is unknown rather than inventing one', () => {
    expect(resolveAuthorName(comment(), 'mentor', developers, mentors)).toBe('Unknown mentor')
  })
})
