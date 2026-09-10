import { useSyncExternalStore } from 'react'

import { useAuth } from '@app/providers/auth-context'
import { appConfig } from '@config/app.config'
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
  }
}

function isGraphConfigured(): boolean {
  return appConfig.entra.clientId !== '' && appConfig.entra.tenantId !== ''
}
