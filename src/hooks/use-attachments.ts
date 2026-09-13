import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'

import { useAuth } from '@app/providers/auth-context'
import { useSnackbar } from '@app/providers/snackbar-context'
import {
  areAttachmentsAvailable,
  deleteAttachment,
  listAttachments,
  uploadAttachment,
} from '@services/attachments/attachment.service'
import type { Attachment, AttachmentOwner } from '@services/attachments/attachment.service'
import { logFailure, toUserMessage } from '@services/errors/error-message'

import { queryKeys } from './query-keys'

/**
 * Files hanging off one record.
 *
 * Built like the accounts hooks rather than on the record-write wrapper, and for the
 * same reason they were: the only cache these writes touch is one list of files, so
 * borrowing the wrapper would refetch every roster and every list of work to express a
 * change none of them hold.
 *
 * Nothing here is scoped. `attachments_select` returns the files of work the caller may
 * see, which is the same test the record itself passed to be on screen at all.
 */

export function useAttachments(
  owner: AttachmentOwner,
  recordId: string | null,
): UseQueryResult<Attachment[]> {
  const { isRestoring, user } = useAuth()

  return useQuery({
    queryKey: queryKeys.attachments(owner, recordId ?? 'none'),
    queryFn: () => listAttachments(owner, recordId ?? ''),
    enabled: !isRestoring && user !== null && recordId !== null && areAttachmentsAvailable(),
  })
}

export function useUploadAttachment(
  owner: AttachmentOwner,
  recordId: string | null,
): UseMutationResult<Attachment, Error, File> {
  const queryClient = useQueryClient()
  const snackbar = useSnackbar()

  return useMutation({
    mutationFn: (file: File) => uploadAttachment(owner, recordId ?? '', file),

    onError: (error) => {
      logFailure('upload attachment', error)
      snackbar.error(toUserMessage(error, 'The file could not be attached. Please try again.'))
    },

    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.attachments(owner, recordId ?? 'none'),
      })
    },
  })
}

/**
 * Removing a file for good.
 *
 * Invalidated on settle rather than on success, like the account mutations: a rejection
 * here is often the server knowing something this cache does not — a file somebody else
 * removed — and leaving the row on screen beside an error about it is how a screen
 * starts lying.
 */
export function useDeleteAttachment(
  owner: AttachmentOwner,
  recordId: string | null,
): UseMutationResult<void, Error, Attachment> {
  const queryClient = useQueryClient()
  const snackbar = useSnackbar()

  return useMutation({
    mutationFn: (attachment: Attachment) => deleteAttachment(attachment),

    onError: (error) => {
      logFailure('delete attachment', error)
      snackbar.error(toUserMessage(error, 'The file could not be removed. Please try again.'))
    },

    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.attachments(owner, recordId ?? 'none'),
      })
    },
  })
}
