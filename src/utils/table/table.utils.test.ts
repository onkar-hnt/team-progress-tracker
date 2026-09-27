import { describe, expect, it } from 'vitest'

import { compareFlag, compareText, matchesSearch, sortRows } from '@utils/table/table.utils'

describe('matchesSearch', () => {
  it('matches part of a field, whatever the case', () => {
    expect(matchesSearch(['Connector screen'], 'CONNECT')).toBe(true)
  })

  it('matches when any one of the fields does', () => {
    expect(matchesSearch(['Atlas', 'Asha'], 'asha')).toBe(true)
  })

  it('does not match when no field contains the term', () => {
    expect(matchesSearch(['Atlas', 'Asha'], 'borealis')).toBe(false)
  })

  it('skips fields that have no value rather than failing on them', () => {
    expect(matchesSearch([undefined, 'Atlas'], 'atlas')).toBe(true)
    expect(matchesSearch([undefined], 'atlas')).toBe(false)
  })

  /** An empty box is not a filter, so every row stays. */
  it('matches everything when the search is empty or only spaces', () => {
    expect(matchesSearch(['Atlas'], '')).toBe(true)
    expect(matchesSearch(['Atlas'], '   ')).toBe(true)
  })

  it('ignores spaces around the term the reader typed', () => {
    expect(matchesSearch(['Atlas'], '  atlas  ')).toBe(true)
  })
})

describe('sortRows', () => {
  interface Row {
    id: string
    name: string
  }

  const rows: readonly Row[] = [
    { id: '2', name: 'Beta' },
    { id: '1', name: 'Alpha' },
    { id: '3', name: 'Alpha' },
  ]

  const byName = (left: Row, right: Row) => compareText(left.name, right.name)

  it('sorts ascending with the comparator as written', () => {
    const sorted = sortRows(rows, { direction: 'asc', key: 'name' }, byName)

    expect(sorted.map((row) => row.name)).toStrictEqual(['Alpha', 'Alpha', 'Beta'])
  })

  it('sorts descending by reversing the same comparator', () => {
    const sorted = sortRows(rows, { direction: 'desc', key: 'name' }, byName)

    expect(sorted.map((row) => row.name)).toStrictEqual(['Beta', 'Alpha', 'Alpha'])
  })

  /** Without a tie-break, two equal rows could swap places on every refetch. */
  it('uses the tie-break to keep equal rows in a settled order', () => {
    const sorted = sortRows(rows, { direction: 'asc', key: 'name' }, byName, (left, right) =>
      left.id.localeCompare(right.id),
    )

    expect(sorted.map((row) => row.id)).toStrictEqual(['1', '3', '2'])
  })

  it('leaves the caller’s array alone', () => {
    sortRows(rows, { direction: 'asc', key: 'name' }, byName)

    expect(rows.map((row) => row.id)).toStrictEqual(['2', '1', '3'])
  })
})

describe('compareText', () => {
  it('orders text alphabetically', () => {
    expect(compareText('Alpha', 'Beta')).toBeLessThan(0)
    expect(compareText('Beta', 'Alpha')).toBeGreaterThan(0)
  })

  it('treats identical text as equal', () => {
    expect(compareText('Alpha', 'Alpha')).toBe(0)
    expect(compareText(undefined, undefined)).toBe(0)
  })

  /** A missing value is not the start of the alphabet; it belongs at the end. */
  it('puts a missing or empty value last when ascending', () => {
    expect(compareText(undefined, 'Alpha')).toBeGreaterThan(0)
    expect(compareText('', 'Alpha')).toBeGreaterThan(0)
    expect(compareText('Alpha', undefined)).toBeLessThan(0)
  })
})

describe('compareFlag', () => {
  it('puts true before false when ascending', () => {
    expect(compareFlag(true, false)).toBeLessThan(0)
    expect(compareFlag(false, true)).toBeGreaterThan(0)
  })

  it('treats two equal flags as equal', () => {
    expect(compareFlag(true, true)).toBe(0)
    expect(compareFlag(false, false)).toBe(0)
  })
})
