import { describe, expect, it } from 'vitest'

import { ada, channelSummary, chatIds, conversationSummary, grace } from '@/test/chat-fixtures'
import { ids } from '@/test/render'

import { formatCount } from '@/lib/format'

import { describeTypers, searchResultPath } from './display'
import { channelPolicy, conversationTitle, postingBlockedReason } from './policy'

const owner = { userId: ada.id, role: 'OWNER' as const }
const memberActor = { userId: ada.id, role: 'MEMBER' as const }

describe('chat display helpers', () => {
  it('formats unread counts with a cap', () => {
    expect(formatCount(0, 100)).toBe('0')
    expect(formatCount(42, 100)).toBe('42')
    expect(formatCount(100, 100)).toBe('99+')
  })

  it('describes who is typing', () => {
    expect(describeTypers([])).toBeNull()
    expect(describeTypers(['Grace'])).toBe('Grace is typing…')
    expect(describeTypers(['Grace', 'Alan'])).toBe('Grace and Alan are typing…')
    expect(describeTypers(['Grace', 'Alan', 'Ada'])).toBe('Several people are typing…')
  })

  it('opens search results in the thread of their top-level message', () => {
    const base = {
      messageId: ids.otherUser,
      author: grace,
      createdAt: '2026-03-02T10:00:00.000Z',
      snippet: 'x',
    }
    expect(
      searchResultPath(ids.workspace, {
        ...base,
        parentMessageId: null,
        destination: { kind: 'channel', id: chatIds.general, name: 'general' },
      }),
    ).toBe(`/app/workspaces/${ids.workspace}/channel/${chatIds.general}?thread=${ids.otherUser}`)
    expect(
      searchResultPath(ids.workspace, {
        ...base,
        parentMessageId: ids.user,
        destination: { kind: 'conversation', id: chatIds.dm, name: 'Grace' },
      }),
    ).toBe(`/app/workspaces/${ids.workspace}/dm/${chatIds.dm}?thread=${ids.user}`)
  })
})

describe('chat policy bridge', () => {
  it('explains why posting is blocked', () => {
    expect(postingBlockedReason(memberActor, channelPolicy(channelSummary()))).toBeNull()
    expect(
      postingBlockedReason(
        owner,
        channelPolicy(channelSummary({ archivedAt: '2026-02-01T00:00:00.000Z' })),
      ),
    ).toMatch(/archived/)
    expect(
      postingBlockedReason(
        owner,
        channelPolicy(channelSummary({ type: 'PRIVATE', isMember: false })),
      ),
    ).toMatch(/workspace admin/)
  })

  it('titles conversations by name or by the other participants', () => {
    expect(conversationTitle(conversationSummary(), ada.id)).toBe('Grace Hopper')
    expect(conversationTitle(conversationSummary({ participants: [ada] }), ada.id)).toBe(
      'Ada Lovelace',
    )
    expect(
      conversationTitle(conversationSummary({ type: 'GROUP', name: 'Launch crew' }), ada.id),
    ).toBe('Launch crew')
  })
})
