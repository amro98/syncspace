import { z } from 'zod'

import { LIMITS } from '../constants/domain'
import { idSchema, isoDateTimeSchema } from './common'

/**
 * Read state: one cursor per user per channel/conversation. Every message with
 * `createdAt <= lastReadAt` is read. `lastReadMessageId` is the message the
 * cursor sits on (for "jump to unread" and the "new messages" divider); it is
 * null if that message was deleted, while `lastReadAt` keeps the position.
 */
export const readCursorSchema = z.object({
  lastReadAt: isoDateTimeSchema,
  lastReadMessageId: idSchema.nullable(),
})

/** Body of a future "mark as read" request: move the cursor up to and including this message. */
export const markReadInputSchema = z.object({
  messageId: idSchema,
})

/**
 * Unread state of one destination. Counts are capped at LIMITS.UNREAD_COUNT_CAP
 * (the client shows "99+"), so the server never counts a whole history.
 * `cursor` is null when the user has never read the destination.
 */
export const destinationUnreadSchema = z.object({
  unreadCount: z.number().int().min(0).max(LIMITS.UNREAD_COUNT_CAP),
  cursor: readCursorSchema.nullable(),
})

/** Sidebar badges for one workspace. */
export const unreadSummarySchema = z.object({
  channels: z.array(destinationUnreadSchema.extend({ channelId: idSchema })),
  conversations: z.array(destinationUnreadSchema.extend({ conversationId: idSchema })),
})
