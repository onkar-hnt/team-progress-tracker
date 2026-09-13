import { createContext, useContext } from 'react'

import type { SnackbarTone } from '@components/ui/snackbar/Snackbar'

/**
 * What kind of thing happened: `success`, `error`, `warning` or `info`.
 *
 * Defined with the component that draws it, since the difference between the
 * four is a colour, an icon and how insistently a screen reader announces them.
 * Re-exported here so a call site needs only this one module.
 */
export type { SnackbarTone }

export interface SnackbarDetails {
  /**
   * A short headline above the message.
   *
   * Worth adding only when the message alone does not say what it is about —
   * most do, and a title repeating them in fewer words is noise.
   */
  title?: string

  /**
   * How long it stays, in milliseconds. `0` keeps it until dismissed.
   *
   * Left out, each tone uses its own default: a failure is on screen roughly
   * twice as long as a success, because it has to be read rather than merely
   * noticed, and there is usually nothing else on the page saying it.
   */
  duration?: number
}

export interface SnackbarRequest extends SnackbarDetails {
  tone: SnackbarTone

  /** One sentence, in the reader's terms. Never a raw error. */
  message: string
}

export interface SnackbarContextValue {
  show: (request: SnackbarRequest) => void

  /** `show` with the tone filled in, which is how nearly every call site uses it. */
  success: (message: string, details?: SnackbarDetails) => void
  error: (message: string, details?: SnackbarDetails) => void
  warning: (message: string, details?: SnackbarDetails) => void
  info: (message: string, details?: SnackbarDetails) => void
}

/**
 * `undefined` marks "no provider mounted", which is a wiring bug rather than a
 * state the application can be in — the same distinction `AuthContext` draws.
 */
export const SnackbarContext = createContext<SnackbarContextValue | undefined>(undefined)

export function useSnackbar(): SnackbarContextValue {
  const context = useContext(SnackbarContext)

  if (context === undefined) {
    throw new Error('useSnackbar must be used inside <SnackbarProvider>.')
  }

  return context
}
