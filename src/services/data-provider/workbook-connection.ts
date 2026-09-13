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

export type WorkbookConnectionStatus =
  | 'checking'
  | 'connected'
  | 'disconnected'
  | 'needs-permission'
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

export function getWorkbookFileStore(): WorkbookFileStore | null {
  return store
}

function connect(next: WorkbookFileStore): void {
  store = next
  set({ status: 'connected', fileName: next.name, error: null })
}

function describe(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') return ''
  return error instanceof Error ? error.message : 'The workbook could not be opened.'
}

/** Restores remembered file at startup; lost permission yields needs-permission. */
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

export async function chooseWorkbook(): Promise<void> {
  try {
    connect(await chooseWorkbookFile())
  } catch (error) {
    const message = describe(error)
    if (message === '') return
    set({ ...connection, error: message })
  }
}

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
