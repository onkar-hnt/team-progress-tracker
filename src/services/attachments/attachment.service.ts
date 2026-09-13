import { z } from 'zod'

import { appConfig } from '@config/app.config'
import { DataProviderError, DataSourceUnavailableError } from '@services/data-provider/index'
import { getSupabaseClient, isSupabaseConfigured } from '@services/supabase/index'

/**
 * Files attached to a piece of work.
 *
 * ## Two writes, in this order
 *
 * The row goes in first and the file second. It looks backwards — the row describes an
 * object that does not exist yet — and it is what makes the bucket's policies a single
 * line each: an object is readable, and writable, exactly when a row for it is, so the
 * whole question of who may see a file is answered once, by `attachments_select`.
 *
 * The cost is that a failed upload leaves a row pointing at nothing, so the row is
 * deleted again when the upload fails. If even that fails the row survives, and the
 * screen shows an attachment that will not open — which is the honest state of affairs
 * and recoverable by deleting it, rather than a file nobody can see or account for.
 *
 * Removing goes the other way round: row first, then object. It has to, because the
 * delete policy on the bucket permits removing an object that has no row — that being
 * exactly what an abandoned upload is.
 *
 * ## Why not through `DataProvider`
 *
 * The fourth feature to sit outside it, and the clearest case: a workbook has nowhere
 * to put a file. It is Supabase or nothing, said once in `areAttachmentsAvailable` and
 * shown to the person as an absent panel rather than an upload button that fails.
 */

export function areAttachmentsAvailable(): boolean {
  return appConfig.dataSource === 'supabase' && isSupabaseConfigured()
}

const BUCKET = 'attachments'

/** Must match `attachments.table_name`'s check constraint. */
export type AttachmentOwner = 'daily_updates' | 'feedback' | 'tasks'

export interface Attachment {
  id: string
  fileName: string
  sizeBytes: number
  createdAt: string

  /** Absent when the file predates the uploader being recorded, or the login is gone. */
  uploadedByProfileId?: string

  contentType?: string

  /** Where the object lives. Needed to sign a url for it, and to remove it. */
  storagePath: string
}

/**
 * 10 MB, the same number the bucket enforces.
 *
 * Repeated here so the refusal happens before a slow upload rather than at the end of
 * one. The bucket is what makes it a rule; this only makes it a civil rule.
 */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

/**
 * What the bucket accepts, in the form a file input wants.
 *
 * The same list as `allowed_mime_types`, and again the browser copy is a courtesy: the
 * service refuses anything else whatever the input offered.
 */
export const ACCEPTED_ATTACHMENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/json',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const

function requireClient() {
  if (!areAttachmentsAvailable()) {
    throw new DataSourceUnavailableError(
      'Attachments need the Supabase data source, which is not configured.',
    )
  }

  return getSupabaseClient()
}

const MISSING_TABLE_CODES: ReadonlySet<string> = new Set(['42P01', 'PGRST205'])

function mapAttachmentError(error: { code: string; message: string }, fallback: string) {
  if (MISSING_TABLE_CODES.has(error.code)) {
    return new DataSourceUnavailableError(
      'Attachments are not set up in this database yet. Apply supabase/migrations/20260913234500_attachments.sql, then reload.',
      { cause: error },
    )
  }

  // Raised by `stamp_attachment_subject` when the record named does not exist, and by
  // the policies when it exists but is not the caller's to touch. Both read as the
  // same thing from here, and the wording covers both without guessing which.
  //
  // `DataProviderError` rather than one of its subclasses, here and for the refusals in
  // `uploadAttachment`: `toUserMessage` passes the base class's message through, which
  // is what these are — sentences written for whoever pressed the button.
  if (error.code === '23503' || error.code === '42501') {
    return new DataProviderError(
      'That record could not be found, or is not yours to attach a file to.',
      { cause: error },
    )
  }

  return new DataProviderError(fallback, { cause: error })
}

const ATTACHMENT_COLUMNS =
  'id, file_name, content_type, size_bytes, storage_path, uploaded_by, created_at' as const

const attachmentRowSchema = z.object({
  id: z.string().min(1),
  file_name: z.string().min(1),
  content_type: z.string().nullable(),
  size_bytes: z.number(),
  storage_path: z.string().min(1),
  uploaded_by: z.string().nullable(),
  created_at: z.string().min(1),
})

function toAttachment(row: z.infer<typeof attachmentRowSchema>): Attachment {
  return {
    id: row.id,
    fileName: row.file_name,
    sizeBytes: row.size_bytes,
    storagePath: row.storage_path,
    createdAt: row.created_at,
    ...(row.content_type === null ? {} : { contentType: row.content_type }),
    ...(row.uploaded_by === null ? {} : { uploadedByProfileId: row.uploaded_by }),
  }
}

/** Newest last, so a set of files reads in the order it was added. */
export async function listAttachments(
  owner: AttachmentOwner,
  recordId: string,
): Promise<Attachment[]> {
  const { data, error } = await requireClient()
    .from('attachments')
    .select(ATTACHMENT_COLUMNS)
    .eq('table_name', owner)
    .eq('record_id', recordId)
    .order('created_at', { ascending: true })

  if (error !== null) throw mapAttachmentError(error, 'The attachments could not be read.')

  const parsed = z.array(attachmentRowSchema).safeParse(data ?? [])

  if (!parsed.success) {
    throw new DataProviderError(
      'An attachment could not be read. The database schema may be ahead of this build.',
      { cause: parsed.error },
    )
  }

  return parsed.data.map(toAttachment)
}

/**
 * A name an object store can hold, and a person can still recognise.
 *
 * Kept ASCII and punctuation-free, because the path is also the object's key: a name
 * with a slash in it would invent a folder, and one with a `#` would truncate a signed
 * url. The original name is stored in the row, which is what the download is called,
 * so nothing legible is lost by flattening the copy in the path.
 */
function toStorageName(fileName: string): string {
  const flattened = fileName
    .normalize('NFKD')
    .replace(/[^\w.\- ]/gu, '')
    .replace(/\s+/gu, '-')
    .replace(/-+/gu, '-')
    .toLowerCase()

  return flattened === '' || flattened === '.' ? 'file' : flattened.slice(-80)
}

/**
 * Attaches one file to one record.
 *
 * The two checks here are the two the bucket also makes. They are worth making twice:
 * refusing a 40 MB video before it is uploaded is the difference between an immediate
 * answer and a minute of progress bar followed by one.
 */
export async function uploadAttachment(
  owner: AttachmentOwner,
  recordId: string,
  file: File,
): Promise<Attachment> {
  if (file.size === 0) {
    throw new DataProviderError('That file is empty.')
  }

  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new DataProviderError(
      `That file is ${formatBytes(file.size)}, and the limit is ${formatBytes(MAX_ATTACHMENT_BYTES)}.`,
    )
  }

  if (!(ACCEPTED_ATTACHMENT_TYPES as readonly string[]).includes(file.type)) {
    throw new DataProviderError(
      'That kind of file cannot be attached. Images, PDFs, text, CSV and Office documents can be.',
    )
  }

  const client = requireClient()

  // `crypto.randomUUID` needs a secure context, which the deployed application always
  // has; the fallback keeps plain-http development working, as it does for entry ids.
  const unique =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

  const storagePath = `${owner}/${recordId}/${unique}-${toStorageName(file.name)}`

  const { data, error } = await client
    .from('attachments')
    .insert({
      table_name: owner,
      record_id: recordId,
      storage_path: storagePath,
      file_name: file.name.slice(0, 200),
      content_type: file.type,
      size_bytes: file.size,
    })
    .select(ATTACHMENT_COLUMNS)
    .single()

  if (error !== null) throw mapAttachmentError(error, 'The file could not be attached.')

  const parsed = attachmentRowSchema.safeParse(data)

  if (!parsed.success) {
    throw new DataProviderError('The attachment was saved but could not be read back.', {
      cause: parsed.error,
    })
  }

  const upload = await client.storage.from(BUCKET).upload(storagePath, file, {
    contentType: file.type,
    // No overwrite. The path carries a fresh uuid, so a collision would mean something
    // is wrong rather than that a file should be replaced.
    upsert: false,
  })

  if (upload.error !== null) {
    // The row would otherwise describe a file that does not exist. Deleted rather than
    // left for a cleanup job, because the row is the only thing that makes the object
    // reachable and the pair is worthless without it.
    await client.from('attachments').delete().eq('id', parsed.data.id)

    throw new DataProviderError(`The file could not be uploaded: ${upload.error.message}`, {
      cause: upload.error,
    })
  }

  return toAttachment(parsed.data)
}

/**
 * A url that opens the file, and stops working shortly afterwards.
 *
 * Signed rather than public, and signed on demand rather than stored: the link is for
 * the click that asked for it. Sixty seconds is enough for a browser to follow it and
 * not enough for it to be usefully forwarded.
 *
 * Authorization happens at signing, against the caller — which is `attachments_select`
 * reaching the object through the row, as the migration lays out.
 */
export async function createAttachmentUrl(attachment: Attachment): Promise<string> {
  const { data, error } = await requireClient()
    .storage.from(BUCKET)
    .createSignedUrl(attachment.storagePath, 60, { download: attachment.fileName })

  if (error !== null) {
    throw new DataProviderError(`That file could not be opened: ${error.message}`, { cause: error })
  }

  return data.signedUrl
}

/**
 * Removes a file, and it does not come back.
 *
 * The one delete in the application with no bin behind it. A record set aside can be
 * restored because the row is still there; an object removed from the bucket is gone,
 * and pretending otherwise would be the misleading part. The confirmation in the UI
 * says so.
 *
 * Row first, then object, which is the order the bucket's delete policy requires:
 * `attachments_delete` decides whether this is allowed, and the object becomes
 * removable precisely because its row no longer exists.
 */
export async function deleteAttachment(attachment: Attachment): Promise<void> {
  const client = requireClient()

  const { error } = await client.from('attachments').delete().eq('id', attachment.id)

  if (error !== null) {
    throw mapAttachmentError(
      error,
      'That file could not be removed. Only whoever uploaded it, or an administrator, can.',
    )
  }

  const removal = await client.storage.from(BUCKET).remove([attachment.storagePath])

  if (removal.error !== null) {
    // The row is already gone, so the file is unreachable and no longer listed. Worth
    // reporting rather than swallowing — somebody should know the object is still
    // occupying space — but not worth failing the action that has already happened.
    console.warn('The attachment row was deleted but its file remains.', removal.error)
  }
}

/** Bytes as somebody would say them: "4 KB", "1.2 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`
  if (bytes < 1024 * 1024) return `${String(Math.round(bytes / 1024))} KB`

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
