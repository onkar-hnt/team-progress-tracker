import { useState, useSyncExternalStore } from 'react'

import { ErrorState } from '@components/ui/feedback/Feedback'
import { Panel } from '@components/ui/panel/Panel'
import { DATA_SOURCE_LABELS, appConfig } from '@config/app.config'
import {
  useAdminWorkbookInitialisation,
  useAdminWorkbookStatus,
  useEnsureAdminWorkbook,
} from '@hooks/use-admin-workbook'
import {
  chooseWorkbook,
  disconnectWorkbook,
  getWorkbookConnection,
  subscribeToWorkbookConnection,
} from '@services/data-provider'
import { getDataProvider } from '@services/data-provider/index'
import type { WorkbookStructureReport } from '@services/data-provider/excel/ensure-workbook-structure'
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
  const workbookStatus = useAdminWorkbookStatus()

  const isLocalWorkbook = appConfig.dataSource === 'local-excel'
  const hasWorkbookUrl = appConfig.sharePoint.workbookUrl !== ''
  const hasRegistration = appConfig.entra.clientId !== '' && appConfig.entra.tenantId !== ''

  // Taken from the workbook itself rather than inferred from configuration:
  // configuration says what should happen, and this says what actually did.
  const isConnected = workbookStatus.data?.isConnected ?? false

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
            value={
              workbookStatus.isPending
                ? 'Checking…'
                : isConnected
                  ? 'Connected to the Excel workbook'
                  : 'Not connected'
            }
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

        {workbookStatus.data?.error == null ? null : (
          <ErrorState
            message={workbookStatus.data.error}
            onRetry={() => void workbookStatus.refetch()}
          />
        )}

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

        <WorkbookStructureCheck />
      </Panel>
    </div>
  )
}

/**
 * Checks the workbook against the structure above, and repairs it if it can.
 *
 * Here rather than on a screen of its own because this is the panel that
 * states what the workbook must contain, and "does it?" is the obvious next
 * question. Running it is safe at any time: nothing is deleted, and a
 * workbook that is already correct is left untouched.
 */
function WorkbookStructureCheck() {
  const status = useAdminWorkbookStatus()
  const initialisation = useAdminWorkbookInitialisation()
  const ensure = useEnsureAdminWorkbook()

  const isChecking = ensure.isPending || initialisation.status === 'initialising'

  // The startup run and this button report through the same state, so an
  // administrator sees one answer rather than two that can disagree.
  const message =
    initialisation.report === null
      ? describeMissing(status.data?.structure ?? null)
      : describeReport(initialisation.report)

  return (
    <>
      <div className="settings__actions">
        <button
          className="button"
          disabled={isChecking || status.data?.hasWorkbook !== true}
          onClick={() => ensure.mutate()}
          type="button"
        >
          {isChecking ? 'Checking the workbook…' : 'Check workbook structure'}
        </button>
      </div>

      <div aria-live="polite" role="status">
        {initialisation.error === null ? (
          message === null ? null : <p className="settings__note">{message}</p>
        ) : (
          <p className="form__alert">{initialisation.error}</p>
        )}
      </div>
    </>
  )
}

/** `null` when nothing is known yet, so the panel stays quiet rather than guessing. */
function describeMissing(
  missing: {
    missingTables: string[]
    missingColumns: { tableName: string; columns: string[] }[]
  } | null,
): string | null {
  if (missing === null) return null

  if (missing.missingTables.length === 0 && missing.missingColumns.length === 0) {
    return 'The workbook has every sheet and column the application needs.'
  }

  const parts = [
    missing.missingTables.length === 0
      ? null
      : `missing tables: ${missing.missingTables.join(', ')}`,
    missing.missingColumns.length === 0
      ? null
      : `missing columns: ${missing.missingColumns
          .map((entry) => `${entry.tableName} (${entry.columns.join(', ')})`)
          .join('; ')}`,
  ].filter((part): part is string => part !== null)

  return `The workbook is incomplete — ${parts.join(', and ')}.`
}

function describeReport(report: WorkbookStructureReport): string {
  const created = [
    report.createdTables.length === 0
      ? null
      : `created ${report.createdTables.join(', ')}`,
    report.addedColumns.length === 0
      ? null
      : `added columns to ${report.addedColumns.map((entry) => entry.tableName).join(', ')}`,
  ].filter((part): part is string => part !== null)

  if (created.length > 0) {
    return `Workbook updated: ${created.join(', and ')}.`
  }

  if (report.isReady) {
    return 'The workbook already has every sheet and column the application needs.'
  }

  return `${describeMissing(report) ?? ''} This connection cannot create them, so they must be added in Excel.`.trim()
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
