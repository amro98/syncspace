import type { InfiniteData } from '@tanstack/react-query'
import type { Notification, NotificationPage } from '@syncspace/shared'

export type InboxData = InfiniteData<NotificationPage, string | undefined>

/** Prepends a new notification to the first page (deduplicated by id). */
export function prependNotification(data: InboxData | undefined, notification: Notification) {
  if (!data) return data
  const exists = data.pages.some((page) => page.items.some((item) => item.id === notification.id))
  if (exists) return replaceNotification(data, notification)
  const [first, ...rest] = data.pages
  if (!first) return data
  return { ...data, pages: [{ ...first, items: [notification, ...first.items] }, ...rest] }
}

export function replaceNotification(data: InboxData | undefined, notification: Notification) {
  if (!data) return data
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((item) => (item.id === notification.id ? notification : item)),
    })),
  }
}

export function markAllRead(data: InboxData | undefined, readAt: string) {
  if (!data) return data
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      unreadCount: 0,
      items: page.items.map((item) => (item.readAt ? item : { ...item, readAt })),
    })),
  }
}

export function flattenInbox(data: InboxData | undefined): Notification[] {
  return data?.pages.flatMap((page) => page.items) ?? []
}
