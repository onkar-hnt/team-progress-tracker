import { describe, expect, it } from 'vitest'

import { initialsOf } from '@utils/name/name.utils'

describe('initialsOf', () => {
  it('takes the first letter of the first and last name', () => {
    expect(initialsOf('Asha Deshmukh')).toBe('AD')
  })

  it('takes one initial from a single name', () => {
    expect(initialsOf('Asha')).toBe('A')
  })

  /** A middle name is skipped, so a badge never holds three letters. */
  it('skips anything between the first and last name', () => {
    expect(initialsOf('Asha Priya Deshmukh')).toBe('AD')
  })

  it('upper-cases the initials however the name was written', () => {
    expect(initialsOf('asha deshmukh')).toBe('AD')
  })

  it('ignores extra spaces around and between the names', () => {
    expect(initialsOf('  Asha   Deshmukh  ')).toBe('AD')
  })

  it('falls back to the given text when there is no name to read', () => {
    expect(initialsOf('', 'asha@example.com')).toBe('A')
  })

  it('shows a dash rather than nothing when there is no name and no fallback', () => {
    expect(initialsOf('')).toBe('-')
    expect(initialsOf('   ')).toBe('-')
  })
})
