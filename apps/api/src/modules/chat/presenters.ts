import type {
  Channel,
  Conversation,
  Destination,
  Message,
  PublicUser,
  ReactionSummary,
} from '@syncspace/shared'

import type { Prisma } from '@/generated/prisma/client'

/**
 * The single place where chat rows become API/socket DTOs. Only public user
 * fields leave the server; deleted messages are redacted.
 */

export const publicUserSelect = {
  id: true,
  name: true,
  avatarUrl: true,
} satisfies Prisma.UserSelect

export function toPublicUser(user: {
  id: string
  name: string
  avatarUrl: string | null
}): PublicUser {
  return { id: user.id, name: user.name, avatarUrl: user.avatarUrl }
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

export const channelSelect = {
  id: true,
  workspaceId: true,
  name: true,
  slug: true,
  description: true,
  type: true,
  archivedAt: true,
  createdById: true,
  createdAt: true,
  _count: { select: { members: true } },
} satisfies Prisma.ChannelSelect

export type ChannelRow = Prisma.ChannelGetPayload<{ select: typeof channelSelect }>

export function toChannelDto(channel: ChannelRow): Channel {
  return {
    id: channel.id,
    workspaceId: channel.workspaceId,
    name: channel.name,
    slug: channel.slug,
    description: channel.description,
    type: channel.type,
    archivedAt: channel.archivedAt?.toISOString() ?? null,
    createdById: channel.createdById,
    memberCount: channel.type === 'PRIVATE' ? channel._count.members : null,
    createdAt: channel.createdAt.toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export const conversationSelect = {
  id: true,
  workspaceId: true,
  type: true,
  name: true,
  createdAt: true,
  updatedAt: true,
  participants: {
    select: { joinedAt: true, user: { select: publicUserSelect } },
    orderBy: { joinedAt: 'asc' },
  },
} satisfies Prisma.ConversationSelect

export type ConversationRow = Prisma.ConversationGetPayload<{ select: typeof conversationSelect }>

export function toConversationDto(conversation: ConversationRow): Conversation {
  return {
    id: conversation.id,
    workspaceId: conversation.workspaceId,
    type: conversation.type,
    name: conversation.name,
    participants: conversation.participants.map((participant) => toPublicUser(participant.user)),
    createdAt: conversation.createdAt.toISOString(),
    lastActivityAt: conversation.updatedAt.toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export const messageSelect = {
  id: true,
  workspaceId: true,
  channelId: true,
  conversationId: true,
  parentMessageId: true,
  authorId: true,
  content: true,
  createdAt: true,
  editedAt: true,
  deletedAt: true,
  author: { select: publicUserSelect },
  reactions: {
    select: { emoji: true, userId: true },
    orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }],
  },
  attachments: {
    select: { id: true, fileName: true, mimeType: true, size: true, url: true },
    orderBy: { createdAt: 'asc' },
  },
  _count: { select: { replies: { where: { deletedAt: null } } } },
} satisfies Prisma.MessageSelect

export type MessageRow = Prisma.MessageGetPayload<{ select: typeof messageSelect }>

export function messageDestination(message: {
  channelId: string | null
  conversationId: string | null
}): Destination {
  // The database guarantees exactly one of the two (messages_destination_xor_check).
  return message.channelId
    ? { kind: 'channel', id: message.channelId }
    : { kind: 'conversation', id: message.conversationId ?? '' }
}

/** Groups reactions by emoji in first-reacted order. */
export function summariseReactions(
  reactions: { emoji: string; userId: string }[],
): ReactionSummary[] {
  const groups = new Map<string, string[]>()
  for (const reaction of reactions) {
    const users = groups.get(reaction.emoji) ?? []
    users.push(reaction.userId)
    groups.set(reaction.emoji, users)
  }
  return [...groups].map(([emoji, userIds]) => ({ emoji, count: userIds.length, userIds }))
}

export function toMessageDto(message: MessageRow): Message {
  const deleted = message.deletedAt !== null
  return {
    id: message.id,
    workspaceId: message.workspaceId,
    destination: messageDestination(message),
    parentMessageId: message.parentMessageId,
    author: toPublicUser(message.author),
    content: deleted ? '' : message.content,
    createdAt: message.createdAt.toISOString(),
    editedAt: message.editedAt?.toISOString() ?? null,
    deletedAt: message.deletedAt?.toISOString() ?? null,
    reactions: deleted ? [] : summariseReactions(message.reactions),
    replyCount: message._count.replies,
    attachments: deleted ? [] : message.attachments,
  }
}
