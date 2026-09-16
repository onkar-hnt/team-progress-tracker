import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'

import { useAuth } from '@app/providers/auth-context'
import type { AppNotification, NotificationType } from '@models/index'
import {
  NOTIFICATION_PAGE_SIZE,
  areNotificationsAvailable,
  countUnreadNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  readMutedNotificationTypes,
  saveMutedNotificationTypes,
  subscribeToNotifications,
} from '@services/notifications/notification.service'

import { queryKeys } from './query-keys'

function useNotificationAudience(): { isReady: boolean; scopeId: string } {
  const { isRestoring, user } = useAuth()

  return {
    isReady: !isRestoring && user !== null && areNotificationsAvailable(),
    scopeId: user?.email ?? 'none',
  }
}

export interface NotificationInbox {
  notifications: readonly AppNotification[]

  isPending: boolean
  error: Error | null
  refetch: () => void

  loadMore: (() => void) | null

  isLoadingMore: boolean
}

/** Growing page size in the query key keeps previous rows visible while loading more. */
export function useNotifications(): NotificationInbox {
  const { isReady, scopeId } = useNotificationAudience()
  const [limit, setLimit] = useState(NOTIFICATION_PAGE_SIZE)

  const query = useQuery({
    queryKey: queryKeys.notifications(scopeId, limit),
    queryFn: () => listNotifications(limit),
    enabled: isReady,
    placeholderData: keepPreviousData,
  })

  return {
    notifications: query.data?.notifications ?? [],
    isPending: query.isPending,
    error: query.error,

    refetch: () => {
      void query.refetch()
    },

    loadMore:
      query.data?.hasMore === true
        ? () => {
            setLimit((current) => current + NOTIFICATION_PAGE_SIZE)
          }
        : null,

    isLoadingMore: query.isPlaceholderData,
  }
}

export function useUnreadNotificationCount(): UseQueryResult<number> {
  const { isReady, scopeId } = useNotificationAudience()

  return useQuery({
    queryKey: queryKeys.unreadNotificationCount(scopeId),
    queryFn: countUnreadNotifications,
    enabled: isReady,
  })
}

function useInvalidateNotifications(): () => Promise<void> {
  const queryClient = useQueryClient()

  return useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.allNotifications() })
  }, [queryClient])
}

export function useMarkNotificationRead(): UseMutationResult<void, Error, string> {
  const invalidate = useInvalidateNotifications()

  return useMutation({ mutationFn: markNotificationRead, onSuccess: invalidate })
}

export function useMarkAllNotificationsRead(): UseMutationResult<void, Error, void> {
  const invalidate = useInvalidateNotifications()

  return useMutation({ mutationFn: markAllNotificationsRead, onSuccess: invalidate })
}

export function useMutedNotificationTypes(): UseQueryResult<NotificationType[]> {
  const { isReady, scopeId } = useNotificationAudience()

  return useQuery({
    queryKey: queryKeys.notificationPreferences(scopeId),
    queryFn: readMutedNotificationTypes,
    enabled: isReady,
  })
}

/** Optimistic preference toggles; cancelQueries prevents stale reads undoing them. */
export function useSaveMutedNotificationTypes(): UseMutationResult<
  void,
  Error,
  readonly NotificationType[],
  { previous: NotificationType[] | undefined }
> {
  const queryClient = useQueryClient()
  const { scopeId } = useNotificationAudience()
  const queryKey = queryKeys.notificationPreferences(scopeId)

  return useMutation({
    mutationFn: saveMutedNotificationTypes,

    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey })

      const previous = queryClient.getQueryData<NotificationType[]>(queryKey)

      queryClient.setQueryData<NotificationType[]>(queryKey, [...next])

      return { previous }
    },

    onError: (_error, _next, context) => {
      queryClient.setQueryData(queryKey, context?.previous)
    },

    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey })
    },
  })
}

export function useNotificationRealtime(): void {
  const { isReady } = useNotificationAudience()
  const invalidate = useInvalidateNotifications()

  useEffect(() => {
    if (!isReady) return

    return subscribeToNotifications(() => {
      void invalidate()
    })
  }, [invalidate, isReady])
}
