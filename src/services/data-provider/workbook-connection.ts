import { buildStarterWorkbook } from './excel/workbook-builder'
import {
  chooseWorkbookFile,
  createWorkbookFile,
  forgetWorkbookHandle,
  hasRememberedWorkbook,
  isFileSystemAccessSupported,
  restoreWorkbookFile,
} from './excel/file-handle-store'
import type { WorkbookFileStore } from './excel/file-workbook-gateway'

/**
 * Tracks which workbook the application is reading and writing.
 *
 * Only relevant to the `local-excel` data source, where the file is chosen by
 * the person using the app rather than fixed by configuration. It is a small
 * observable store rather than React state because the data provider — which
 * is not a component — has to read the same value.
 */

export type WorkbookConnectionStatus =
  /** Checking for a previously chosen workbook. */
  | 'checking'
  /** Ready to read and write. */
  | 'connected'
  /** No workbook chosen yet. */
  | 'disconnected'
  /** Chosen before, but the browser needs a click to restore access. */
  | 'needs-permission'
  /** The browser cannot open files directly. */
  | 'unsupported'

export interface WorkbookConnection {
  status: WorkbookConnectionStatus
  fileName: string | null
  error: string | null
}

let connection: WorkbookConnection = { status: 'checking', fileName: null, error: null }
let store: WorkbookFileStore | null = null

const listeners = new Set<() => void>()

function set(next: WorkbookConnection): void {
  connection = next
  for (const listener of listeners) listener()
}

export function subscribeToWorkbookConnection(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getWorkbookConnection(): WorkbookConnection {
  return connection
}

/** The connected file, or `null`. Read by the data provider factory. */
export function getWorkbookFileStore(): WorkbookFileStore | null {
  return store
}

function connect(next: WorkbookFileStore): void {
  store = next
  set({ status: 'connected', fileName: next.name, error: null })
}

function describe(error: unknown): string {
  // An aborted file picker is the person changing their mind, not a fault.
  if (error instanceof DOMException && error.name === 'AbortError') return ''
  return error instanceof Error ? error.message : 'The workbook could not be opened.'
}

/**
 * Reconnects to the workbook chosen last time, without prompting.
 *
 * Runs at startup. Browsers only re-grant file permission after a gesture, so
 * a remembered file that has lost permission resolves to `needs-permission`
 * and the UI offers a button rather than failing outright.
 */
export async function initialiseWorkbookConnection(): Promise<void> {
  if (!isFileSystemAccessSupported()) {
    set({ status: 'unsupported', fileName: null, error: null })
    return
  }

  try {
    const restored = await restoreWorkbookFile(false)

    if (restored !== null) {
      connect(restored)
      return
    }

    set({
      status: (await hasRememberedWorkbook()) ? 'needs-permission' : 'disconnected',
      fileName: null,
      error: null,
    })
  } catch (error) {
    set({ status: 'disconnected', fileName: null, error: describe(error) })
  }
}

/** Re-grants access to the remembered workbook. Must be called from a click. */
export async function reconnectWorkbook(): Promise<void> {
  try {
    const restored = await restoreWorkbookFile(true)

    if (restored === null) {
      set({
        status: 'needs-permission',
        fileName: null,
        error: 'Access to the workbook was not granted.',
      })
      return
    }

    connect(restored)
  } catch (error) {
    set({ status: 'needs-permission', fileName: null, error: describe(error) })
  }
}

/** Prompts for a workbook. Must be called from a click. */
export async function chooseWorkbook(): Promise<void> {
  try {
    connect(await chooseWorkbookFile())
  } catch (error) {
    const message = describe(error)
    if (message === '') return
    set({ ...connection, error: message })
  }
}

/**
 * Creates a correctly structured, empty workbook and connects to it.
 *
 * Saving it inside the OneDrive folder is what publishes it to SharePoint.
 */
export async function createAndConnectWorkbook(suggestedName: string): Promise<void> {
  try {
    connect(await createWorkbookFile(buildStarterWorkbook, suggestedName))
  } catch (error) {
    const message = describe(error)
    if (message === '') return
    set({ ...connection, error: message })
  }
}

export async function disconnectWorkbook(): Promise<void> {
  await forgetWorkbookHandle()
  store = null
  set({ status: 'disconnected', fileName: null, error: null })
}
