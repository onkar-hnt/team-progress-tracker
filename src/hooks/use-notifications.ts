import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'
import { useCallback, useEffect } from 'react'

import { useAuth } from '@app/providers/auth-context'
import type { AppNotification, NotificationType } from '@models/index'
import {
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
 * Which notification types the signed-in person has switched off.
 *
 * An empty array is the answer for anybody who has never changed anything, and
 * it means everything is delivered — so the checkboxes on the Settings screen
 * read this and show the inverse.
 */
export function useMutedNotificationTypes(): UseQueryResult<NotificationType[]> {
  const { isReady, scopeId } = useNotificationAudience()

  return useQuery({
    queryKey: queryKeys.notificationPreferences(scopeId),
    queryFn: readMutedNotificationTypes,
    enabled: isReady,
  })
}

/**
 * Saves the set, moving the tickbox before the round trip finishes.
 *
 * Optimistic, which is unusual in this codebase and deliberate here: these
 * controls save on change rather than behind a button, and a tickbox that waits
 * for a server before it moves reads as one that did not register the click. The
 * previous value is kept so a rejection puts it back, and the snackbar the
 * caller shows on failure is then describing a control that has already returned
 * to where it was.
 *
 * `cancelQueries` first, so an in-flight read of the old value cannot land after
 * the optimistic write and undo it.
 */
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

    // Whether it succeeded or not: on success to pick up anything the database
    // did to the value, on failure because the rollback above is a guess at
    // what is stored, and only a read knows.
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey })
    },
  })
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
