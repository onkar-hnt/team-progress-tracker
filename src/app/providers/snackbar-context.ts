import { createContext, useContext } from 'react'

import type { SnackbarTone } from '@components/ui/snackbar/Snackbar'

export type { SnackbarTone }

export interface SnackbarDetails {
  title?: string

  /** Milliseconds; 0 keeps the snackbar until dismissed. */
  duration?: number
}

export interface SnackbarRequest extends SnackbarDetails {
  tone: SnackbarTone

  message: string
}

export interface SnackbarContextValue {
  show: (request: SnackbarRequest) => void

  success: (message: string, details?: SnackbarDetails) => void
  error: (message: string, details?: SnackbarDetails) => void
  warning: (message: string, details?: SnackbarDetails) => void
  info: (message: string, details?: SnackbarDetails) => void
}

export const SnackbarContext = createContext<SnackbarContextValue | undefined>(undefined)

export function useSnackbar(): SnackbarContextValue {
  const context = useContext(SnackbarContext)

  if (context === undefined) {
    throw new Error('useSnackbar must be used inside <SnackbarProvider>.')
  }

  return context
}
