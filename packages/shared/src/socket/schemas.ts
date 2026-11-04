import { z } from 'zod'

import { PRESENCE_STATUSES } from '../constants/presence'
import { readCursorSchema } from '../schemas/read-state'
import {
  channelSchema,
  conversationSchema,
  destinationSchema,
  messageSchema,
  reactionSummarySchema,
} from '../schemas/chat'
import { idSchema, isoDateTimeSchema } from '../schemas/common'
import { notificationSchema } from '../schemas/notifications'
import {
  boardSchema,
  columnSchema,
  taskLabelSchema,
  taskPlacementSchema,
  taskSchema,
} from '../schemas/tasks'

// ---------------------------------------------------------------------------
// Client -> server payloads. The server validates every inbound payload with
// these schemas; socket input is untrusted exactly like HTTP input.
// ---------------------------------------------------------------------------

export const workspaceRoomPayloadSchema = z.object({
  workspaceId: idSchema,
})

export const channelRoomPayloadSchema = z.object({
  workspaceId: idSchema,
  channelId: idSchema,
})

export const conversationRoomPayloadSchema = z.object({
  workspaceId: idSchema,
  conversationId: idSchema,
})

/** typing:start / typing:stop — only accepted from sockets in the destination's room. */
export const typingPayloadSchema = z.object({
  destination: destinationSchema,
})

// ---------------------------------------------------------------------------
// Server -> client payloads. Entity events carry the committed DTO so clients
// write it straight into the TanStack Query cache (no refetch).
// ---------------------------------------------------------------------------

export const workspaceUpdatedPayloadSchema = z.object({
  workspaceId: idSchema,
})

/** channel:created / channel:updated (rename, description, archive, access granted). */
export const channelEventPayloadSchema = z.object({
  channel: channelSchema,
})

/** The receiving user lost access to a channel (removed from a private channel). */
export const channelRemovedPayloadSchema = z.object({
  workspaceId: idSchema,
  channelId: idSchema,
})

export const messageCreatedPayloadSchema = z.object({
  message: messageSchema,
  /** Echo of the sender's optimistic id, so the sender replaces instead of duplicating. */
  clientMessageId: z.uuid().nullable(),
  /** For thread replies: the parent's new reply count. */
  parent: z.object({ id: idSchema, replyCount: z.number().int().nonnegative() }).nullable(),
})

/** message:updated / message:deleted carry the full (possibly redacted) message. */
export const messageEventPayloadSchema = z.object({
  message: messageSchema,
})

export const reactionUpdatedPayloadSchema = z.object({
  messageId: idSchema,
  destination: destinationSchema,
  parentMessageId: idSchema.nullable(),
  reactions: z.array(reactionSummarySchema),
})

export const typingUpdatedPayloadSchema = z.object({
  destination: destinationSchema,
  /** Everyone currently typing there (clients drop themselves). */
  userIds: z.array(idSchema),
})

export const presenceUpdatedPayloadSchema = z.object({
  userId: idSchema,
  status: z.enum(PRESENCE_STATUSES),
  /** Now (online) or when the last connection closed (offline). */
  lastActiveAt: isoDateTimeSchema,
})

export const conversationEventPayloadSchema = z.object({
  conversation: conversationSchema,
})

/** The receiving user's read cursor moved (keeps their other tabs in sync). */
export const readUpdatedPayloadSchema = z.object({
  destination: destinationSchema,
  cursor: readCursorSchema,
})

// Boards & tasks (workspace room) ------------------------------------------------

export const boardEventPayloadSchema = z.object({ board: boardSchema })

/** The board's full, ordered column list (small; replaces the client's copy). */
export const columnsUpdatedPayloadSchema = z.object({
  workspaceId: idSchema,
  boardId: idSchema,
  columns: z.array(columnSchema),
})

export const taskEventPayloadSchema = z.object({ task: taskSchema })

/** Compact move: new placements only (one task, or a whole column after a rebalance). */
export const taskMovedPayloadSchema = z.object({
  workspaceId: idSchema,
  boardId: idSchema,
  placements: z.array(taskPlacementSchema),
})

/** The workspace's full label list (labels are few). Deleted labels vanish from tasks. */
export const labelsUpdatedPayloadSchema = z.object({
  workspaceId: idSchema,
  labels: z.array(taskLabelSchema),
})

// Notifications (user room) ---------------------------------------------------------

export const notificationEventPayloadSchema = z.object({
  notification: notificationSchema,
  unreadCount: z.number().int().min(0),
})

export const notificationsReadPayloadSchema = z.object({
  readAt: isoDateTimeSchema,
  unreadCount: z.number().int().min(0),
})
