import { afterEach, describe, expect, it, vi } from 'vitest'

import { ShortLivedRead, ShortLivedReadByKey } from '@services/short-lived-read'

const TTL_MS = 60_000

afterEach(() => {
  vi.useRealTimers()
})

/** Counts how often the underlying read actually ran. */
function countingRead(rows: readonly string[] = ['a']) {
  let calls = 0

  return {
    get calls() {
      return calls
    },
    read: () => {
      calls += 1
      return Promise.resolve([...rows])
    },
  }
}

describe('ShortLivedRead', () => {
  it('returns the rows the read produced', async () => {
    const memo = new ShortLivedRead(() => Promise.resolve(['a', 'b']), TTL_MS)

    await expect(memo.get()).resolves.toStrictEqual(['a', 'b'])
  })

  it('reads once and serves the memo to later callers', async () => {
    const source = countingRead()
    const memo = new ShortLivedRead(source.read, TTL_MS)

    await memo.get()
    await memo.get()

    expect(source.calls).toBe(1)
  })

  /** The point of the class: several callers at once share one request. */
  it('shares one in-flight read between callers who ask at the same time', async () => {
    const source = countingRead()
    const memo = new ShortLivedRead(source.read, TTL_MS)

    await Promise.all([memo.get(), memo.get(), memo.get()])

    expect(source.calls).toBe(1)
  })

  it('hands each caller its own array, so one cannot alter another’s', async () => {
    const memo = new ShortLivedRead(() => Promise.resolve(['a']), TTL_MS)

    const first = await memo.get()
    first.push('b')

    await expect(memo.get()).resolves.toStrictEqual(['a'])
  })

  it('reads again once the memo is older than its lifetime', async () => {
    vi.useFakeTimers()
    const source = countingRead()
    const memo = new ShortLivedRead(source.read, TTL_MS)

    await memo.get()
    vi.advanceTimersByTime(TTL_MS)
    await memo.get()

    expect(source.calls).toBe(2)
  })

  it('serves the memo while it is still within its lifetime', async () => {
    vi.useFakeTimers()
    const source = countingRead()
    const memo = new ShortLivedRead(source.read, TTL_MS)

    await memo.get()
    vi.advanceTimersByTime(TTL_MS - 1)
    await memo.get()

    expect(source.calls).toBe(1)
  })

  it('reads again after being told to forget', async () => {
    const source = countingRead()
    const memo = new ShortLivedRead(source.read, TTL_MS)

    await memo.get()
    memo.forget()
    await memo.get()

    expect(source.calls).toBe(2)
  })

  it('passes the failure on to the caller', async () => {
    const memo = new ShortLivedRead(() => Promise.reject(new Error('unreachable')), TTL_MS)

    await expect(memo.get()).rejects.toThrow('unreachable')
  })

  /** A remembered failure would keep failing until the lifetime expired. */
  it('does not remember a failure, so the next caller tries again', async () => {
    let calls = 0
    const memo = new ShortLivedRead(() => {
      calls += 1
      return calls === 1 ? Promise.reject(new Error('unreachable')) : Promise.resolve(['a'])
    }, TTL_MS)

    await expect(memo.get()).rejects.toThrow('unreachable')
    await expect(memo.get()).resolves.toStrictEqual(['a'])
  })
})

describe('ShortLivedReadByKey', () => {
  it('reads once per key', async () => {
    const source = countingRead()
    const memo = new ShortLivedReadByKey<string>(TTL_MS)

    await memo.get('one', source.read)
    await memo.get('one', source.read)

    expect(source.calls).toBe(1)
  })

  it('keeps separate answers for separate keys', async () => {
    const memo = new ShortLivedReadByKey<string>(TTL_MS)

    await expect(memo.get('one', () => Promise.resolve(['a']))).resolves.toStrictEqual(['a'])
    await expect(memo.get('two', () => Promise.resolve(['b']))).resolves.toStrictEqual(['b'])
  })

  /** The first read for a key wins; a later call with the same key reuses it. */
  it('ignores a different read passed for a key it already holds', async () => {
    const memo = new ShortLivedReadByKey<string>(TTL_MS)

    await memo.get('one', () => Promise.resolve(['first']))

    await expect(memo.get('one', () => Promise.resolve(['second']))).resolves.toStrictEqual([
      'first',
    ])
  })

  it('forgets every key at once', async () => {
    const source = countingRead()
    const memo = new ShortLivedReadByKey<string>(TTL_MS)

    await memo.get('one', source.read)
    await memo.get('two', source.read)
    memo.forget()
    await memo.get('one', source.read)

    expect(source.calls).toBe(3)
  })
})
