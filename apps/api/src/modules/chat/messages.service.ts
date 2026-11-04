import {
  canDeleteMessage,
  canEditMessage,
  canPostMessage,
  canReactToMessage,
  canReplyToMessage,
  canViewDestination,
  type Message,
  type MessagePage,
  type messagePageQuerySchema,
  type ReactionSummary,
  SERVER_EVENTS,
  type ThreadResponse,
  type threadQuerySchema,
} from '@syncspace/shared'
import type { z } from 'zod'

import { AppError, badRequest } from '@/lib/errors'
import { authorize, toMessageContext } from '@/lib/permissions'
import { getPrisma } from '@/lib/prisma'
import { isRecordNotFound, isUniqueViolation } from '@/lib/prisma-errors'
import {
  attachmentRows,
  discardObjects,
  requireStorage,
  storeFiles,
  withStoredFiles,
} from '@/modules/attachments/attachments.service'
import type { IncomingFile } from '@/modules/attachments/files'
import { notifyConversationMessage } from '@/modules/notifications/triggers'
import { realtime } from '@/sockets/realtime'

import { destinationAudience, type DestinationAccess, loadMessage } from './destinations'
import { messageSelect, type MessageRow, summariseReactions, toMessageDto } from './presenters'
import { advanceReadCursor } from './read-state.service'

/**
 * One message service for every destination (channels and conversations).
 * Writes go to the database first; realtime events are emitted only after the
 * write committed and carry the full DTO so clients update caches in place.
 */

function messageContextFor(access: DestinationAccess, message: MessageRow) {
  return toMessageContext(
    message,
    access.policy.kind === 'channel'
      ? { channel: access.policy.channel }
      : { conversation: access.policy.conversation },
  )
}

function postingDenied(access: DestinationAccess): string {
  if (access.kind === 'channel' && access.channel.archivedAt) {
    return 'This channel is archived. It is read-only.'
  }
  if (access.kind === 'channel' && access.channel.type === 'PRIVATE') {
    return 'Only members of this private channel can post in it.'
  }
  return 'You cannot post here.'
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

/**
 * Keyset pagination on (created_at, id), newest page first. Page items are
 * returned oldest -> newest; `nextCursor` (the oldest id) fetches older pages.
 * Thread replies are not part of the main timeline.
 */
export async function listMessages(
  access: DestinationAccess,
  query: z.output<typeof messagePageQuerySchema>,
): Promise<MessagePage> {
  const prisma = getPrisma()
  const base = { ...access.messageWhere, parentMessageId: null }

  let before: { id: string; createdAt: Date } | null = null
  if (query.before) {
    before = await prisma.message.findFirst({
      where: { ...base, id: query.before },
      select: { id: true, createdAt: true },
    })
    if (!before) throw badRequest('Unknown pagination cursor')
  }

  const rows = await prisma.message.findMany({
    where: {
      ...base,
      ...(before && {
        OR: [
          { createdAt: { lt: before.createdAt } },
          { createdAt: before.createdAt, id: { lt: before.id } },
        ],
      }),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
    select: messageSelect,
  })

  const hasMore = rows.length > query.limit
  const page = rows.slice(0, query.limit).reverse()
  return {
    items: page.map(toMessageDto),
    nextCursor: hasMore ? (page[0]?.id ?? null) : null,
  }
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

interface SendInput {
  content: string
  clientMessageId?: string | undefined
}

/**
 * Creates a message (text, files or both). Files are validated and stored
 * BEFORE the transaction; the message and its attachment rows are then
 * written together. If the transaction fails, the stored objects are removed
 * (withStoredFiles), so no object outlives a failed send.
 */
async function createMessage(
  access: DestinationAccess,
  input: SendInput,
  parent: MessageRow | null,
  files: IncomingFile[],
): Promise<Message> {
  const prisma = getPrisma()
  const userId = access.workspace.actor.userId
  if (!input.content && files.length === 0) {
    const message = 'Write a message or attach a file.'
    throw new AppError('VALIDATION_ERROR', message, { issues: [{ path: 'content', message }] })
  }
  const stored = await storeFiles(access.workspace.workspaceId, files)

  const row = await withStoredFiles(stored, () =>
    prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          workspaceId: access.workspace.workspaceId,
          authorId: userId,
          ...access.messageWhere,
          parentMessageId: parent?.id ?? null,
          content: input.content,
        },
        select: { id: true },
      })
      if (stored.length > 0) {
        await tx.attachment.createMany({
          data: attachmentRows(
            stored,
            { messageId: message.id },
            access.workspace.workspaceId,
            userId,
            requireStorage().driver,
          ),
        })
      }
      const created = await tx.message.findUniqueOrThrow({
        where: { id: message.id },
        select: messageSelect,
      })
      if (access.kind === 'conversation') {
        // Sidebar ordering ("recent conversations").
        await tx.conversation.update({
          where: { id: access.conversation.id },
          data: { updatedAt: created.createdAt },
        })
      }
      if (!parent) {
        // The author has obviously read their own message.
        await advanceReadCursor(tx, access, userId, created)
      }
      return created
    }),
  )

  const message = toMessageDto(row)
  const parentSummary = parent
    ? {
        id: parent.id,
        replyCount: await prisma.message.count({
          where: { parentMessageId: parent.id, deletedAt: null },
        }),
      }
    : null

  realtime.emit(await destinationAudience(access), SERVER_EVENTS.MESSAGE_CREATED, {
    message,
    clientMessageId: input.clientMessageId ?? null,
    parent: parentSummary,
  })
  if (access.kind === 'conversation') {
    await notifyConversationMessage(
      {
        id: access.conversation.id,
        type: access.conversation.type,
        name: access.conversation.name,
        participantIds: access.conversation.participants.map((p) => p.user.id),
      },
      message,
    )
  }
  return message
}

/** Authorization happens before any file is stored. */
export function sendMessage(
  access: DestinationAccess,
  input: SendInput,
  files: IncomingFile[] = [],
): Promise<Message> {
  authorize(canPostMessage(access.workspace.actor, access.policy), postingDenied(access))
  return createMessage(access, input, null, files)
}

// ---------------------------------------------------------------------------
// Edit / delete (author edits; author or channel moderators delete)
// ---------------------------------------------------------------------------

export async function editMessage(userId: string, messageId: string, content: string) {
  const { message, access } = await loadMessage(userId, messageId)
  const context = messageContextFor(access, message)
  authorize(
    canEditMessage(access.workspace.actor, context),
    message.authorId !== userId
      ? 'You can only edit your own messages.'
      : message.deletedAt
        ? 'Deleted messages cannot be edited.'
        : postingDenied(access),
  )

  const row = await getPrisma().message.update({
    where: { id: message.id },
    data: { content, editedAt: new Date() },
    select: messageSelect,
  })
  const dto = toMessageDto(row)
  realtime.emit(await destinationAudience(access), SERVER_EVENTS.MESSAGE_UPDATED, { message: dto })
  return dto
}

/**
 * Soft delete: the row stays (threads and reactions keep their anchor), its
 * content is redacted and clients show "Message deleted".
 */
export async function deleteMessage(userId: string, messageId: string) {
  const { message, access } = await loadMessage(userId, messageId)
  authorize(
    canDeleteMessage(access.workspace.actor, messageContextFor(access, message)),
    access.kind === 'conversation'
      ? 'You can only delete your own messages in conversations.'
      : 'You can only delete your own messages.',
  )

  return softDelete(access, message.id)
}

/** Redacts the message and removes its files (rows now, objects right after commit). */
async function softDelete(access: DestinationAccess, messageId: string): Promise<Message> {
  const { row, keys } = await getPrisma().$transaction(async (tx) => {
    const files = await tx.attachment.findMany({
      where: { messageId },
      select: { storageKey: true },
    })
    await tx.attachment.deleteMany({ where: { messageId } })
    const updated = await tx.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), content: '' },
      select: messageSelect,
    })
    return { row: updated, keys: files.map((file) => file.storageKey) }
  })
  await discardObjects(keys)
  const dto = toMessageDto(row)
  realtime.emit(await destinationAudience(access), SERVER_EVENTS.MESSAGE_DELETED, { message: dto })
  return dto
}

/**
 * Removes one file from a message (its author only, like editing). A message
 * left with neither text nor files is deleted.
 */
export async function removeMessageAttachment(
  userId: string,
  attachment: { id: string; messageId: string; storageKey: string | null },
): Promise<Message> {
  const { message, access } = await loadMessage(userId, attachment.messageId)
  authorize(
    canEditMessage(access.workspace.actor, messageContextFor(access, message)),
    'You can only remove files from your own messages.',
  )
  if (!message.content && message.attachments.length <= 1) {
    return softDelete(access, message.id)
  }
  const row = await getPrisma().$transaction(async (tx) => {
    await tx.attachment.delete({ where: { id: attachment.id } })
    return tx.message.update({
      where: { id: message.id },
      data: { editedAt: new Date() },
      select: messageSelect,
    })
  })
  await discardObjects([attachment.storageKey])
  const dto = toMessageDto(row)
  realtime.emit(await destinationAudience(access), SERVER_EVENTS.MESSAGE_UPDATED, { message: dto })
  return dto
}

// ---------------------------------------------------------------------------
// Threads (one level deep; the database also enforces it)
// ---------------------------------------------------------------------------

export async function listReplies(
  userId: string,
  messageId: string,
  query: z.output<typeof threadQuerySchema>,
): Promise<ThreadResponse> {
  const { message, access } = await loadMessage(userId, messageId)
  authorize(canViewDestination(access.workspace.actor, access.policy))
  if (message.parentMessageId) throw badRequest('Replies cannot have their own thread.')

  const prisma = getPrisma()
  let after: { id: string; createdAt: Date } | null = null
  if (query.after) {
    after = await prisma.message.findFirst({
      where: { id: query.after, parentMessageId: message.id },
      select: { id: true, createdAt: true },
    })
    if (!after) throw badRequest('Unknown pagination cursor')
  }

  const rows = await prisma.message.findMany({
    where: {
      parentMessageId: message.id,
      ...(after && {
        OR: [
          { createdAt: { gt: after.createdAt } },
          { createdAt: after.createdAt, id: { gt: after.id } },
        ],
      }),
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: query.limit + 1,
    select: messageSelect,
  })
  const hasMore = rows.length > query.limit
  const items = rows.slice(0, query.limit)
  return {
    parent: toMessageDto(message),
    items: items.map(toMessageDto),
    nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
  }
}

export async function replyToMessage(
  userId: string,
  messageId: string,
  input: SendInput,
  files: IncomingFile[] = [],
): Promise<Message> {
  const { message, access } = await loadMessage(userId, messageId)
  authorize(
    canReplyToMessage(access.workspace.actor, messageContextFor(access, message)),
    message.parentMessageId
      ? 'Threads are one level deep: reply to the original message.'
      : message.deletedAt
        ? 'You cannot reply to a deleted message.'
        : postingDenied(access),
  )
  return createMessage(access, input, message, files)
}

// ---------------------------------------------------------------------------
// Reactions (toggle)
// ---------------------------------------------------------------------------

export async function toggleReaction(userId: string, messageId: string, emoji: string) {
  const { message, access } = await loadMessage(userId, messageId)
  authorize(
    canReactToMessage(access.workspace.actor, messageContextFor(access, message)),
    message.deletedAt ? 'You cannot react to a deleted message.' : postingDenied(access),
  )

  const prisma = getPrisma()
  const key = { messageId_userId_emoji: { messageId: message.id, userId, emoji } }
  const existing = await prisma.messageReaction.findUnique({ where: key, select: { emoji: true } })
  try {
    if (existing) await prisma.messageReaction.delete({ where: key })
    else await prisma.messageReaction.create({ data: { messageId: message.id, userId, emoji } })
  } catch (error) {
    // A concurrent toggle from another tab already applied the same change.
    if (!isUniqueViolation(error) && !isRecordNotFound(error)) throw error
  }

  const reactions: ReactionSummary[] = summariseReactions(
    await prisma.messageReaction.findMany({
      where: { messageId: message.id },
      select: { emoji: true, userId: true },
      orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }],
    }),
  )
  const payload = {
    messageId: message.id,
    destination: access.destination,
    parentMessageId: message.parentMessageId,
    reactions,
  }
  realtime.emit(await destinationAudience(access), SERVER_EVENTS.REACTION_UPDATED, payload)
  return payload
}
