import { LIMITS, type ReadCursor, SERVER_EVENTS, rooms } from '@syncspace/shared'

import { AppError } from '@/lib/errors'
import { getPrisma } from '@/lib/prisma'
import { realtime } from '@/sockets/realtime'

import type { DestinationAccess } from './destinations'

type Db = Pick<ReturnType<typeof getPrisma>, 'channelReadState' | 'conversationReadState'>

/**
 * Read state semantics (see docs/CHAT.md):
 * - one cursor per user per destination; everything with created_at <= last_read_at is read;
 * - the cursor never moves backwards;
 * - unread = top-level, non-deleted messages by OTHER people after the cursor — or after the
 *   viewer joined the workspace/conversation when they have never read it — capped at
 *   LIMITS.UNREAD_COUNT_CAP. Thread replies do not count toward the destination's unread.
 */

/**
 * Moves the viewer's cursor forward to `message` (no-op if already past it).
 * Race-safe inside a transaction: insert-if-absent, then a forward-only update.
 */
export async function advanceReadCursor(
  db: Db,
  access: DestinationAccess,
  userId: string,
  message: { id: string; createdAt: Date },
): Promise<ReadCursor> {
  const data = { lastReadAt: message.createdAt, lastReadMessageId: message.id }
  let row: { lastReadAt: Date; lastReadMessageId: string | null } | null

  if (access.kind === 'channel') {
    const key = { channelId: access.channel.id, userId }
    await db.channelReadState.createMany({
      data: [{ ...key, workspaceId: access.workspace.workspaceId, ...data }],
      skipDuplicates: true,
    })
    await db.channelReadState.updateMany({
      where: { ...key, lastReadAt: { lt: message.createdAt } },
      data,
    })
    row = await db.channelReadState.findUnique({
      where: { channelId_userId: key },
      select: { lastReadAt: true, lastReadMessageId: true },
    })
  } else {
    const key = { conversationId: access.conversation.id, userId }
    await db.conversationReadState.createMany({ data: [{ ...key, ...data }], skipDuplicates: true })
    await db.conversationReadState.updateMany({
      where: { ...key, lastReadAt: { lt: message.createdAt } },
      data,
    })
    row = await db.conversationReadState.findUnique({
      where: { conversationId_userId: key },
      select: { lastReadAt: true, lastReadMessageId: true },
    })
  }

  return {
    lastReadAt: (row?.lastReadAt ?? message.createdAt).toISOString(),
    lastReadMessageId: row?.lastReadMessageId ?? message.id,
  }
}

/** POST .../read — the message must belong to this destination. Syncs the user's other tabs. */
export async function markRead(access: DestinationAccess, messageId: string): Promise<ReadCursor> {
  const prisma = getPrisma()
  const message = await prisma.message.findFirst({
    where: { id: messageId, ...access.messageWhere },
    select: { id: true, createdAt: true },
  })
  if (!message) {
    throw new AppError('BAD_REQUEST', 'That message does not belong to this conversation.')
  }
  const userId = access.workspace.actor.userId
  const cursor = await advanceReadCursor(prisma, access, userId, message)
  realtime.emit(rooms.user(userId), SERVER_EVENTS.READ_UPDATED, {
    destination: access.destination,
    cursor,
  })
  return cursor
}

export interface UnreadRow {
  id: string
  lastReadAt: Date | null
  lastReadMessageId: string | null
  unread: number
}

/**
 * Unread counts for many channels in one query. Each count stops at the cap
 * (LIMIT inside the subquery), so a huge backlog costs no more than the cap.
 */
export async function channelUnreadCounts(
  userId: string,
  joinedAt: Date,
  channelIds: string[],
): Promise<Map<string, UnreadRow>> {
  if (channelIds.length === 0) return new Map()
  const rows = await getPrisma().$queryRaw<UnreadRow[]>`
    SELECT c.id::text AS "id",
           rs.last_read_at AS "lastReadAt",
           rs.last_read_message_id::text AS "lastReadMessageId",
           (
             SELECT count(*)::int FROM (
               SELECT 1 FROM messages m
               WHERE m.channel_id = c.id
                 AND m.parent_message_id IS NULL
                 AND m.deleted_at IS NULL
                 AND m.author_id <> ${userId}::uuid
                 AND m.created_at > COALESCE(rs.last_read_at, ${joinedAt})
               LIMIT ${LIMITS.UNREAD_COUNT_CAP}
             ) capped
           ) AS "unread"
    FROM channels c
    LEFT JOIN channel_read_states rs ON rs.channel_id = c.id AND rs.user_id = ${userId}::uuid
    WHERE c.id = ANY(${channelIds}::uuid[])`
  return new Map(rows.map((row) => [row.id, row]))
}

/** Unread counts for every conversation the user participates in, in one query. */
export async function conversationUnreadCounts(
  userId: string,
  workspaceId: string,
): Promise<Map<string, UnreadRow & { joinedAt: Date }>> {
  const rows = await getPrisma().$queryRaw<(UnreadRow & { joinedAt: Date })[]>`
    SELECT p.conversation_id::text AS "id",
           p.joined_at AS "joinedAt",
           rs.last_read_at AS "lastReadAt",
           rs.last_read_message_id::text AS "lastReadMessageId",
           (
             SELECT count(*)::int FROM (
               SELECT 1 FROM messages m
               WHERE m.conversation_id = p.conversation_id
                 AND m.parent_message_id IS NULL
                 AND m.deleted_at IS NULL
                 AND m.author_id <> ${userId}::uuid
                 AND m.created_at > COALESCE(rs.last_read_at, p.joined_at)
               LIMIT ${LIMITS.UNREAD_COUNT_CAP}
             ) capped
           ) AS "unread"
    FROM conversation_participants p
    LEFT JOIN conversation_read_states rs
      ON rs.conversation_id = p.conversation_id AND rs.user_id = p.user_id
    WHERE p.user_id = ${userId}::uuid AND p.workspace_id = ${workspaceId}::uuid`
  return new Map(rows.map((row) => [row.id, row]))
}
