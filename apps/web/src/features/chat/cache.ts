import {
  type ChannelSummary,
  type ConversationSummary,
  type Destination,
  LIMITS,
  type Message,
  type MessagePage,
  type ReactionSummary,
} from '@syncspace/shared'
import type { InfiniteData } from '@tanstack/react-query'

/**
 * Pure cache transforms for chat data. Socket events and mutation results both
 * flow through these, so ordering of REST responses vs. socket echoes never
 * matters: messages are deduplicated by server id, and optimistic rows are
 * matched by their client-generated `clientMessageId`.
 */

/** A timeline row: a server message, or an optimistic one still being sent / failed. */
export interface TimelineMessage extends Message {
  clientMessageId?: string
  status?: 'sending' | 'failed'
}

export type TimelinePage = MessagePage & { items: TimelineMessage[] }
export type TimelineData = InfiniteData<TimelinePage, string | undefined>

export function destinationKey(destination: Destination): string {
  return `${destination.kind}:${destination.id}`
}

function mapItems(
  data: TimelineData,
  fn: (items: TimelineMessage[]) => TimelineMessage[],
): TimelineData {
  return { ...data, pages: data.pages.map((page) => ({ ...page, items: fn(page.items) })) }
}

function contains(data: TimelineData, predicate: (message: TimelineMessage) => boolean) {
  return data.pages.some((page) => page.items.some(predicate))
}

const byTimeline = (a: TimelineMessage, b: TimelineMessage) =>
  a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt)

/**
 * Inserts a confirmed message into the newest page:
 * - replaces the optimistic row with the same clientMessageId (sender's own tab);
 * - otherwise ignores it if a message with that id is already present (dedupe);
 * - otherwise appends it in timeline order.
 */
export function insertMessage(
  data: TimelineData | undefined,
  message: Message,
  clientMessageId?: string | null,
): TimelineData | undefined {
  if (!data) return data
  if (clientMessageId && contains(data, (m) => m.clientMessageId === clientMessageId)) {
    // Replace the optimistic row, and drop any copy that arrived via the other channel.
    let replaced = false
    return mapItems(data, (items) =>
      items.flatMap((m) => {
        if (m.clientMessageId === clientMessageId && !replaced) {
          replaced = true
          return [message]
        }
        return m.id === message.id ? [] : [m]
      }),
    )
  }
  if (contains(data, (m) => m.id === message.id)) return replaceMessage(data, message)

  const [newest, ...older] = data.pages
  if (!newest) return data
  return {
    ...data,
    pages: [{ ...newest, items: [...newest.items, message].sort(byTimeline) }, ...older],
  }
}

/** Adds an optimistic (sending) row at the end of the newest page. */
export function insertOptimistic(data: TimelineData | undefined, message: TimelineMessage) {
  if (!data) return data
  const [newest, ...older] = data.pages
  if (!newest) return data
  return { ...data, pages: [{ ...newest, items: [...newest.items, message] }, ...older] }
}

export function setOptimisticStatus(
  data: TimelineData | undefined,
  clientMessageId: string,
  status: 'sending' | 'failed',
) {
  if (!data) return data
  return mapItems(data, (items) =>
    items.map((m) => (m.clientMessageId === clientMessageId ? { ...m, status } : m)),
  )
}

export function removeOptimistic(data: TimelineData | undefined, clientMessageId: string) {
  if (!data) return data
  return mapItems(data, (items) => items.filter((m) => m.clientMessageId !== clientMessageId))
}

/** Replaces a message by id (edits, deletions) keeping its position. */
export function replaceMessage(data: TimelineData | undefined, message: Message) {
  if (!data) return data
  return mapItems(data, (items) =>
    items.map((m) => (m.id === message.id ? { ...m, ...message } : m)),
  )
}

export function updateMessage(
  data: TimelineData | undefined,
  messageId: string,
  update: (message: TimelineMessage) => TimelineMessage,
) {
  if (!data) return data
  return mapItems(data, (items) => items.map((m) => (m.id === messageId ? update(m) : m)))
}

export function setReactions(
  data: TimelineData | undefined,
  messageId: string,
  reactions: ReactionSummary[],
) {
  return updateMessage(data, messageId, (m) => ({ ...m, reactions }))
}

/** All messages oldest -> newest (pages are newest-first; items within a page oldest-first). */
export function flattenTimeline(data: TimelineData | undefined): TimelineMessage[] {
  if (!data) return []
  return [...data.pages].reverse().flatMap((page) => page.items)
}

// ---------------------------------------------------------------------------
// Sidebar lists
// ---------------------------------------------------------------------------

type ChannelEventData = Omit<
  ChannelSummary,
  'isMember' | 'unreadCount' | 'lastReadAt' | 'lastReadMessageId'
>

/** Inserts or updates a channel from a broadcast, keeping per-viewer state. */
export function upsertChannel(
  list: ChannelSummary[] | undefined,
  channel: ChannelEventData,
): ChannelSummary[] | undefined {
  if (!list) return list
  const existing = list.find((c) => c.id === channel.id)
  const merged: ChannelSummary = existing
    ? { ...existing, ...channel }
    : {
        ...channel,
        // Broadcasts reach PUBLIC viewers via the workspace room and PRIVATE ones via
        // their user room (members): either way the receiver can post.
        isMember: true,
        unreadCount: 0,
        lastReadAt: channel.createdAt,
        lastReadMessageId: null,
      }
  const others = list.filter((c) => c.id !== channel.id)
  return [...others, merged].sort((a, b) => a.name.localeCompare(b.name))
}

export function removeChannel(list: ChannelSummary[] | undefined, channelId: string) {
  return list?.filter((c) => c.id !== channelId)
}

export function bumpUnread<T extends { id: string; unreadCount: number }>(
  list: T[] | undefined,
  id: string,
): T[] | undefined {
  return list?.map((item) =>
    item.id === id
      ? { ...item, unreadCount: Math.min(item.unreadCount + 1, LIMITS.UNREAD_COUNT_CAP) }
      : item,
  )
}

export function markListRead<
  T extends {
    id: string
    unreadCount: number
    lastReadAt: string | null
    lastReadMessageId: string | null
  },
>(
  list: T[] | undefined,
  id: string,
  cursor: { lastReadAt: string; lastReadMessageId: string | null },
): T[] | undefined {
  return list?.map((item) =>
    item.id === id
      ? {
          ...item,
          unreadCount: 0,
          lastReadAt:
            item.lastReadAt && item.lastReadAt > cursor.lastReadAt
              ? item.lastReadAt
              : cursor.lastReadAt,
          lastReadMessageId: cursor.lastReadMessageId,
        }
      : item,
  )
}

/** Inserts/updates a conversation and keeps the list ordered by recent activity. */
export function upsertConversation(
  list: ConversationSummary[] | undefined,
  conversation: Omit<ConversationSummary, 'unreadCount' | 'lastReadAt' | 'lastReadMessageId'>,
): ConversationSummary[] | undefined {
  if (!list) return list
  const existing = list.find((c) => c.id === conversation.id)
  const merged: ConversationSummary = existing
    ? { ...existing, ...conversation }
    : {
        ...conversation,
        unreadCount: 0,
        lastReadAt: conversation.createdAt,
        lastReadMessageId: null,
      }
  return [...list.filter((c) => c.id !== conversation.id), merged].sort((a, b) =>
    b.lastActivityAt.localeCompare(a.lastActivityAt),
  )
}

/** "Unread messages start here": first message by someone else after the read position. */
export function firstUnreadId(
  messages: TimelineMessage[],
  lastReadAt: string | null | undefined,
  viewerId: string,
): string | null {
  if (!lastReadAt) return null
  const first = messages.find(
    (m) => m.createdAt > lastReadAt && m.author.id !== viewerId && !m.status && !m.deletedAt,
  )
  return first?.id ?? null
}
