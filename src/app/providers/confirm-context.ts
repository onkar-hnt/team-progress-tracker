import { createContext, useContext } from 'react'

import type { ConfirmRequest } from '@components/ui/confirm-dialog/ConfirmDialog'

/**
 * What to ask and what happens when the answer is yes.
 *
 * Defined with the dialog that draws it, since the shape is that component's
 * props as much as it is this service's argument. Re-exported here so a call
 * site needs only this one module.
 */
export type { ConfirmRequest }

/**
 * Asks the question and resolves to what was answered.
 *
 * `true` means confirmed, and — where an `action` was given — that it succeeded.
 * So `if (await confirm({…}))` is a complete guard: reaching the body means the
 * thing happened, which is what makes a success message safe to put there.
 */
export type Confirm = (request: ConfirmRequest) => Promise<boolean>

export const ConfirmContext = createContext<Confirm | undefined>(undefined)

export function useConfirm(): Confirm {
  const context = useContext(ConfirmContext)

  if (context === undefined) {
    throw new Error('useConfirm must be used inside <ConfirmProvider>.')
  }

  return context
}
