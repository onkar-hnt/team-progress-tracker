import { describe, expect, it } from 'vitest'

import { apiUrl, describeApiConfigProblem, inspectApiConfig } from './api-config'

describe('joining a path to the gateway', () => {
  it('keeps exactly one slash, whichever side wrote it', () => {
    expect(apiUrl('api/developers')).toBe('http://localhost:5100/api/developers')
    expect(apiUrl('/api/developers')).toBe('http://localhost:5100/api/developers')
  })
})

/**
 * A blank or malformed base URL builds a site that looks like it works and
 * cannot load a thing, so it is named as a configuration problem rather than
 * surfacing later as a string of failed requests.
 */
describe('checking the configured gateway', () => {
  it('accepts an absolute origin', () => {
    expect(inspectApiConfig({ baseUrl: 'https://tracker.example.com' })).toEqual([])
  })

  it('accepts a same-origin prefix, for a gateway behind the same host', () => {
    expect(inspectApiConfig({ baseUrl: '/api' })).toEqual([])
  })

  it('names the variable when nothing is set', () => {
    const [problem] = inspectApiConfig({ baseUrl: '' })

    expect(problem.variable).toBe('VITE_API_BASE_URL')
    expect(problem.message).toContain('Not set')
  })

  it('rejects something that is neither a URL nor a path', () => {
    expect(inspectApiConfig({ baseUrl: 'tracker.example.com' })).toHaveLength(1)
  })

  it('has nothing to report for the configured default', () => {
    expect(describeApiConfigProblem()).toBeNull()
  })
})
