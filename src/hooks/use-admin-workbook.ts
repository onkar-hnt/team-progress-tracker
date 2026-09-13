import { useSyncExternalStore } from 'react'

import {
  getAdminWorkbookInitialisation,
  subscribeToAdminWorkbookInitialisation,
} from '@services/admin/admin-workbook-initialisation'
import type { AdminWorkbookInitialisation } from '@services/admin/admin-workbook-initialisation'

export function useAdminWorkbookInitialisation(): AdminWorkbookInitialisation {
  return useSyncExternalStore(
    subscribeToAdminWorkbookInitialisation,
    getAdminWorkbookInitialisation,
  )
}
