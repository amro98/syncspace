import {
  type Notification,
  type NotificationEntityType,
  type NotificationLink,
  type NotificationPage,
  type NotificationType,
  rooms,
  SERVER_EVENTS,
} from '@syncspace/shared'

import type { Prisma } from '@/generated/prisma/client'
import { ensureVisible } from '@/lib/permissions'
import { getPrisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { publicUserSelect, toPublicUser } from '@/modules/chat/presenters'
import { realtime } from '@/sockets/realtime'

/**
 * The notification inbox. Notifications are created only for events worth an
 * interruption (see docs/TASKS.md §Notifications), always AFTER the triggering
 * write has committed, and pushed to the recipient's `user:<id>` room.
 *
 * Rows store a loose pointer (`entityType` + `entityId`). The navigation
 * `link` is resolved when notifications are read, so it follows tasks that
 * moved between boards' columns and is `null` once the target is gone.
 */

export interface NewNotification {
  userId: string
  workspaceId: string
  actorId: string | null
  type: NotificationType
  title: string
  body?: string | null
  entityType: NotificationEntityType
  entityId: string
}

const notificationSelect = {
  id: true,
  userId: true,
  type: true,
  title: true,
  body: true,
  entityType: true,
  entityId: true,
  readAt: true,
  createdAt: true,
  workspace: { select: { id: true, name: true } },
  actor: { select: publicUserSelect },
} satisfies Prisma.NotificationSelect

type NotificationRow = Prisma.NotificationGetPayload<{ select: typeof notificationSelect }>

const BODY_MAX = 280

function clip(text: string | null | undefined): string | null {
  if (!text) return null
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > BODY_MAX ? `${flat.slice(0, BODY_MAX - 1)}…` : flat
}

/** Resolves navigation links for a batch of rows (one query per entity kind). */
async function resolveLinks(rows: NotificationRow[]): Promise<Map<string, NotificationLink>> {
  const prisma = getPrisma()
  const idsOf = (type: NotificationEntityType) =>
    rows.flatMap((row) => (row.entityType === type && row.entityId ? [row.entityId] : []))

  const [tasks, messages, conversations, channels] = await Promise.all([
    idsOf('TASK').length
      ? prisma.task.findMany({
          where: { id: { in: idsOf('TASK') } },
          select: { id: true, workspaceId: true, boardId: true },
        })
      : [],
    idsOf('MESSAGE').length
      ? prisma.message.findMany({
          where: { id: { in: idsOf('MESSAGE') }, deletedAt: null },
          select: {
            id: true,
            workspaceId: true,
            channelId: true,
            conversationId: true,
            parentMessageId: true,
          },
        })
      : [],
    idsOf('CONVERSATION').length
      ? prisma.conversation.findMany({
          where: { id: { in: idsOf('CONVERSATION') } },
          select: { id: true, workspaceId: true },
        })
      : [],
    idsOf('CHANNEL').length
      ? prisma.channel.findMany({
          where: { id: { in: idsOf('CHANNEL') } },
          select: { id: true, workspaceId: true },
        })
      : [],
  ])

  const links = new Map<string, NotificationLink>()
  for (const task of tasks) {
    links.set(task.id, {
      kind: 'task',
      workspaceId: task.workspaceId,
      boardId: task.boardId,
      taskId: task.id,
    })
  }
  for (const message of messages) {
    const destination = message.channelId
      ? ({ kind: 'channel', id: message.channelId } as const)
      : ({ kind: 'conversation', id: message.conversationId ?? '' } as const)
    links.set(message.id, {
      kind: 'message',
      workspaceId: message.workspaceId,
      destination,
      messageId: message.id,
      threadId: message.parentMessageId ?? message.id,
    })
  }
  for (const conversation of conversations) {
    links.set(conversation.id, {
      kind: 'destination',
      workspaceId: conversation.workspaceId,
      destination: { kind: 'conversation', id: conversation.id },
    })
  }
  for (const channel of channels) {
    links.set(channel.id, {
      kind: 'destination',
      workspaceId: channel.workspaceId,
      destination: { kind: 'channel', id: channel.id },
    })
  }
  for (const row of rows) {
    if (row.entityType === 'WORKSPACE' && row.entityId && row.workspace) {
      links.set(row.entityId, { kind: 'workspace', workspaceId: row.workspace.id })
    }
  }
  return links
}

async function toDtos(rows: NotificationRow[]): Promise<Notification[]> {
  const links = await resolveLinks(rows)
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    workspace: row.workspace,
    actor: row.actor ? toPublicUser(row.actor) : null,
    entityType: row.entityType,
    entityId: row.entityId,
    link: row.entityId ? (links.get(row.entityId) ?? null) : null,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }))
}

export function unreadCount(userId: string): Promise<number> {
  return getPrisma().notification.count({ where: { userId, readAt: null } })
}

/**
 * Creates notifications (never for the actor themself) and pushes each to its
 * recipient. Call only after the triggering transaction has committed. A
 * failure here is logged, never surfaced: the triggering action succeeded.
 */
export async function notify(items: NewNotification[]): Promise<void> {
  const rows = items.filter((item) => item.userId !== item.actorId)
  if (rows.length === 0) return
  try {
    const prisma = getPrisma()
    const created = await prisma.notification.createManyAndReturn({
      data: rows.map((row) => ({ ...row, body: clip(row.body) })),
      select: { id: true },
    })
    const fresh = await prisma.notification.findMany({
      where: { id: { in: created.map((row) => row.id) } },
      select: notificationSelect,
    })
    const dtos = await toDtos(fresh)
    for (const [index, row] of fresh.entries()) {
      const notification = dtos[index]
      if (!notification) continue
      realtime.emit(rooms.user(row.userId), SERVER_EVENTS.NOTIFICATION_CREATED, {
        notification,
        unreadCount: await unreadCount(row.userId),
      })
    }
  } catch (error) {
    logger.error({ err: error }, 'Failed to create notifications')
  }
}

/** Inbox page, newest first. Keyset pagination on (createdAt, id). */
export async function listNotifications(
  userId: string,
  query: { filter: 'all' | 'unread'; cursor?: string | undefined; limit: number },
): Promise<NotificationPage> {
  const prisma = getPrisma()
  const where: Prisma.NotificationWhereInput = {
    userId,
    ...(query.filter === 'unread' && { readAt: null }),
  }
  if (query.cursor) {
    const cursor = await prisma.notification.findFirst({
      where: { id: query.cursor, userId },
      select: { id: true, createdAt: true },
    })
    if (cursor) {
      where.OR = [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ]
    }
  }
  const [rows, count] = await Promise.all([
    prisma.notification.findMany({
      where,
      select: notificationSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    }),
    unreadCount(userId),
  ])
  const page = rows.slice(0, query.limit)
  return {
    items: await toDtos(page),
    nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
    unreadCount: count,
  }
}

/** Marks one notification read (or unread again). Only its recipient may. */
export async function markNotification(
  userId: string,
  notificationId: string,
  read: boolean,
): Promise<Notification> {
  const prisma = getPrisma()
  const existing = await prisma.notification.findFirst({
    where: { id: notificationId, userId },
    select: { readAt: true },
  })
  ensureVisible(existing !== null, 'Notification not found')
  const row = await prisma.notification.update({
    where: { id: notificationId },
    data: { readAt: read ? (existing?.readAt ?? new Date()) : null },
    select: notificationSelect,
  })
  const [notification] = await toDtos([row])
  if (!notification) throw new Error('unreachable')
  realtime.emit(rooms.user(userId), SERVER_EVENTS.NOTIFICATION_UPDATED, {
    notification,
    unreadCount: await unreadCount(userId),
  })
  return notification
}

export async function markAllNotificationsRead(
  userId: string,
): Promise<{ readAt: string; unreadCount: number }> {
  const readAt = new Date()
  await getPrisma().notification.updateMany({ where: { userId, readAt: null }, data: { readAt } })
  const payload = { readAt: readAt.toISOString(), unreadCount: 0 }
  realtime.emit(rooms.user(userId), SERVER_EVENTS.NOTIFICATIONS_READ, payload)
  return payload
}
