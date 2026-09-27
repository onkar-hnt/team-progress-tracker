import { createContext, useContext } from 'react'

import type { ConfirmRequest } from '@models/ui.model'

/** Resolves true when confirmed and any action succeeded. */
export type Confirm = (request: ConfirmRequest) => Promise<boolean>

export const ConfirmContext = createContext<Confirm | undefined>(undefined)

export function useConfirm(): Confirm {
  const context = useContext(ConfirmContext)

  if (context === undefined) {
    throw new Error('useConfirm must be used inside <ConfirmProvider>.')
  }

  return context
}
