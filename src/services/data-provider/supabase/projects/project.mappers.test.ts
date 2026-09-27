import { describe, expect, it } from 'vitest'

import type { CreateProjectRequest } from '@models/index'
import {
  projectRowSchema,
  toProject,
  toProjectInsert,
  toProjectUpdate,
} from './project.mappers'
import type { ProjectRow } from './project.mappers'

function row(partial: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: 'atlas',
    code: 'PRJ-001',
    name: 'Atlas',
    client: null,
    description: null,
    status: 'active',
    active: true,
    start_date: null,
    end_date: null,
    mentor_id: null,
    deleted_at: null,
    ...partial,
  }
}

function createRequest(partial: Partial<CreateProjectRequest> = {}): CreateProjectRequest {
  return {
    name: 'Atlas',
    active: true,
    status: 'active',
    mentorIds: [],
    assignedDeveloperIds: [],
    ...partial,
  }
}

describe('projectRowSchema', () => {
  it('accepts a row with the membership tables left out', () => {
    expect(projectRowSchema.safeParse(row()).success).toBe(true)
  })

  it('rejects a row missing a column the mapper depends on', () => {
    const withoutCode: Record<string, unknown> = { ...row() }
    delete withoutCode.code

    expect(projectRowSchema.safeParse(withoutCode).success).toBe(false)
  })

  it('rejects a status the application does not know', () => {
    expect(projectRowSchema.safeParse(row({ status: 'archived' as never })).success).toBe(false)
  })
})

describe('toProject', () => {
  it('reads the columns across to their model names', () => {
    const project = toProject(
      row({ client: 'Hexa', end_date: '2026-12-31', start_date: '2026-01-01' }),
    )

    expect(project).toMatchObject({
      id: 'atlas',
      code: 'PRJ-001',
      name: 'Atlas',
      client: 'Hexa',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      active: true,
      status: 'active',
    })
  })

  /** A null column means "not recorded", which the model expresses by absence. */
  it('leaves a field out entirely rather than carrying a null across', () => {
    const project = toProject(row())

    expect('client' in project).toBe(false)
    expect('description' in project).toBe(false)
    expect('startDate' in project).toBe(false)
    expect('deletedAt' in project).toBe(false)
  })

  it('reports a soft-deleted project as deleted', () => {
    expect(toProject(row({ deleted_at: '2026-09-21T09:00:00.000Z' })).deletedAt).toBe(
      '2026-09-21T09:00:00.000Z',
    )
  })

  it('collects the assigned developers, in a settled order', () => {
    const project = toProject(
      row({
        project_developers: [{ developer_id: 'ravi' }, { developer_id: 'asha' }],
      }),
    )

    expect(project.assignedDeveloperIds).toStrictEqual(['asha', 'ravi'])
  })

  it('has nobody assigned when the membership table was not read', () => {
    expect(toProject(row()).assignedDeveloperIds).toStrictEqual([])
  })

  /** The primary mentor leads the list; the rest follow in a settled order. */
  it('puts the primary mentor first and sorts the others behind them', () => {
    const project = toProject(
      row({
        mentor_id: 'ravi',
        project_mentors: [{ mentor_id: 'zara' }, { mentor_id: 'asha' }, { mentor_id: 'ravi' }],
      }),
    )

    expect(project.mentorIds).toStrictEqual(['ravi', 'asha', 'zara'])
    expect(project.mentorId).toBe('ravi')
  })

  it('includes a primary mentor who is missing from the membership table', () => {
    const project = toProject(row({ mentor_id: 'ravi', project_mentors: [] }))

    expect(project.mentorIds).toStrictEqual(['ravi'])
  })

  it('names a primary mentor from the membership table when no column says who it is', () => {
    const project = toProject(
      row({ project_mentors: [{ mentor_id: 'zara' }, { mentor_id: 'asha' }] }),
    )

    expect(project.mentorIds).toStrictEqual(['asha', 'zara'])
    expect(project.mentorId).toBe('asha')
  })

  it('has no mentor at all when nobody is responsible', () => {
    const project = toProject(row())

    expect(project.mentorIds).toStrictEqual([])
    expect('mentorId' in project).toBe(false)
  })

  it('does not repeat a mentor who appears in both the column and the table', () => {
    const project = toProject(row({ mentor_id: 'ravi', project_mentors: [{ mentor_id: 'ravi' }] }))

    expect(project.mentorIds).toStrictEqual(['ravi'])
  })
})

describe('toProjectInsert', () => {
  it('writes the request out to its column names', () => {
    expect(toProjectInsert(createRequest({ client: 'Hexa', status: 'planned' }))).toStrictEqual({
      name: 'Atlas',
      client: 'Hexa',
      description: null,
      status: 'planned',
      active: true,
      start_date: null,
      end_date: null,
      mentor_id: null,
    })
  })

  it('trims the name before storing it', () => {
    expect(toProjectInsert(createRequest({ name: '  Atlas  ' })).name).toBe('Atlas')
  })

  /** '' is what an untouched form field holds; it means nothing was entered. */
  it('stores an untouched field as nothing recorded rather than as an empty string', () => {
    const insert = toProjectInsert(createRequest({ client: '   ', description: '' }))

    expect(insert.client).toBeNull()
    expect(insert.description).toBeNull()
  })

  it('takes the primary mentor from the head of the list', () => {
    expect(toProjectInsert(createRequest({ mentorIds: ['ravi', 'asha'] })).mentor_id).toBe('ravi')
  })

  it('falls back to the single mentor field when no list was given', () => {
    expect(toProjectInsert(createRequest({ mentorId: 'ravi' })).mentor_id).toBe('ravi')
  })

  it('ignores an empty first entry in the list and uses the single field', () => {
    expect(
      toProjectInsert(createRequest({ mentorId: 'ravi', mentorIds: [''] })).mentor_id,
    ).toBe('ravi')
  })
})

describe('toProjectUpdate', () => {
  /** Only what the caller mentioned is written, so an edit cannot blank a field it never touched. */
  it('writes nothing for an empty change', () => {
    expect(toProjectUpdate({})).toStrictEqual({})
  })

  it('writes only the fields the caller mentioned', () => {
    expect(toProjectUpdate({ active: false })).toStrictEqual({ active: false })
  })

  it('clears a field the caller explicitly emptied', () => {
    expect(toProjectUpdate({ client: '' })).toStrictEqual({ client: null })
  })

  it('trims a new name', () => {
    expect(toProjectUpdate({ name: '  Atlas  ' })).toStrictEqual({ name: 'Atlas' })
  })

  it('takes a new primary mentor from the head of a new list', () => {
    expect(toProjectUpdate({ mentorIds: ['ravi', 'asha'] })).toStrictEqual({ mentor_id: 'ravi' })
  })

  it('removes the primary mentor when the new list is empty', () => {
    expect(toProjectUpdate({ mentorIds: [] })).toStrictEqual({ mentor_id: null })
  })

  it('takes the single mentor field when no list was given', () => {
    expect(toProjectUpdate({ mentorId: 'ravi' })).toStrictEqual({ mentor_id: 'ravi' })
  })

  /** The list is the fuller statement, so it wins where both were given. */
  it('prefers the list over the single field when both are present', () => {
    expect(toProjectUpdate({ mentorId: 'asha', mentorIds: ['ravi'] })).toStrictEqual({
      mentor_id: 'ravi',
    })
  })
})
