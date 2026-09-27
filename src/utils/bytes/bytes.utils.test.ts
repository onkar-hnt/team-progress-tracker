import { describe, expect, it } from 'vitest'

import { GIGABYTE, MEGABYTE, formatBytes } from '@utils/bytes/bytes.utils'

const KILOBYTE = 1024

describe('formatBytes', () => {
  it('reports a small figure in bytes, exactly', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
  })

  it('reports kilobytes to the nearest whole one', () => {
    expect(formatBytes(KILOBYTE)).toBe('1 KB')
    expect(formatBytes(KILOBYTE * 1.5)).toBe('2 KB')
  })

  it('reports megabytes to one decimal place', () => {
    expect(formatBytes(MEGABYTE)).toBe('1.0 MB')
    expect(formatBytes(MEGABYTE * 2.25)).toBe('2.3 MB')
  })

  it('reports gigabytes to two decimal places, as the plan limits are quoted', () => {
    expect(formatBytes(GIGABYTE)).toBe('1.00 GB')
    expect(formatBytes(GIGABYTE * 1.5)).toBe('1.50 GB')
  })

  /** Binary units, so each boundary is 1024 of the unit below rather than 1000. */
  it('changes unit at 1024 of the one below, not at 1000', () => {
    expect(formatBytes(KILOBYTE - 1)).toBe('1023 B')
    expect(formatBytes(MEGABYTE - 1)).toBe('1024 KB')
  })
})
