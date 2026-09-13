import { useSyncExternalStore } from 'react'

import { useAuth } from '@app/providers/auth-context'
import { appConfig } from '@config/app.config'
import { useAdminWorkbookInitialisation } from '@hooks/use-admin-workbook'
import type { AdminWorkbookInitialisation } from '@services/admin/admin-workbook-initialisation'
import { canOpenWorkbook } from '@services/auth/index'
import { getWorkbookConnection, subscribeToWorkbookConnection } from '@services/data-provider'

import './DataSourceNotice.scss'

export function DataSourceNotice() {
  const initialisation = useAdminWorkbookInitialisation()

  return (
    <>
      <WorkbookPreparationNotice state={initialisation} />
      <DataSourceModeNotice />
    </>
  )
}

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
        signed in, and reloading the page tries again — the check runs once per sign-in.
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
            ? ' Connecting the real workbook needs VITE_ENTRA_CLIENT_ID and VITE_ENTRA_TENANT_ID pointed at a Microsoft app registration.'
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
      return null
  }
}

function isGraphConfigured(): boolean {
  return appConfig.entra.clientId !== '' && appConfig.entra.tenantId !== ''
}
