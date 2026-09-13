import { useRef, useState } from 'react'

import { useConfirm } from '@app/providers/confirm-context'
import { useSnackbar } from '@app/providers/snackbar-context'
import { Button } from '@components/ui/button/Button'
import { ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import {
  ACCEPTED_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  areAttachmentsAvailable,
  createAttachmentUrl,
} from '@services/attachments/attachment.service'
import type { Attachment, AttachmentOwner } from '@services/attachments/attachment.service'
import { useAttachments, useDeleteAttachment, useUploadAttachment } from '@hooks/use-attachments'
import { formatBytes } from '@utils/bytes.utils'
import { formatShortDate } from '@utils/date.utils'

import './AttachmentPanel.scss'

interface AttachmentPanelProps {
  owner: AttachmentOwner
  /** `null` while the record does not exist yet, which is how a create form arrives here. */
  recordId: string | null

  /** What the files are for, in one line. Different for a task and for a day's work. */
  hint: string

  /**
   * How to get back here once the record exists, for the create case.
   *
   * Needed because "save this first" is only half an instruction: the panel cannot say
   * which button reopens the record, since that is the screen's business and differs
   * between a task in a table and a day's entry in a list. Without it somebody reads
   * that files are possible and is left looking for where.
   */
  reopenWith?: string
}

/**
 * The files on a record, with a way to add one and remove one.
 *
 * Generic over the three kinds of record that can carry files, because the panel has no
 * reason to differ between them: a specification on a task and a screenshot on a day's
 * work are the same interaction. Only the sentence above it changes.
 *
 * ## Nothing at all under the other data sources
 *
 * Not a disabled button and not an explanation. A workbook has nowhere to put a file, and
 * a panel saying so on every task would be a permanent apology on a screen somebody uses
 * daily. The feature is either there or it is not mentioned.
 */
export function AttachmentPanel({ hint, owner, recordId, reopenWith }: AttachmentPanelProps) {
  const confirm = useConfirm()
  const snackbar = useSnackbar()
  const inputRef = useRef<HTMLInputElement>(null)

  const attachmentsQuery = useAttachments(owner, recordId)
  const upload = useUploadAttachment(owner, recordId)
  const remove = useDeleteAttachment(owner, recordId)

  /** Which file is being fetched a url for, so only its own row says so. */
  const [opening, setOpening] = useState<string | null>(null)

  if (!areAttachmentsAvailable()) return null

  const files = attachmentsQuery.data ?? []

  const choose = () => {
    inputRef.current?.click()
  }

  const handleChosen = async (file: File | undefined) => {
    // Cleared before the upload rather than after, so choosing the same file twice in a
    // row still fires a change event the second time.
    if (inputRef.current !== null) inputRef.current.value = ''

    if (file === undefined || recordId === null) return

    await upload.mutateAsync(file).then(
      () => {
        snackbar.success(`${file.name} was attached.`)
      },
      () => {
        // Reported by the mutation's own handler. Swallowed here so a refused file does
        // not surface as an unhandled rejection.
      },
    )
  }

  /**
   * Opens the file in a new tab.
   *
   * The url is asked for at the moment of the click and expires a minute later, so it
   * cannot be held in the row as an `href`. Which means this is a button that behaves
   * like a link, and `rel="noreferrer"` on the window it opens is the part that matters:
   * without it the signed url would be sent as the referrer of whatever loads next.
   */
  const open = async (attachment: Attachment) => {
    setOpening(attachment.id)

    try {
      const url = await createAttachmentUrl(attachment)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      snackbar.error(
        error instanceof Error ? error.message : 'That file could not be opened. Please try again.',
      )
    } finally {
      setOpening(null)
    }
  }

  const requestRemove = async (attachment: Attachment) => {
    const isRemoved = await confirm({
      title: 'Remove this file?',
      // Said plainly, because it is the exception. Everything else deleted in this
      // application goes to Recently deleted; a file does not, and somebody who has
      // learned that deleting is recoverable here would reasonably assume this is too.
      message: `${attachment.fileName} will be deleted permanently. Unlike a deleted record, a file does not go to Recently deleted and cannot be restored.`,
      confirmLabel: 'Remove file',
      isDestructive: true,
      action: () => remove.mutateAsync(attachment),
    })

    if (isRemoved) snackbar.success('The file was removed.')
  }

  return (
    <section className="attachments">
      <header className="attachments__header">
        <div>
          <h3 className="attachments__title">Files</h3>
          <p className="attachments__hint">{hint}</p>
        </div>

        {recordId === null ? null : (
          <Button
            isLoading={upload.isPending}
            onClick={choose}
            size="small"
            type="button"
            variant="secondary"
          >
            {upload.isPending ? 'Attaching…' : 'Attach a file'}
          </Button>
        )}
      </header>

      {/* Hidden rather than styled, so the control that opens the file picker is the
          same Button component as every other action in the application. */}
      <input
        accept={ACCEPTED_ATTACHMENT_TYPES.join(',')}
        className="attachments__input"
        onChange={(event) => {
          void handleChosen(event.target.files?.[0])
        }}
        ref={inputRef}
        tabIndex={-1}
        type="file"
      />

      {recordId === null ? (
        <p className="attachments__empty">
          {reopenWith === undefined
            ? 'Save this first, and then files can be attached to it.'
            : `Save this first. Then ${reopenWith} to attach a file.`}
        </p>
      ) : attachmentsQuery.error !== null ? (
        <ErrorState
          message={`The files could not be loaded: ${attachmentsQuery.error.message}`}
          onRetry={() => void attachmentsQuery.refetch()}
        />
      ) : attachmentsQuery.isPending ? (
        <Skeleton rows={2} />
      ) : files.length === 0 ? (
        <p className="attachments__empty">
          Nothing attached yet. Up to {formatBytes(MAX_ATTACHMENT_BYTES)} per file — images, PDFs,
          text, CSV and Office documents.
        </p>
      ) : (
        <ul className="attachments__list">
          {files.map((attachment) => (
            <li className="attachments__item" key={attachment.id}>
              <div className="attachments__file">
                <p className="attachments__name">{attachment.fileName}</p>
                <p className="attachments__meta">
                  {formatBytes(attachment.sizeBytes)}
                  {` · ${formatShortDate(attachment.createdAt.slice(0, 10))}`}
                </p>
              </div>

              <div className="row-actions">
                <Button
                  isLoading={opening === attachment.id}
                  onClick={() => void open(attachment)}
                  size="small"
                  type="button"
                  variant="ghost"
                >
                  {opening === attachment.id ? 'Opening…' : 'Open'}
                </Button>

                <Button
                  onClick={() => void requestRemove(attachment)}
                  size="small"
                  type="button"
                  variant="danger"
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
