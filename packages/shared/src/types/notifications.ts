import type { z } from 'zod'

import type {
  NOTIFICATION_FILTERS,
  notificationLinkSchema,
  notificationPageSchema,
  notificationSchema,
} from '../schemas/notifications'

export type Notification = z.infer<typeof notificationSchema>
export type NotificationLink = z.infer<typeof notificationLinkSchema>
export type NotificationPage = z.infer<typeof notificationPageSchema>
export type NotificationFilter = (typeof NOTIFICATION_FILTERS)[number]
