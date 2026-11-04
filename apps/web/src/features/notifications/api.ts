import {
  type NotificationFilter,
  notificationPageSchema,
  notificationSchema,
  notificationUnreadCountSchema,
  notificationsReadPayloadSchema,
} from '@syncspace/shared'

import { apiClient } from '@/lib/api-client'

export function fetchNotifications(
  filter: NotificationFilter,
  cursor: string | undefined,
  signal?: AbortSignal,
) {
  return apiClient.get('/notifications', {
    query: { filter, cursor, limit: 20 },
    schema: notificationPageSchema,
    ...(signal && { signal }),
  })
}

export async function fetchUnreadCount(signal?: AbortSignal) {
  const { unreadCount } = await apiClient.get('/notifications/unread-count', {
    schema: notificationUnreadCountSchema,
    ...(signal && { signal }),
  })
  return unreadCount
}

export function markNotification(notificationId: string, read: boolean) {
  return apiClient.post(`/notifications/${notificationId}/read`, {
    body: { read },
    schema: notificationSchema,
  })
}

export function markAllNotificationsRead() {
  return apiClient.post('/notifications/read-all', { schema: notificationsReadPayloadSchema })
}
