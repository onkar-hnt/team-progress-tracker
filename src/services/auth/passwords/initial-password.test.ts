import { describe, expect, it } from 'vitest'

import { initialPasswordFor } from '@services/auth/passwords/initial-password'

describe('initialPasswordFor', () => {
  it('builds the password from the first name', () => {
    expect(initialPasswordFor('Asha Deshmukh')).toBe('Asha@123')
  })

  it('uses a single name as it stands', () => {
    expect(initialPasswordFor('Asha')).toBe('Asha@123')
  })

  it('drops punctuation and spacing from the name', () => {
    expect(initialPasswordFor("O'Brien")).toBe('OBrien@123')
    expect(initialPasswordFor('  Asha  Deshmukh  ')).toBe('Asha@123')
  })

  /** Two letters is too short to be worth guessing from, so the whole name is used. */
  it('falls back to the whole name when the first name is shorter than three letters', () => {
    expect(initialPasswordFor('Jo Smith')).toBe('JoSmith@123')
  })

  it('falls back to a fixed stem when even the whole name is too short', () => {
    expect(initialPasswordFor('Jo')).toBe('Employee@123')
    expect(initialPasswordFor('')).toBe('Employee@123')
    expect(initialPasswordFor('!!')).toBe('Employee@123')
  })

  it('keeps the case of the name, so the password reads as the name does', () => {
    expect(initialPasswordFor('asha')).toBe('asha@123')
  })
})
