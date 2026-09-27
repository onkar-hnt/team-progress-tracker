import { describe, expect, it } from 'vitest'

import type { CreateMentorRequest } from '@models/index'
import {
  mentorAssignmentRowSchema,
  mentorRowSchema,
  toMentor,
  toMentorAssignment,
  toMentorInsert,
  toMentorUpdate,
} from './mentor.mappers'
import type {
  MentorAssignmentRow,
  MentorRow,
} from './mentor.mappers'

function row(partial: Partial<MentorRow> = {}): MentorRow {
  return {
    id: 'ravi',
    code: 'MEN-001',
    name: 'Ravi',
    email: 'ravi@example.com',
    active: true,
    created_date: null,
    profile_id: null,
    deleted_at: null,
    ...partial,
  }
}

function assignmentRow(partial: Partial<MentorAssignmentRow> = {}): MentorAssignmentRow {
  return {
    id: 'assignment-1',
    mentor_id: 'ravi',
    developer_id: 'asha',
    assigned_date: null,
    active: true,
    ...partial,
  }
}

function createRequest(partial: Partial<CreateMentorRequest> = {}): CreateMentorRequest {
  return { name: 'Ravi', email: 'ravi@example.com', active: true, ...partial }
}

describe('mentorRowSchema', () => {
  it('accepts a row as the database returns it', () => {
    expect(mentorRowSchema.safeParse(row()).success).toBe(true)
  })

  /** Unlike an employee, a mentor is reached by email, so it cannot be absent. */
  it('rejects a mentor with no email', () => {
    expect(mentorRowSchema.safeParse(row({ email: '' })).success).toBe(false)
    expect(mentorRowSchema.safeParse(row({ email: null as never })).success).toBe(false)
  })
})

describe('toMentor', () => {
  it('reads the columns across to their model names', () => {
    const mentor = toMentor(row({ created_date: '2026-01-01', profile_id: 'profile-ravi' }))

    expect(mentor).toStrictEqual({
      id: 'ravi',
      code: 'MEN-001',
      name: 'Ravi',
      email: 'ravi@example.com',
      active: true,
      createdDate: '2026-01-01',
      profileId: 'profile-ravi',
    })
  })

  it('leaves a field out entirely rather than carrying a null across', () => {
    expect(toMentor(row())).toStrictEqual({
      id: 'ravi',
      code: 'MEN-001',
      name: 'Ravi',
      email: 'ravi@example.com',
      active: true,
    })
  })

  it('reports a soft-deleted mentor as deleted', () => {
    expect(toMentor(row({ deleted_at: '2026-09-21T09:00:00.000Z' })).deletedAt).toBe(
      '2026-09-21T09:00:00.000Z',
    )
  })
})

describe('toMentorInsert', () => {
  it('writes the request out to its column names', () => {
    expect(toMentorInsert(createRequest())).toStrictEqual({
      name: 'Ravi',
      email: 'ravi@example.com',
      active: true,
      created_date: null,
    })
  })

  it('trims the name and the email', () => {
    const insert = toMentorInsert(
      createRequest({ email: '  ravi@example.com  ', name: '  Ravi  ' }),
    )

    expect(insert.name).toBe('Ravi')
    expect(insert.email).toBe('ravi@example.com')
  })
})

describe('toMentorUpdate', () => {
  it('writes nothing for an empty change', () => {
    expect(toMentorUpdate({})).toStrictEqual({})
  })

  it('writes only the fields the caller gave a value for', () => {
    expect(toMentorUpdate({ active: false })).toStrictEqual({ active: false })
  })

  it('trims an edited name and email', () => {
    expect(toMentorUpdate({ email: '  new@example.com  ', name: '  Ravi K  ' })).toStrictEqual({
      name: 'Ravi K',
      email: 'new@example.com',
    })
  })

  /** Every mentor column is required, so nothing here can be cleared. */
  it('ignores a field mentioned with no value rather than clearing it', () => {
    expect(toMentorUpdate({ active: undefined, email: undefined, name: undefined })).toStrictEqual(
      {},
    )
  })
})

describe('mentorAssignmentRowSchema', () => {
  it('accepts a row as the database returns it', () => {
    expect(mentorAssignmentRowSchema.safeParse(assignmentRow()).success).toBe(true)
  })

  it('rejects an assignment that names no mentor or no developer', () => {
    expect(mentorAssignmentRowSchema.safeParse(assignmentRow({ mentor_id: '' })).success).toBe(
      false,
    )
    expect(mentorAssignmentRowSchema.safeParse(assignmentRow({ developer_id: '' })).success).toBe(
      false,
    )
  })
})

describe('toMentorAssignment', () => {
  it('reads the columns across to their model names', () => {
    expect(toMentorAssignment(assignmentRow({ assigned_date: '2026-01-01' }))).toStrictEqual({
      id: 'assignment-1',
      mentorId: 'ravi',
      developerId: 'asha',
      active: true,
      assignedDate: '2026-01-01',
    })
  })

  it('leaves the date out when none was recorded', () => {
    expect('assignedDate' in toMentorAssignment(assignmentRow())).toBe(false)
  })

  it('carries an assignment that has been switched off', () => {
    expect(toMentorAssignment(assignmentRow({ active: false })).active).toBe(false)
  })
})
