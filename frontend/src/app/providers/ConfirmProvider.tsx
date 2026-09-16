import { useCallback, useRef, useState } from 'react'
import type { PropsWithChildren } from 'react'

import { ConfirmDialog } from '@components/ui/confirm-dialog/ConfirmDialog'
import { logFailure } from '@services/errors/error-message'

import { ConfirmContext } from './confirm-context'
import type { Confirm, ConfirmRequest } from './confirm-context'

/** Single shared confirm dialog; resolver lives in a ref to avoid extra renders. */
export function ConfirmProvider({ children }: PropsWithChildren) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const resolveRef = useRef<((confirmed: boolean) => void) | null>(null)

  const settle = useCallback((confirmed: boolean) => {
    const resolve = resolveRef.current
    resolveRef.current = null

    setRequest(null)
    setIsRunning(false)

    // Resolve after state updates so a back-to-back confirm is not overwritten.
    resolve?.(confirmed)
  }, [])

  const confirm = useCallback<Confirm>((next) => {
    // A second question while one is open answers the first with no.
    resolveRef.current?.(false)

    setIsRunning(false)
    setRequest(next)

    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve
    })
  }, [])

  const runConfirmedAction = useCallback(
    async (current: ConfirmRequest) => {
      if (current.action === undefined) {
        settle(true)
        return
      }

      setIsRunning(true)

      try {
        await current.action()
        settle(true)
      } catch (error) {
        // Mutation already reported via snackbar.
        logFailure('confirmed action', error)
        settle(false)
      }
    },
    [settle],
  )

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      <ConfirmDialog
        isRunning={isRunning}
        onCancel={() => {
          settle(false)
        }}
        onConfirm={() => {
          if (request !== null) void runConfirmedAction(request)
        }}
        request={request}
      />
    </ConfirmContext.Provider>
  )
}
