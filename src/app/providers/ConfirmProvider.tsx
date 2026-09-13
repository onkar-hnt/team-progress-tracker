import { useCallback, useRef, useState } from 'react'
import type { PropsWithChildren } from 'react'

import { ConfirmDialog } from '@components/ui/confirm-dialog/ConfirmDialog'
import { logFailure } from '@services/errors/error-message'

import { ConfirmContext } from './confirm-context'
import type { Confirm, ConfirmRequest } from './confirm-context'

/**
 * The one confirmation dialog, asked for rather than rendered.
 *
 * Before this there were five `window.confirm` calls — one on each admin screen
 * and one on Feedback — which is the browser's own dialog: unstyled, unable to
 * show progress, and blocking the main thread while it waits. Replacing each of
 * them with a local `isConfirming` state and a local `<Modal>` would have been
 * five copies of the same four pieces of state, so the dialog is a service
 * instead: one instance mounted here, and `useConfirm()` returning a promise.
 *
 * The promise is what makes it read like the `window.confirm` it replaces:
 *
 *     if (await confirm({ title: 'Delete this task?', … })) …
 *
 * The resolver is held in a ref rather than in state because resolving is not a
 * render — nothing on screen depends on which function will be called — and
 * putting it in state would mean a render between the press and the answer.
 */
export function ConfirmProvider({ children }: PropsWithChildren) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const resolveRef = useRef<((confirmed: boolean) => void) | null>(null)

  /** Answers the waiting caller and puts the dialog away. */
  const settle = useCallback((confirmed: boolean) => {
    const resolve = resolveRef.current
    resolveRef.current = null

    setRequest(null)
    setIsRunning(false)

    // After the state updates, so a caller that opens another dialog in the
    // same turn is not overwritten by this one closing.
    resolve?.(confirmed)
  }, [])

  const confirm = useCallback<Confirm>((next) => {
    // A second question while one is open answers the first with "no" rather
    // than leaving it unresolved. Nothing in the application does this today;
    // the alternative is a promise that never settles, which is the kind of
    // thing that gets found much later.
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
        // Logged and not shown: the mutation behind `action` has already told
        // the reader through the snackbar. See `ConfirmRequest.action`.
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
