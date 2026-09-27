import { describe, expect, it } from 'vitest'

import { toCsv, toFilenameSlug } from '@utils/csv.utils'

describe('toCsv', () => {
  it('writes each row on its own line, comma separated', () => {
    expect(toCsv([['Name', 'Project'], ['Asha', 'Atlas']])).toBe('Name,Project\r\nAsha,Atlas')
  })

  it('separates lines with carriage return and newline, as the format requires', () => {
    expect(toCsv([['a'], ['b']])).toBe('a\r\nb')
  })

  it('quotes a value containing a comma, so it stays one cell', () => {
    expect(toCsv([['Asha, Deshmukh']])).toBe('"Asha, Deshmukh"')
  })

  it('quotes a value containing a line break', () => {
    expect(toCsv([['first\nsecond']])).toBe('"first\nsecond"')
  })

  it('doubles a quote inside a quoted value', () => {
    expect(toCsv([['He said "hello"']])).toBe('"He said ""hello"""')
  })

  it('leaves a plain value unquoted', () => {
    expect(toCsv([['Atlas']])).toBe('Atlas')
  })

  /**
   * A cell opening with one of these is a formula to Excel, not text. The
   * leading apostrophe makes it text again.
   */
  it('neutralises a value that a spreadsheet would run as a formula', () => {
    expect(toCsv([['=1+1']])).toBe("'=1+1")
    expect(toCsv([['+44 7700 900000']])).toBe("'+44 7700 900000")
    expect(toCsv([['@example']])).toBe("'@example")
  })

  it('neutralises a negative-looking value, then quotes it only if it must be', () => {
    expect(toCsv([['-5']])).toBe("'-5")
    expect(toCsv([['-5,000']])).toBe('"\'-5,000"')
  })

  it('produces nothing for no rows', () => {
    expect(toCsv([])).toBe('')
  })

  it('writes an empty row as an empty line', () => {
    expect(toCsv([['']])).toBe('')
  })
})

describe('toFilenameSlug', () => {
  it('lowercases the text and joins words with hyphens', () => {
    expect(toFilenameSlug('Weekly Team Report')).toBe('weekly-team-report')
  })

  it('collapses a run of punctuation into a single hyphen', () => {
    expect(toFilenameSlug('Atlas // Sprint 4')).toBe('atlas-sprint-4')
  })

  it('does not leave a hyphen at either end', () => {
    expect(toFilenameSlug('  Atlas!  ')).toBe('atlas')
  })

  it('falls back to a usable name when nothing survives', () => {
    expect(toFilenameSlug('!!!')).toBe('report')
    expect(toFilenameSlug('')).toBe('report')
  })
})
