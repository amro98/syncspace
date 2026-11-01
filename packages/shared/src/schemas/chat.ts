import { z } from 'zod'

import { GROUP_CONVERSATION_MIN_OTHERS, LIMITS } from '../constants/domain'
import { cursorPageSchema, idSchema, isoDateTimeSchema } from './common'
import { channelTypeSchema, conversationTypeSchema, workspaceRoleSchema } from './domain'

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

/** Where a message lives. Every chat API and socket payload uses this shape. */
export const DESTINATION_KINDS = ['channel', 'conversation'] as const
export const destinationKindSchema = z.enum(DESTINATION_KINDS)
export const destinationSchema = z.object({
  kind: destinationKindSchema,
  id: idSchema,
})

/** The only user fields chat payloads ever carry. */
export const publicUserSchema = z.object({
  id: idSchema,
  name: z.string(),
  avatarUrl: z.string().nullable(),
})

/** Workspace member directory entry (member pickers, presence). Visible to workspace members only. */
export const workspaceMemberSchema = publicUserSchema.extend({
  email: z.string(),
  role: workspaceRoleSchema,
  online: z.boolean(),
  lastSeenAt: isoDateTimeSchema.nullable(),
})

export const workspaceMemberListResponseSchema = z.object({
  items: z.array(workspaceMemberSchema),
})

export const memberSearchQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
})

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

export const channelNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a channel name')
  .max(LIMITS.CHANNEL_NAME_MAX, `Use at most ${String(LIMITS.CHANNEL_NAME_MAX)} characters`)

export const channelDescriptionSchema = z
  .string()
  .trim()
  .max(
    LIMITS.CHANNEL_DESCRIPTION_MAX,
    `Use at most ${String(LIMITS.CHANNEL_DESCRIPTION_MAX)} characters`,
  )

export const createChannelInputSchema = z.object({
  name: channelNameSchema,
  description: channelDescriptionSchema.optional(),
  type: channelTypeSchema.default('PUBLIC'),
})

export const updateChannelInputSchema = z
  .object({
    name: channelNameSchema.optional(),
    /** Empty string or null clears the description. */
    description: channelDescriptionSchema.nullable().optional(),
  })
  .refine((value) => value.name !== undefined || value.description !== undefined, {
    message: 'Nothing to update',
  })

/** Viewer-independent channel data (safe to broadcast). */
export const channelSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  type: channelTypeSchema,
  archivedAt: isoDateTimeSchema.nullable(),
  createdById: idSchema.nullable(),
  /** Explicit members of a PRIVATE channel; null for PUBLIC (open to every workspace member). */
  memberCount: z.number().int().nonnegative().nullable(),
  createdAt: isoDateTimeSchema,
})

/** A channel as one viewer sees it in the sidebar. */
export const channelSummarySchema = channelSchema.extend({
  /** PUBLIC: always true. PRIVATE: has a ChannelMember row (admins may view without one). */
  isMember: z.boolean(),
  /** Capped at LIMITS.UNREAD_COUNT_CAP; clients render "99+". */
  unreadCount: z.number().int().min(0).max(LIMITS.UNREAD_COUNT_CAP),
  /** Effective read position: the read cursor, or when the viewer joined if never read. */
  lastReadAt: isoDateTimeSchema.nullable(),
  lastReadMessageId: idSchema.nullable(),
})

export const channelListResponseSchema = z.object({ items: z.array(channelSummarySchema) })

export const channelMemberSchema = publicUserSchema.extend({
  role: workspaceRoleSchema,
  joinedAt: isoDateTimeSchema,
})

export const channelMemberListResponseSchema = z.object({ items: z.array(channelMemberSchema) })

export const addChannelMemberInputSchema = z.object({ userId: idSchema })

// ---------------------------------------------------------------------------
// Conversations (DMs and groups)
// ---------------------------------------------------------------------------

export const conversationSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  type: conversationTypeSchema,
  name: z.string().nullable(),
  participants: z.array(publicUserSchema),
  createdAt: isoDateTimeSchema,
  /** Bumped by every new message: sidebar ordering. */
  lastActivityAt: isoDateTimeSchema,
})

export const conversationSummarySchema = conversationSchema.extend({
  unreadCount: z.number().int().min(0).max(LIMITS.UNREAD_COUNT_CAP),
  lastReadAt: isoDateTimeSchema.nullable(),
  lastReadMessageId: idSchema.nullable(),
})

export const conversationListResponseSchema = z.object({
  items: z.array(conversationSummarySchema),
})

export const createDirectConversationInputSchema = z.object({ targetUserId: idSchema })

export const createGroupConversationInputSchema = z.object({
  name: z.string().trim().max(LIMITS.CONVERSATION_NAME_MAX).optional(),
  participantIds: z
    .array(idSchema)
    .min(GROUP_CONVERSATION_MIN_OTHERS, 'Pick at least two people (or start a direct message)')
    .max(LIMITS.GROUP_CONVERSATION_MAX_PARTICIPANTS - 1, 'Too many participants')
    .refine((ids) => new Set(ids).size === ids.length, 'Participants must be unique'),
})

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export const messageContentSchema = z
  .string()
  .trim()
  .min(1, 'Message cannot be empty')
  .max(
    LIMITS.MESSAGE_CONTENT_MAX,
    `Messages are limited to ${String(LIMITS.MESSAGE_CONTENT_MAX)} characters`,
  )

/** Grouped reactions. `userIds` (not a per-viewer flag) keeps one payload valid for everyone. */
export const reactionSummarySchema = z.object({
  emoji: z.string(),
  count: z.number().int().positive(),
  userIds: z.array(idSchema),
})

export const attachmentSchema = z.object({
  id: idSchema,
  fileName: z.string(),
  mimeType: z.string(),
  size: z.number().int().nonnegative(),
  url: z.string(),
})

export const messageSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  destination: destinationSchema,
  parentMessageId: idSchema.nullable(),
  author: publicUserSchema,
  /** Empty for deleted messages (content is redacted on delete). */
  content: z.string(),
  createdAt: isoDateTimeSchema,
  editedAt: isoDateTimeSchema.nullable(),
  deletedAt: isoDateTimeSchema.nullable(),
  reactions: z.array(reactionSummarySchema),
  /** Non-deleted replies (top-level messages only). */
  replyCount: z.number().int().nonnegative(),
  attachments: z.array(attachmentSchema),
})

export const MESSAGE_PAGE_SIZE = 50

/** Timeline page: `items` oldest -> newest; `nextCursor` loads the page before it. */
export const messagePageSchema = cursorPageSchema(messageSchema)

export const messagePageQuerySchema = z.object({
  /** Message id: return messages strictly older than it. */
  before: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(MESSAGE_PAGE_SIZE),
})

/** Thread replies: oldest first; `nextCursor` continues after the last reply. */
export const threadQuerySchema = z.object({
  after: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
})

export const threadResponseSchema = z.object({
  parent: messageSchema,
  items: z.array(messageSchema),
  nextCursor: z.string().nullable(),
})

export const sendMessageInputSchema = z.object({
  content: messageContentSchema,
  /** Client-generated id echoed in the realtime event, so the sender can match its optimistic row. */
  clientMessageId: z.uuid().optional(),
})

export const editMessageInputSchema = z.object({ content: messageContentSchema })

export const reactionEmojiSchema = z.string().trim().min(1).max(LIMITS.EMOJI_MAX)

export const toggleReactionInputSchema = z.object({ emoji: reactionEmojiSchema })

export const reactionUpdateSchema = z.object({
  messageId: idSchema,
  destination: destinationSchema,
  parentMessageId: idSchema.nullable(),
  reactions: z.array(reactionSummarySchema),
})

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export const searchMessagesQuerySchema = z.object({
  q: z.string().trim().min(2, 'Type at least 2 characters').max(100),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export const searchResultSchema = z.object({
  messageId: idSchema,
  parentMessageId: idSchema.nullable(),
  destination: destinationSchema.extend({ name: z.string() }),
  author: publicUserSchema,
  createdAt: isoDateTimeSchema,
  /** Plain text around the first match (render as text, never HTML). */
  snippet: z.string(),
})

export const searchResultsResponseSchema = z.object({ items: z.array(searchResultSchema) })
