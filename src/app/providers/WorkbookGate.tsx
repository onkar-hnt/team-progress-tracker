import { useEffect, useState, useSyncExternalStore } from 'react'
import type { PropsWithChildren } from 'react'

import { FullPageLoader } from '@components/ui/feedback/Feedback'
import { appConfig } from '@config/app.config'
import {
  chooseWorkbook,
  createAndConnectWorkbook,
  getWorkbookConnection,
  initialiseWorkbookConnection,
  reconnectWorkbook,
  subscribeToWorkbookConnection,
} from '@services/data-provider'
import { WORKBOOK_FILE_NAME } from '@services/data-provider/excel/excel-schema'
import { WORKBOOK_TEMPLATE } from '@services/data-provider/excel/workbook-template'

import './WorkbookGate.scss'

/**
 * Holds the application back until a workbook is connected.
 *
 * Only applies to the `local-excel` data source, where the file is chosen by
 * the person rather than fixed by configuration. Nothing renders behind this
 * gate, because every screen — including sign-in, which reads its accounts
 * from the Employees sheet — depends on the workbook being readable.
 */
export function WorkbookGate({ children }: PropsWithChildren) {
  if (appConfig.dataSource !== 'local-excel') return <>{children}</>

  return <LocalWorkbookGate>{children}</LocalWorkbookGate>
}

function LocalWorkbookGate({ children }: PropsWithChildren) {
  const connection = useSyncExternalStore(subscribeToWorkbookConnection, getWorkbookConnection)
  const [isBusy, setIsBusy] = useState(false)

  useEffect(() => {
    void initialiseWorkbookConnection()
  }, [])

  if (connection.status === 'connected') return <>{children}</>
  if (connection.status === 'checking') return <FullPageLoader label="Looking for the workbook" />

  async function run(action: () => Promise<void>) {
    setIsBusy(true)
    try {
      await action()
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="workbook-gate">
      <div className="workbook-gate__card">
        <h1>Connect the team workbook</h1>

        {connection.status === 'unsupported' ? (
          <UnsupportedBrowser />
        ) : (
          <ConnectActions
            isBusy={isBusy}
            needsPermission={connection.status === 'needs-permission'}
            onChoose={() => void run(chooseWorkbook)}
            onCreate={() => void run(() => createAndConnectWorkbook(WORKBOOK_FILE_NAME))}
            onReconnect={() => void run(reconnectWorkbook)}
          />
        )}

        {connection.error === null ? null : (
          <p className="workbook-gate__error" role="alert">
            {connection.error}
          </p>
        )}

        <details className="workbook-gate__details">
          <summary>What the workbook must contain</summary>
          <p>
            One sheet per table, each with its column names in the first row. Creating the workbook
            from this screen sets all of this up for you.
          </p>
          <ul>
            {WORKBOOK_TEMPLATE.map((sheet) => (
              <li key={sheet.sheetName}>
                <strong>{sheet.sheetName}</strong> — {sheet.description}
              </li>
            ))}
          </ul>
        </details>
      </div>
    </div>
  )
}

interface ConnectActionsProps {
  isBusy: boolean
  needsPermission: boolean
  onChoose: () => void
  onCreate: () => void
  onReconnect: () => void
}

function ConnectActions({
  isBusy,
  needsPermission,
  onChoose,
  onCreate,
  onReconnect,
}: ConnectActionsProps) {
  if (needsPermission) {
    return (
      <>
        <p>
          The workbook you chose before is still remembered, but your browser needs your permission
          again after a restart.
        </p>
        <div className="workbook-gate__actions">
          <button className="button button--primary" disabled={isBusy} onClick={onReconnect}>
            Reconnect workbook
          </button>
          <button className="button" disabled={isBusy} onClick={onChoose}>
            Choose a different file
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <p>
        Every record lives in an Excel workbook, not in this application. Point it at the copy in
        your OneDrive folder and your edits sync back to SharePoint automatically.
      </p>
      <div className="workbook-gate__actions">
        <button className="button button--primary" disabled={isBusy} onClick={onChoose}>
          Choose workbook
        </button>
        <button className="button" disabled={isBusy} onClick={onCreate}>
          Create a new one
        </button>
      </div>
      <p className="workbook-gate__hint">
        Look for <code>{WORKBOOK_FILE_NAME}</code> inside your synced OneDrive folder. If there
        is not one yet, create it there so that it uploads to SharePoint.
      </p>
    </>
  )
}

function UnsupportedBrowser() {
  return (
    <>
      <p>
        This browser cannot open a file directly, so the workbook cannot be reached from here. Open
        the application in <strong>Microsoft Edge</strong> or <strong>Google Chrome</strong> on a
        computer where the SharePoint folder is synced.
      </p>
      <p className="workbook-gate__hint">
        Safari and Firefox do not support the file access this needs. On those browsers the
        workbook has to be read through Microsoft Graph instead, which requires an Entra app
        registration.
      </p>
    </>
  )
}
