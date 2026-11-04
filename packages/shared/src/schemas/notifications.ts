import { z } from 'zod'

import { destinationSchema, publicUserSchema } from './chat'
import { idSchema, isoDateTimeSchema } from './common'
import { notificationEntityTypeSchema, notificationTypeSchema } from './domain'

/**
 * Where a notification leads, resolved by the server when the notification is
 * read (so it reflects moves). `null` when the target no longer exists.
 */
export const notificationLinkSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('task'), workspaceId: idSchema, boardId: idSchema, taskId: idSchema }),
  z.object({
    kind: z.literal('message'),
    workspaceId: idSchema,
    destination: destinationSchema,
    messageId: idSchema,
    /** The thread to open (the parent for replies, the message itself otherwise). */
    threadId: idSchema,
  }),
  z.object({
    kind: z.literal('destination'),
    workspaceId: idSchema,
    destination: destinationSchema,
  }),
  z.object({ kind: z.literal('workspace'), workspaceId: idSchema }),
])

export const notificationSchema = z.object({
  id: idSchema,
  type: notificationTypeSchema,
  title: z.string(),
  body: z.string().nullable(),
  workspace: z.object({ id: idSchema, name: z.string() }).nullable(),
  actor: publicUserSchema.nullable(),
  entityType: notificationEntityTypeSchema.nullable(),
  entityId: idSchema.nullable(),
  link: notificationLinkSchema.nullable(),
  readAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
})

export const NOTIFICATION_FILTERS = ['all', 'unread'] as const

export const notificationListQuerySchema = z.object({
  filter: z.enum(NOTIFICATION_FILTERS).default('all'),
  cursor: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export const notificationPageSchema = z.object({
  items: z.array(notificationSchema),
  nextCursor: z.string().nullable(),
  unreadCount: z.number().int().min(0),
})

export const notificationUnreadCountSchema = z.object({ unreadCount: z.number().int().min(0) })

export const markNotificationInputSchema = z
  .object({
    /** false marks it unread again. */
    read: z.boolean().default(true),
  })
  .default({ read: true })
