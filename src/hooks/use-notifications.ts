import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'
import { useCallback, useEffect } from 'react'

import { useAuth } from '@app/providers/auth-context'
import type { AppNotification } from '@models/index'
import {
  areNotificationsAvailable,
  countUnreadNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeToNotifications,
} from '@services/notifications/notification.service'

import { queryKeys } from './query-keys'

/**
 * Notification hooks.
 *
 * Keyed by the signed-in address rather than by an access scope, unlike the
 * work-tracker hooks. A notification belongs to one account and is filtered by
 * the database against `auth.uid()`, so there is nothing here for a scope to
 * narrow — and resolving one would mean waiting on the mentor mapping before the
 * bell could draw.
 */

/** The cache identity, and the condition for asking at all. */
function useNotificationAudience(): { isReady: boolean; scopeId: string } {
  const { isRestoring, user } = useAuth()

  return {
    isReady: !isRestoring && user !== null && areNotificationsAvailable(),
    scopeId: user?.email ?? 'none',
  }
}

export function useNotifications(): UseQueryResult<AppNotification[]> {
  const { isReady, scopeId } = useNotificationAudience()

  return useQuery({
    queryKey: queryKeys.notifications(scopeId),
    queryFn: listNotifications,
    enabled: isReady,
  })
}

export function useUnreadNotificationCount(): UseQueryResult<number> {
  const { isReady, scopeId } = useNotificationAudience()

  return useQuery({
    queryKey: queryKeys.unreadNotificationCount(scopeId),
    queryFn: countUnreadNotifications,
    enabled: isReady,
  })
}

/**
 * Invalidates the panel and the badge together.
 *
 * One prefix covers both because the count's key is nested under the list's, so
 * neither can be refreshed without the other and the two cannot disagree.
 */
function useInvalidateNotifications(): () => Promise<void> {
  const queryClient = useQueryClient()

  // Stable, because the realtime hook depends on it: a fresh closure each render
  // would tear down and rebuild the websocket subscription on every render.
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

/**
 * Keeps the badge and panel current without polling.
 *
 * Realtime tells this hook only that something changed; the refetch goes through
 * the same query as the first load, so a row that arrives over the socket is
 * read, validated and shaped by exactly the same code as one that arrives over
 * HTTP. Pushing the payload straight into the cache would be one fewer request
 * and two representations of a notification.
 *
 * Mounted once, by the bell. If the socket never connects the feature degrades to
 * refetch-on-focus rather than breaking, which is why nothing here reports a
 * subscription failure to the user.
 */
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
