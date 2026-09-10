import { useState, useSyncExternalStore } from 'react'

import { Panel } from '@components/ui/panel/Panel'
import { DATA_SOURCE_LABELS, appConfig } from '@config/app.config'
import {
  chooseWorkbook,
  disconnectWorkbook,
  getWorkbookConnection,
  subscribeToWorkbookConnection,
} from '@services/data-provider'
import { getDataProvider } from '@services/data-provider/index'
import { WORKBOOK_TEMPLATE } from '@services/data-provider/excel/workbook-template'

import './SettingsPage.scss'

/**
 * Where the data source is explained and, for a local workbook, changed.
 *
 * This exists because "the dashboard is empty" has several possible causes,
 * and an administrator needs to be able to tell them apart without reading
 * environment files: whether the workbook is connected, what it must contain,
 * and what is missing if it is not.
 */
export function SettingsPage() {
  const connection = useSyncExternalStore(subscribeToWorkbookConnection, getWorkbookConnection)
  const [isBusy, setIsBusy] = useState(false)

  const isLocalWorkbook = appConfig.dataSource === 'local-excel'
  const hasWorkbookUrl = appConfig.sharePoint.workbookUrl !== ''
  const hasRegistration = appConfig.entra.clientId !== '' && appConfig.entra.tenantId !== ''

  const isConnected = isLocalWorkbook
    ? connection.status === 'connected'
    : appConfig.dataSource === 'sharepoint-excel' && hasWorkbookUrl && hasRegistration

  async function run(action: () => Promise<void>) {
    setIsBusy(true)
    try {
      await action()
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="settings">
      <Panel
        description="Where the application is reading and writing records."
        isPageHeading
        title="Data source"
      >
        <dl className="settings__facts">
          <Fact
            label="Status"
            tone={isConnected ? 'positive' : 'attention'}
            value={isConnected ? 'Connected to the Excel workbook' : 'Not connected'}
          />
          <Fact label="Configured source" value={DATA_SOURCE_LABELS[appConfig.dataSource]} />
          <Fact label="Provider in use" value={getDataProvider().name} />

          {isLocalWorkbook ? (
            <Fact
              label="Connected file"
              tone={connection.fileName === null ? 'attention' : 'positive'}
              value={connection.fileName ?? 'None'}
            />
          ) : (
            <>
              <Fact
                label="Workbook link"
                tone={hasWorkbookUrl ? 'positive' : 'attention'}
                value={hasWorkbookUrl ? 'Set' : 'Not set'}
              />
              <Fact
                label="Microsoft app registration"
                tone={hasRegistration ? 'positive' : 'attention'}
                value={hasRegistration ? 'Set' : 'Not set'}
              />
            </>
          )}

          <Fact label="Expected file name" value={appConfig.sharePoint.workbookFileName} />
        </dl>

        {isLocalWorkbook ? (
          <div className="settings__actions">
            <button
              className="button button--primary"
              disabled={isBusy}
              onClick={() => void run(chooseWorkbook)}
            >
              Change workbook
            </button>
            <button
              className="button"
              disabled={isBusy || connection.status !== 'connected'}
              onClick={() => void run(disconnectWorkbook)}
            >
              Disconnect
            </button>
          </div>
        ) : null}

        {isLocalWorkbook ? (
          <p className="settings__note">
            Changes are written straight into the file. Keep it in the folder synced by OneDrive
            and the sync client publishes every change to SharePoint. Anything edited in Excel
            appears here when you return to this tab.
          </p>
        ) : (
          <GraphSteps isConnected={isConnected} />
        )}
      </Panel>

      <Panel
        description="One sheet per table. The application reads them by name, so spelling and casing matter."
        title="Workbook structure"
      >
        <dl className="settings__sheets">
          {WORKBOOK_TEMPLATE.map((sheet) => (
            <div key={sheet.sheetName} className="settings__sheet">
              <dt>
                <code>{sheet.sheetName}</code>
              </dt>
              <dd>
                <p>{sheet.description}</p>
                <p className="settings__columns">{sheet.columns.join(' · ')}</p>
              </dd>
            </div>
          ))}
        </dl>
        <p className="settings__note">
          No records are stored in the application itself. An empty workbook, or one with only a
          default <code>Sheet1</code>, will produce empty screens.
        </p>
      </Panel>
    </div>
  )
}

function GraphSteps({ isConnected }: { isConnected: boolean }) {
  if (isConnected) return null

  return (
    <div className="settings__steps">
      <h3>To connect the workbook</h3>
      <ol>
        <li>
          Set <code>VITE_DATA_SOURCE</code> to <code>local-excel</code> and connect the synced
          copy of the file. This needs no registration and is the quickest route.
        </li>
        <li>
          Or, to read SharePoint directly, register the application in Microsoft Entra as a
          single-page application with delegated <code>Files.ReadWrite.All</code> and{' '}
          <code>User.Read</code> permissions and a redirect URI matching where this app is served.
        </li>
        <li>
          Put the registration&apos;s client and tenant ids in <code>.env.local</code> as{' '}
          <code>VITE_ENTRA_CLIENT_ID</code> and <code>VITE_ENTRA_TENANT_ID</code>, then set{' '}
          <code>VITE_DATA_SOURCE</code> to <code>sharepoint-excel</code>.
        </li>
      </ol>
      <p className="settings__note">
        The sharing link alone is not enough for the SharePoint route. A browser cannot read a
        SharePoint file without a token, and the registration is what issues one.
      </p>
    </div>
  )
}

function Fact({
  label,
  tone = 'neutral',
  value,
}: {
  label: string
  tone?: 'attention' | 'neutral' | 'positive'
  value: string
}) {
  return (
    <div className="settings__fact">
      <dt>{label}</dt>
      <dd className={`settings__value settings__value--${tone}`}>{value}</dd>
    </div>
  )
}
