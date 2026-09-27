import { describe, expect, it } from 'vitest'

import type { CreateDeveloperRequest } from '@models/index'
import {
  developerRowSchema,
  toDeveloper,
  toDeveloperInsert,
  toDeveloperUpdate,
} from './developer.mappers'
import type { DeveloperRow } from './developer.mappers'

function row(partial: Partial<DeveloperRow> = {}): DeveloperRow {
  return {
    id: 'asha',
    code: 'EMP-001',
    name: 'Asha',
    employee_id: null,
    role: null,
    location: null,
    active: true,
    email: null,
    access_role: null,
    primary_project_id: null,
    created_date: null,
    profile_id: null,
    deleted_at: null,
    ...partial,
  }
}

function createRequest(partial: Partial<CreateDeveloperRequest> = {}): CreateDeveloperRequest {
  return { name: 'Asha', active: true, ...partial }
}

describe('developerRowSchema', () => {
  it('accepts a row with only the required columns filled in', () => {
    expect(developerRowSchema.safeParse(row()).success).toBe(true)
  })

  it('accepts each access role the application knows', () => {
    expect(developerRowSchema.safeParse(row({ access_role: 'admin' })).success).toBe(true)
    expect(developerRowSchema.safeParse(row({ access_role: 'mentor' })).success).toBe(true)
    expect(developerRowSchema.safeParse(row({ access_role: 'developer' })).success).toBe(true)
  })

  it('rejects an access role the application does not know', () => {
    expect(developerRowSchema.safeParse(row({ access_role: 'owner' as never })).success).toBe(false)
  })

  it('rejects a row with no name or no code', () => {
    expect(developerRowSchema.safeParse(row({ name: '' })).success).toBe(false)
    expect(developerRowSchema.safeParse(row({ code: '' })).success).toBe(false)
  })
})

describe('toDeveloper', () => {
  it('reads the columns across to their model names', () => {
    const developer = toDeveloper(
      row({
        access_role: 'mentor',
        email: 'asha@example.com',
        employee_id: 'HNT-14',
        location: 'Pune',
        primary_project_id: 'atlas',
        profile_id: 'profile-asha',
        role: 'Backend',
      }),
    )

    expect(developer).toStrictEqual({
      id: 'asha',
      code: 'EMP-001',
      name: 'Asha',
      active: true,
      employeeId: 'HNT-14',
      role: 'Backend',
      location: 'Pune',
      email: 'asha@example.com',
      accessRole: 'mentor',
      primaryProjectId: 'atlas',
      profileId: 'profile-asha',
    })
  })

  it('leaves a field out entirely rather than carrying a null across', () => {
    const developer = toDeveloper(row())

    expect(developer).toStrictEqual({ id: 'asha', code: 'EMP-001', name: 'Asha', active: true })
  })

  it('reports somebody who has been deactivated as inactive', () => {
    expect(toDeveloper(row({ active: false })).active).toBe(false)
  })

  it('reports a soft-deleted employee as deleted', () => {
    expect(toDeveloper(row({ deleted_at: '2026-09-21T09:00:00.000Z' })).deletedAt).toBe(
      '2026-09-21T09:00:00.000Z',
    )
  })

  /** The profile id is the link to a login, so its absence means there is not one yet. */
  it('carries the login link across when the employee has one', () => {
    expect(toDeveloper(row({ profile_id: 'profile-asha' })).profileId).toBe('profile-asha')
  })
})

describe('toDeveloperInsert', () => {
  it('writes the request out to its column names', () => {
    expect(toDeveloperInsert(createRequest({ email: 'asha@example.com' }))).toStrictEqual({
      name: 'Asha',
      employee_id: null,
      role: null,
      location: null,
      active: true,
      email: 'asha@example.com',
      access_role: null,
      primary_project_id: null,
      created_date: null,
    })
  })

  it('trims the name and the fields typed beside it', () => {
    const insert = toDeveloperInsert(
      createRequest({ email: '  asha@example.com  ', name: '  Asha  ' }),
    )

    expect(insert.name).toBe('Asha')
    expect(insert.email).toBe('asha@example.com')
  })

  it('stores an untouched field as nothing recorded rather than as an empty string', () => {
    const insert = toDeveloperInsert(createRequest({ employeeId: '', location: '   ', role: '' }))

    expect(insert.employee_id).toBeNull()
    expect(insert.location).toBeNull()
    expect(insert.role).toBeNull()
  })

  it('records the access role when one was chosen', () => {
    expect(toDeveloperInsert(createRequest({ accessRole: 'admin' })).access_role).toBe('admin')
  })
})

describe('toDeveloperUpdate', () => {
  it('writes nothing for an empty change', () => {
    expect(toDeveloperUpdate({})).toStrictEqual({})
  })

  it('writes only the fields the caller mentioned', () => {
    expect(toDeveloperUpdate({ active: false })).toStrictEqual({ active: false })
  })

  it('clears a nullable field the caller mentioned but left empty', () => {
    expect(toDeveloperUpdate({ email: '' })).toStrictEqual({ email: null })
    expect(toDeveloperUpdate({ accessRole: undefined })).toStrictEqual({ access_role: null })
    expect(toDeveloperUpdate({ primaryProjectId: undefined })).toStrictEqual({
      primary_project_id: null,
    })
  })

  /** Leaving the name out is not a request to blank it, which the column forbids anyway. */
  it('does not clear the name when it is mentioned but left empty', () => {
    expect(toDeveloperUpdate({ name: undefined })).toStrictEqual({})
  })

  it('does not clear the active flag when it is mentioned but left empty', () => {
    expect(toDeveloperUpdate({ active: undefined })).toStrictEqual({})
  })

  it('changes the access role when a new one is given', () => {
    expect(toDeveloperUpdate({ accessRole: 'mentor' })).toStrictEqual({ access_role: 'mentor' })
  })
})
