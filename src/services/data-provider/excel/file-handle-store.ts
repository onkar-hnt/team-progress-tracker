import { DataSourceUnavailableError } from '../data-provider.errors'
import type { WorkbookFileStore } from './file-workbook-gateway'

/**
 * Connects the application to a workbook on disk.
 *
 * Uses the File System Access API, which lets a page keep a handle to a file
 * the user picked and read and write it directly. Pointed at the
 * OneDrive-synced copy of the workbook, edits made here sync back to
 * SharePoint through the sync client, and edits made in Excel appear here on
 * the next read.
 *
 * The handle is stored in IndexedDB so the choice survives a refresh.
 * Browsers still require a gesture to re-grant permission after a restart,
 * which is a deliberate protection and cannot be bypassed — the UI asks for
 * one click rather than making the person find the file again.
 */

const DB_NAME = 'team-progress-tracker'
const STORE_NAME = 'workbook'
const HANDLE_KEY = 'workbook-file-handle'

/**
 * Minimal shape of the File System Access API.
 *
 * Declared locally because the DOM lib does not ship these types in every
 * TypeScript version, and a local declaration keeps the feature check honest.
 */
interface FileSystemFileHandleLike {
  readonly name: string
  getFile: () => Promise<File>
  createWritable: () => Promise<{
    write: (data: ArrayBuffer) => Promise<void>
    close: () => Promise<void>
  }>
  queryPermission?: (options: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
  requestPermission?: (options: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
}

interface FilePickerWindow {
  showOpenFilePicker?: (options: {
    multiple?: boolean
    types?: { description: string; accept: Record<string, string[]> }[]
  }) => Promise<FileSystemFileHandleLike[]>
  showSaveFilePicker?: (options: {
    suggestedName?: string
    types?: { description: string; accept: Record<string, string[]> }[]
  }) => Promise<FileSystemFileHandleLike>
}

const EXCEL_FILE_TYPE = {
  description: 'Excel workbook',
  accept: {
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  },
}

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showOpenFilePicker' in window
}

function picker(): FilePickerWindow {
  return window as unknown as FilePickerWindow
}

/** Opens the handle store, creating it on first use. */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)

    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('Could not open local storage for the workbook.'))
  })
}

async function withStore<TValue>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<TValue>,
): Promise<TValue> {
  const database = await openDatabase()

  return new Promise<TValue>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode)
    const request = run(transaction.objectStore(STORE_NAME))

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('The stored workbook reference could not be read.'))
    transaction.oncomplete = () => database.close()
  })
}

async function rememberHandle(handle: FileSystemFileHandleLike): Promise<void> {
  // The handle itself is structured-cloneable, which is what makes persisting
  // the choice possible at all; the file contents are never stored.
  await withStore('readwrite', (store) => store.put(handle, HANDLE_KEY))
}

async function readStoredHandle(): Promise<FileSystemFileHandleLike | null> {
  try {
    const handle = await withStore<FileSystemFileHandleLike | undefined>('readonly', (store) =>
      store.get(HANDLE_KEY),
    )
    return handle ?? null
  } catch {
    return null
  }
}

export async function forgetWorkbookHandle(): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.delete(HANDLE_KEY))
  } catch {
    // Forgetting is best effort; a failure here is not worth surfacing.
  }
}

async function hasWritePermission(
  handle: FileSystemFileHandleLike,
  request: boolean,
): Promise<boolean> {
  const options = { mode: 'readwrite' } as const

  if ((await handle.queryPermission?.(options)) === 'granted') return true
  if (!request) return false

  return (await handle.requestPermission?.(options)) === 'granted'
}

class FileHandleStore implements WorkbookFileStore {
  readonly name: string

  private readonly handle: FileSystemFileHandleLike
  private readonly writable: boolean

  constructor(handle: FileSystemFileHandleLike, writable: boolean) {
    this.handle = handle
    this.name = handle.name
    this.writable = writable
  }

  get canWrite(): boolean {
    return this.writable
  }

  async read(): Promise<ArrayBuffer> {
    const file = await this.handle.getFile()
    return file.arrayBuffer()
  }

  async write(data: ArrayBuffer): Promise<void> {
    const writable = await this.handle.createWritable()
    await writable.write(data)
    await writable.close()
  }
}

/** Prompts for a workbook and remembers the choice. */
export async function chooseWorkbookFile(): Promise<WorkbookFileStore> {
  const showOpenFilePicker = picker().showOpenFilePicker

  if (showOpenFilePicker === undefined) {
    throw new DataSourceUnavailableError(
      'This browser cannot open a file directly. Use Microsoft Edge or Google Chrome to connect the workbook.',
    )
  }

  const [handle] = await showOpenFilePicker({ multiple: false, types: [EXCEL_FILE_TYPE] })
  if (handle === undefined) {
    throw new DataSourceUnavailableError('No workbook was selected.')
  }

  const writable = await hasWritePermission(handle, true)
  await rememberHandle(handle)

  return new FileHandleStore(handle, writable)
}

/**
 * Reconnects to the previously chosen workbook.
 *
 * `requestPermission` is only attempted when `interactive` is set, because
 * browsers reject a permission prompt that was not triggered by a click. On
 * startup this therefore returns `null` when permission has lapsed, and the
 * UI offers a button that calls it again interactively.
 */
export async function restoreWorkbookFile(interactive: boolean): Promise<WorkbookFileStore | null> {
  const handle = await readStoredHandle()
  if (handle === null) return null

  if (!(await hasWritePermission(handle, interactive))) return null

  return new FileHandleStore(handle, true)
}

/** Whether a workbook was chosen previously, regardless of permission state. */
export async function hasRememberedWorkbook(): Promise<boolean> {
  return (await readStoredHandle()) !== null
}

/**
 * Creates a new workbook on disk and connects to it.
 *
 * Offered because the alternative — telling somebody to build seven sheets
 * with exact column names by hand — is slow and easy to get wrong.
 */
export async function createWorkbookFile(
  build: () => Promise<ArrayBuffer>,
  suggestedName: string,
): Promise<WorkbookFileStore> {
  const showSaveFilePicker = picker().showSaveFilePicker

  if (showSaveFilePicker === undefined) {
    throw new DataSourceUnavailableError(
      'This browser cannot create a file directly. Use Microsoft Edge or Google Chrome.',
    )
  }

  const handle = await showSaveFilePicker({ suggestedName, types: [EXCEL_FILE_TYPE] })
  const store = new FileHandleStore(handle, true)

  await store.write(await build())
  await rememberHandle(handle)

  return store
}
