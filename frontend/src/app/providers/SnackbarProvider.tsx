import { useCallback, useMemo, useRef, useState } from 'react'
import type { PropsWithChildren } from 'react'

import { SnackbarViewport } from '@components/ui/snackbar/Snackbar'
import type { ActiveSnackbar, SnackbarTone } from '@components/ui/snackbar/Snackbar'

import { SnackbarContext } from './snackbar-context'
import type { SnackbarContextValue, SnackbarRequest } from './snackbar-context'

const DEFAULT_DURATION: Readonly<Record<SnackbarTone, number>> = {
  success: 4_000,
  info: 5_000,
  warning: 7_000,
  error: 9_000,
}

const MAX_VISIBLE = 3

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

    // Newest last; drop from the front when over the cap.
    setItems((current) => [...current, item].slice(-MAX_VISIBLE))
  }, [])

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
