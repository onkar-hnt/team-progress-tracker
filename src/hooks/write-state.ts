/** The part of a mutation result the shared write banner needs. */
interface WriteMutation {
  readonly error: Error | null
  readonly reset: () => void
}

/**
 * The first failure across a page's write mutations, and a way to dismiss it.
 *
 * A mutation keeps its error until it next runs, and these banners sit on the
 * page rather than inside the dialog that caused them. Without something to
 * clear the state, a failed save leaves its alert above the table, still there
 * beside the next record somebody opens.
 *
 * `clear` is called when a popup opens rather than when one closes, so the
 * message survives long enough to be read: a failed save leaves its dialog
 * open, which means the alert behind it only becomes legible once that dialog
 * is out of the way.
 */
export function writeState(mutations: readonly WriteMutation[]): {
  error: Error | null
  clear: () => void
} {
  return {
    error: mutations.find((mutation) => mutation.error !== null)?.error ?? null,
    clear: () => {
      for (const mutation of mutations) mutation.reset()
    },
  }
}
