import type { ChannelSummary, Message } from '@syncspace/shared'
import { describe, expect, it } from 'vitest'

import { formatCount, formatRelative } from '@/lib/format'

import {
  bumpUnread,
  firstUnreadId,
  flattenTimeline,
  insertMessage,
  insertOptimistic,
  removeOptimistic,
  setOptimisticStatus,
  type TimelineData,
  upsertChannel,
} from './cache'

const ME = '01920000-7c00-7000-8000-000000000001'
const THEM = '01920000-7c00-7000-8000-000000000002'

function message(id: string, createdAt: string, authorId = THEM, content = id): Message {
  return {
    id,
    workspaceId: 'w',
    destination: { kind: 'channel', id: 'c' },
    parentMessageId: null,
    author: { id: authorId, name: authorId === ME ? 'Me' : 'Them', avatarUrl: null },
    content,
    createdAt,
    editedAt: null,
    deletedAt: null,
    reactions: [],
    replyCount: 0,
    attachments: [],
  }
}

function timeline(...pages: Message[][]): TimelineData {
  return {
    pages: pages.map((items) => ({ items, nextCursor: null })),
    pageParams: pages.map(() => undefined),
  }
}

const t = (n: number) => `2026-01-01T00:00:0${String(n)}.000Z`

describe('timeline cache', () => {
  it('appends new messages in order and ignores duplicates by id', () => {
    let data = timeline([message('a', t(1))])
    data = insertMessage(data, message('b', t(2))) ?? data
    data = insertMessage(data, message('b', t(2))) ?? data
    expect(flattenTimeline(data).map((m) => m.id)).toEqual(['a', 'b'])
  })

  it('replaces the optimistic row when the REST response or socket echo arrives (either order)', () => {
    const clientMessageId = 'client-1'
    const optimistic = {
      ...message('temp:client-1', t(3), ME, 'hi'),
      clientMessageId,
      status: 'sending' as const,
    }
    const confirmed = message('server-1', t(3), ME, 'hi')

    // Socket echo first, then REST response.
    let data = insertOptimistic(timeline([message('a', t(1))]), optimistic)
    data = insertMessage(data, confirmed, clientMessageId)
    data = insertMessage(data, confirmed, clientMessageId)
    expect(flattenTimeline(data).map((m) => m.id)).toEqual(['a', 'server-1'])

    // REST response first, then an echo without the client id (another tab's format).
    let other = insertOptimistic(timeline([message('a', t(1))]), optimistic)
    other = insertMessage(other, confirmed, clientMessageId)
    other = insertMessage(other, confirmed)
    expect(flattenTimeline(other).map((m) => m.id)).toEqual(['a', 'server-1'])
  })

  it('marks failed sends and can discard them', () => {
    const optimistic = {
      ...message('temp:x', t(2), ME),
      clientMessageId: 'x',
      status: 'sending' as const,
    }
    let data = insertOptimistic(timeline([]), optimistic)
    data = setOptimisticStatus(data, 'x', 'failed')
    expect(flattenTimeline(data)[0]?.status).toBe('failed')
    data = removeOptimistic(data, 'x')
    expect(flattenTimeline(data)).toEqual([])
  })

  it('flattens newest-first pages into one chronological list', () => {
    const data = timeline([message('c', t(3))], [message('a', t(1)), message('b', t(2))])
    expect(flattenTimeline(data).map((m) => m.id)).toEqual(['a', 'b', 'c'])
  })

  it('finds the first unread message from someone else', () => {
    const messages = [message('a', t(1)), message('mine', t(2), ME), message('b', t(3))]
    expect(firstUnreadId(messages, t(1), ME)).toBe('b')
    expect(firstUnreadId(messages, t(3), ME)).toBeNull()
  })
})

describe('sidebar cache', () => {
  const base: ChannelSummary = {
    id: 'c1',
    workspaceId: 'w',
    name: 'general',
    slug: 'general',
    description: null,
    type: 'PUBLIC',
    archivedAt: null,
    createdById: null,
    memberCount: null,
    createdAt: t(1),
    isMember: true,
    unreadCount: 3,
    lastReadAt: t(1),
    lastReadMessageId: null,
  }

  it('keeps per-viewer unread state when a channel update arrives', () => {
    const updated = upsertChannel([base], { ...base, name: 'everyone' })
    expect(updated?.[0]).toMatchObject({ name: 'everyone', unreadCount: 3 })
  })

  it('caps unread counts', () => {
    const list = bumpUnread([{ ...base, unreadCount: 100 }], 'c1')
    expect(list?.[0]?.unreadCount).toBe(100)
    expect(formatCount(100, 100)).toBe('99+')
    expect(formatCount(7, 100)).toBe('7')
  })

  it('formats relative times', () => {
    const now = new Date('2026-01-01T12:00:00Z')
    expect(formatRelative('2026-01-01T11:59:30Z', now)).toBe('just now')
    expect(formatRelative('2026-01-01T11:55:00Z', now)).toBe('5 minutes ago')
    expect(formatRelative('2026-01-01T09:00:00Z', now)).toBe('3 hours ago')
  })
})
