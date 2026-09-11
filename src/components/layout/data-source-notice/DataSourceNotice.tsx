import { useSyncExternalStore } from 'react'

import { useAuth } from '@app/providers/auth-context'
import { appConfig } from '@config/app.config'
import { useAdminWorkbookInitialisation } from '@hooks/use-admin-workbook'
import type { AdminWorkbookInitialisation } from '@services/admin/admin-workbook-initialisation'
import { canOpenWorkbook } from '@services/auth/index'
import { getWorkbookConnection, subscribeToWorkbookConnection } from '@services/data-provider'

import './DataSourceNotice.scss'

/**
 * States the application's current data source, in the application.
 *
 * Without this, "the dashboard is empty" is ambiguous: it could mean nobody
 * logged any work, or that the app is showing sample data, or that the
 * workbook connection is misconfigured. Those need very different responses,
 * so the answer is on screen rather than in a config file.
 *
 * Nothing is shown once the workbook is genuinely connected, since a banner
 * confirming normal operation would just become furniture.
 */
export function DataSourceNotice() {
  const initialisation = useAdminWorkbookInitialisation()

  return (
    <>
      <WorkbookPreparationNotice state={initialisation} />
      <DataSourceModeNotice />
    </>
  )
}

/**
 * Progress of the startup workbook check, while it is worth mentioning.
 *
 * The application is usable throughout, so this is a banner rather than a
 * blocking screen: an administrator can read yesterday's data while the
 * structure of the workbook is being confirmed.
 *
 * Nothing is rendered for `not-applicable`, because that state means there is
 * no workbook to prepare and the notice below already explains why.
 */
function WorkbookPreparationNotice({ state }: { state: AdminWorkbookInitialisation }) {
  if (state.status === 'initialising') {
    return (
      <p className="data-source-notice" role="status">
        <strong>Preparing the Admin workbook.</strong> Checking that it has the sheets and columns
        the application needs. You can keep working while this finishes.
      </p>
    )
  }

  if (state.status === 'failed') {
    return (
      <p className="data-source-notice data-source-notice--error" role="status">
        <strong>The Admin workbook could not be prepared.</strong> {state.error} You are still
        signed in; use <strong>Check workbook structure</strong> in Settings to try again.
      </p>
    )
  }

  return null
}

function DataSourceModeNotice() {
  const { user } = useAuth()
  const connection = useSyncExternalStore(subscribeToWorkbookConnection, getWorkbookConnection)

  switch (appConfig.dataSource) {
    case 'local-excel':
      // Reaching a screen at all means the gate let it through, so the file is
      // connected and there is nothing to warn about. The exception is a file
      // opened read-only, where saving will fail later rather than now.
      return connection.status === 'connected' ? null : (
        <p className="data-source-notice data-source-notice--error" role="status">
          <strong>Workbook disconnected.</strong> Reload the page to reconnect it.
        </p>
      )

    case 'sharepoint-excel':
      return isGraphConfigured() ? null : (
        <p className="data-source-notice data-source-notice--error" role="status">
          <strong>Workbook not reachable.</strong> The data source is set to the SharePoint
          workbook, but no Microsoft app registration is configured, so the application cannot
          obtain access to the file. Screens will stay empty until{' '}
          <code>VITE_ENTRA_CLIENT_ID</code> and <code>VITE_ENTRA_TENANT_ID</code> are set.
        </p>
      )

    case 'memory-excel':
      return (
        <p className="data-source-notice" role="status">
          <strong>Working in a temporary workbook.</strong> The Admin workbook on SharePoint
          cannot be opened from a browser without a Microsoft app registration, so records are
          being held in memory and will be lost when this tab is reloaded.
          {canOpenWorkbook(user)
            ? ' Settings explains what is needed to connect the real workbook.'
            : ''}
        </p>
      )

    case 'mock':
      return (
        <p className="data-source-notice" role="status">
          <strong>Showing sample data.</strong> The application is not connected to the Excel
          workbook, so these records come from the built-in fixtures and any change you make will
          be lost on refresh.
          {canOpenWorkbook(user)
            ? ' Set VITE_DATA_SOURCE to local-excel to work against the real file.'
            : ''}
        </p>
      )

    case 'supabase':
      // Every entity is stored in the database now that feedback has moved
      // across, so there is nothing left to warn about. A banner confirming
      // normal operation would just become furniture, which is the same
      // reason a connected workbook shows none.
      return null
  }
}

function isGraphConfigured(): boolean {
  return appConfig.entra.clientId !== '' && appConfig.entra.tenantId !== ''
}
