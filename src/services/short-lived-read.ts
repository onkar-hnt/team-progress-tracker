/**
 * Coalescing memos for reads that several callers want at once.
 *
 * Nothing here knows what it is caching. The lifetime is the caller's to
 * choose, because only the caller knows how stale its own answer may be.
 */

/** Shares one in-flight read per table; callers get a copied array. */
export class ShortLivedRead<TRow> {
  private entry: { readAt: number; rows: Promise<readonly TRow[]> } | null = null

  private readonly read: () => Promise<TRow[]>

  private readonly ttlMs: number

  constructor(read: () => Promise<TRow[]>, ttlMs: number) {
    this.read = read
    this.ttlMs = ttlMs
  }

  get(): Promise<TRow[]> {
    const now = Date.now()

    if (this.entry === null || now - this.entry.readAt >= this.ttlMs) {
      const rows = this.read()
      const entry = { readAt: now, rows }
      this.entry = entry

      void rows.catch(() => {
        if (this.entry === entry) this.entry = null
      })
    }

    return this.entry.rows.then((rows) => [...rows])
  }

  forget(): void {
    this.entry = null
  }
}

/** Per-key memo for reads whose answer depends on who is asking. */
export class ShortLivedReadByKey<TRow> {
  private readonly reads = new Map<string, ShortLivedRead<TRow>>()

  private readonly ttlMs: number

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs
  }

  get(key: string, read: () => Promise<TRow[]>): Promise<TRow[]> {
    const existing = this.reads.get(key)
    if (existing !== undefined) return existing.get()

    const created = new ShortLivedRead(read, this.ttlMs)
    this.reads.set(key, created)
    return created.get()
  }

  forget(): void {
    this.reads.clear()
  }
}
