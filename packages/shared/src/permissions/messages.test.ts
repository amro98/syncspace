import { describe, expect, it } from 'vitest'

import type { ConversationContext, MessageContext, MessageDestination } from './context'
import {
  canAccessConversation,
  canAddConversationParticipant,
  canLeaveConversation,
  canPostInConversation,
  canRenameConversation,
  canStartConversation,
} from './conversations'
import {
  canDeleteMessage,
  canEditMessage,
  canModerateMessage,
  canReactToMessage,
  canReplyToMessage,
  canViewDestination,
} from './messages'
import { ADMIN, channel, matrix, MEMBER, OUTSIDER, OWNER } from './test-fixtures'

const dm = (isParticipant: boolean): ConversationContext => ({ type: 'DIRECT', isParticipant })
const group = (isParticipant: boolean): ConversationContext => ({ type: 'GROUP', isParticipant })

function message(
  destination: MessageDestination,
  overrides: Partial<Omit<MessageContext, 'destination'>> = {},
): MessageContext {
  return { authorId: MEMBER.userId, isDeleted: false, isReply: false, destination, ...overrides }
}

const inPublic: MessageDestination = { kind: 'channel', channel: channel() }
const inArchived: MessageDestination = { kind: 'channel', channel: channel({ isArchived: true }) }
const inPrivateNonMember: MessageDestination = {
  kind: 'channel',
  channel: channel({ type: 'PRIVATE', isMember: false }),
}
const inDmAsParticipant: MessageDestination = { kind: 'conversation', conversation: dm(true) }
const inDmAsOutsider: MessageDestination = { kind: 'conversation', conversation: dm(false) }

describe('conversation access', () => {
  it.each(matrix({ OWNER: true, ADMIN: true, MEMBER: true, OUTSIDER: false }))(
    '%s as a participant can read and post: %s',
    (_name, actor, expected) => {
      expect(canAccessConversation(actor, dm(true))).toBe(expected)
      expect(canPostInConversation(actor, group(true))).toBe(expected)
    },
  )

  it.each(matrix({ OWNER: false, ADMIN: false, MEMBER: false, OUTSIDER: false }))(
    '%s as a non-participant has no access, admins included: %s',
    (_name, actor, expected) => {
      expect(canAccessConversation(actor, dm(false))).toBe(expected)
      expect(canAccessConversation(actor, group(false))).toBe(expected)
    },
  )

  it('lets any member start a conversation', () => {
    expect(canStartConversation(MEMBER)).toBe(true)
    expect(canStartConversation(OUTSIDER)).toBe(false)
  })

  it('allows adding, renaming and leaving only for GROUP conversations', () => {
    expect(canAddConversationParticipant(MEMBER, group(true))).toBe(true)
    expect(canRenameConversation(MEMBER, group(true))).toBe(true)
    expect(canLeaveConversation(MEMBER, group(true))).toBe(true)

    expect(canAddConversationParticipant(MEMBER, dm(true))).toBe(false)
    expect(canRenameConversation(MEMBER, dm(true))).toBe(false)
    expect(canLeaveConversation(MEMBER, dm(true))).toBe(false)

    expect(canAddConversationParticipant(OWNER, group(false))).toBe(false)
  })
})

describe('editing messages (author only)', () => {
  it('lets the author edit their own message', () => {
    expect(canEditMessage(MEMBER, message(inPublic))).toBe(true)
    expect(canEditMessage(MEMBER, message(inDmAsParticipant))).toBe(true)
  })

  it.each([
    ['OWNER', OWNER],
    ['ADMIN', ADMIN],
  ] as const)('does not let the %s edit someone else’s message', (_name, actor) => {
    expect(canEditMessage(actor, message(inPublic))).toBe(false)
  })

  it('blocks edits to deleted messages and in read-only places', () => {
    expect(canEditMessage(MEMBER, message(inPublic, { isDeleted: true }))).toBe(false)
    expect(canEditMessage(MEMBER, message(inArchived))).toBe(false)
  })

  it('blocks edits once the author has lost access', () => {
    expect(canEditMessage(MEMBER, message(inPrivateNonMember))).toBe(false)
    expect(canEditMessage({ ...MEMBER, role: null }, message(inPublic))).toBe(false)
  })
})

describe('deleting messages', () => {
  it('lets the author delete where they can post', () => {
    expect(canDeleteMessage(MEMBER, message(inPublic))).toBe(true)
    expect(canDeleteMessage(MEMBER, message(inDmAsParticipant))).toBe(true)
    expect(canModerateMessage(MEMBER, message(inPublic))).toBe(false)
  })

  it('does not let members delete other people’s messages', () => {
    const someoneElses = message(inPublic, { authorId: 'u-someone' })
    expect(canDeleteMessage(MEMBER, someoneElses)).toBe(false)
  })

  it('lets owners and admins moderate any channel message, even private and archived', () => {
    const someoneElses = { authorId: 'u-someone' }
    for (const actor of [OWNER, ADMIN]) {
      expect(canDeleteMessage(actor, message(inPublic, someoneElses))).toBe(true)
      expect(canDeleteMessage(actor, message(inPrivateNonMember, someoneElses))).toBe(true)
      expect(canDeleteMessage(actor, message(inArchived, someoneElses))).toBe(true)
      expect(canModerateMessage(actor, message(inPublic, someoneElses))).toBe(true)
    }
  })

  it('never lets admins moderate direct or group conversations', () => {
    const someoneElses = { authorId: 'u-someone' }
    expect(canDeleteMessage(OWNER, message(inDmAsParticipant, someoneElses))).toBe(false)
    expect(canDeleteMessage(ADMIN, message(inDmAsOutsider, someoneElses))).toBe(false)
    expect(canModerateMessage(OWNER, message(inDmAsParticipant, someoneElses))).toBe(false)
  })

  it('does not delete twice', () => {
    expect(canDeleteMessage(OWNER, message(inPublic, { isDeleted: true }))).toBe(false)
  })
})

describe('reactions, replies and visibility', () => {
  it('follows the destination’s posting rules', () => {
    expect(canReactToMessage(MEMBER, message(inPublic))).toBe(true)
    expect(canReactToMessage(MEMBER, message(inArchived))).toBe(false)
    expect(canReactToMessage(ADMIN, message(inPrivateNonMember))).toBe(false)
    expect(canReactToMessage(MEMBER, message(inPublic, { isDeleted: true }))).toBe(false)
  })

  it('keeps threads one level deep', () => {
    expect(canReplyToMessage(MEMBER, message(inPublic))).toBe(true)
    expect(canReplyToMessage(MEMBER, message(inPublic, { isReply: true }))).toBe(false)
  })

  it('lets admins view private channels but not other people’s DMs', () => {
    expect(canViewDestination(ADMIN, inPrivateNonMember)).toBe(true)
    expect(canViewDestination(ADMIN, inDmAsOutsider)).toBe(false)
    expect(canViewDestination(MEMBER, inPrivateNonMember)).toBe(false)
  })
})
