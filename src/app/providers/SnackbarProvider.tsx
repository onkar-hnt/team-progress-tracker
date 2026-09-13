import { useCallback, useMemo, useRef, useState } from 'react'
import type { PropsWithChildren } from 'react'

import { SnackbarViewport } from '@components/ui/snackbar/Snackbar'
import type { ActiveSnackbar, SnackbarTone } from '@components/ui/snackbar/Snackbar'

import { SnackbarContext } from './snackbar-context'
import type { SnackbarContextValue, SnackbarRequest } from './snackbar-context'

/**
 * How long each tone stays, in milliseconds.
 *
 * Graded by how much reading it needs rather than set to one number. A success
 * confirms something the reader just did and only has to be noticed; a failure
 * has to be read, understood and possibly acted on, and it is usually the only
 * thing on screen saying so.
 */
const DEFAULT_DURATION: Readonly<Record<SnackbarTone, number>> = {
  success: 4_000,
  info: 5_000,
  warning: 7_000,
  error: 9_000,
}

/**
 * How many are shown at once before the oldest is dropped.
 *
 * A cap rather than an unbounded list: one action can fail several times if
 * somebody keeps pressing, and a column of identical messages growing off the
 * top of the screen hides the page instead of explaining it. Three is enough to
 * see that more than one thing happened.
 */
const MAX_VISIBLE = 3

/**
 * The application's one channel for "that worked" and "that did not".
 *
 * Mounted above everything, including the query client, so that the write
 * mutations in `use-work-tracker` can report their own failures — which is what
 * removed the `writeState` banner that used to sit on four admin pages, stranded
 * behind whichever dialog had caused it.
 *
 * State lives here and the drawing lives in `SnackbarViewport`, so this file has
 * no opinion about position or animation and the component has none about
 * timing. The ids are a counter rather than a random value or `useId`: they are
 * never rendered, only matched, and a counter cannot collide with itself.
 */
export function SnackbarProvider({ children }: PropsWithChildren) {
  const [items, setItems] = useState<readonly ActiveSnackbar[]>([])
  const nextId = useRef(0)

  const dismiss = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])

  const show = useCallback((request: SnackbarRequest) => {
    nextId.current += 1

    const item: ActiveSnackbar = {
      id: String(nextId.current),
      tone: request.tone,
      message: request.message,
      duration: request.duration ?? DEFAULT_DURATION[request.tone],
      ...(request.title === undefined ? {} : { title: request.title }),
    }

    // Newest last, so the column reads in the order things happened, and
    // trimmed from the front, so the one that just arrived is never the one
    // dropped.
    setItems((current) => [...current, item].slice(-MAX_VISIBLE))
  }, [])

  // Memoised as a whole. Every consumer reads this object, so rebuilding it on
  // each render of this provider — which happens on every snackbar — would
  // re-render all of them.
  const value = useMemo<SnackbarContextValue>(
    () => ({
      show,
      success: (message, details) => show({ tone: 'success', message, ...details }),
      error: (message, details) => show({ tone: 'error', message, ...details }),
      warning: (message, details) => show({ tone: 'warning', message, ...details }),
      info: (message, details) => show({ tone: 'info', message, ...details }),
    }),
    [show],
  )

  return (
    <SnackbarContext.Provider value={value}>
      {children}
      <SnackbarViewport items={items} onDismiss={dismiss} />
    </SnackbarContext.Provider>
  )
}
