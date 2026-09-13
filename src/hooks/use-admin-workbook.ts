import { useSyncExternalStore } from 'react'

import {
  getAdminWorkbookInitialisation,
  subscribeToAdminWorkbookInitialisation,
} from '@services/admin/admin-workbook-initialisation'
import type { AdminWorkbookInitialisation } from '@services/admin/admin-workbook-initialisation'

/**
 * Progress of the startup preparation of the Admin workbook.
 *
 * Kept apart from the record hooks in `use-work-tracker` because this is about
 * the data source rather than the data, and because it must keep working when
 * the workbook cannot be read — which is exactly when it is worth reporting.
 *
 * Read from the initialisation store rather than a query, because the work is
 * started by the session bootstrap and not by whichever component happens to
 * want to display it. Subscribing here cannot trigger a run.
 *
 * Two other hooks lived here until the Settings screen stopped reporting on the
 * workbook: one read its structure to list the sheets, the other re-ran the
 * preparation behind a button. Nothing displays a structure report now, and the
 * preparation is retried by reloading, since it runs once per sign-in.
 */
export function useAdminWorkbookInitialisation(): AdminWorkbookInitialisation {
  return useSyncExternalStore(
    subscribeToAdminWorkbookInitialisation,
    getAdminWorkbookInitialisation,
  )
}
