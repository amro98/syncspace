import type { Notification, NotificationFilter, NotificationPage } from '@syncspace/shared'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import type { ApiError } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'

import * as api from './api'
import { type InboxData, markAllRead, prependNotification, replaceNotification } from './cache'

const FILTERS: NotificationFilter[] = ['all', 'unread']

export const inboxKey = (filter: NotificationFilter) => queryKeys.notifications.list({ filter })

export function useNotifications(filter: NotificationFilter, enabled: boolean) {
  return useInfiniteQuery<
    NotificationPage,
    ApiError,
    InboxData,
    ReturnType<typeof inboxKey>,
    string | undefined
  >({
    queryKey: inboxKey(filter),
    queryFn: ({ pageParam, signal }) => api.fetchNotifications(filter, pageParam, signal),
    initialPageParam: undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled,
  })
}

/** The bell badge. Kept current by realtime events; never derived from loaded pages. */
export function useUnreadCount() {
  return useQuery({
    queryKey: queryKeys.notifications.unreadCount(),
    queryFn: ({ signal }) => api.fetchUnreadCount(signal),
    staleTime: 5 * 60_000,
  })
}

/** Cache writers shared by mutations and the realtime handlers. */
export function useInboxWriters() {
  const queryClient = useQueryClient()
  const setCount = useCallback(
    (count: number) => {
      queryClient.setQueryData(queryKeys.notifications.unreadCount(), count)
    },
    [queryClient],
  )
  const added = useCallback(
    (notification: Notification, unreadCount: number) => {
      for (const filter of FILTERS) {
        queryClient.setQueryData<InboxData>(inboxKey(filter), (data) =>
          prependNotification(data, notification),
        )
      }
      setCount(unreadCount)
    },
    [queryClient, setCount],
  )
  const changed = useCallback(
    (notification: Notification, unreadCount: number) => {
      for (const filter of FILTERS) {
        queryClient.setQueryData<InboxData>(inboxKey(filter), (data) =>
          replaceNotification(data, notification),
        )
      }
      setCount(unreadCount)
    },
    [queryClient, setCount],
  )
  const allRead = useCallback(
    (readAt: string) => {
      for (const filter of FILTERS) {
        queryClient.setQueryData<InboxData>(inboxKey(filter), (data) => markAllRead(data, readAt))
      }
      setCount(0)
    },
    [queryClient, setCount],
  )
  return { added, changed, allRead }
}

export function useMarkNotification() {
  const queryClient = useQueryClient()
  const { changed } = useInboxWriters()
  return useMutation({
    mutationFn: ({ id, read }: { id: string; read: boolean }) => api.markNotification(id, read),
    onSuccess: (notification) => {
      const current = queryClient.getQueryData<number>(queryKeys.notifications.unreadCount()) ?? 0
      // The realtime event carries the authoritative count; this keeps the badge right meanwhile.
      changed(notification, Math.max(0, current + (notification.readAt ? -1 : 1)))
    },
  })
}

export function useMarkAllRead() {
  const { allRead } = useInboxWriters()
  return useMutation({
    mutationFn: api.markAllNotificationsRead,
    onSuccess: ({ readAt }) => {
      allRead(readAt)
    },
  })
}
